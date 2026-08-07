// The Session store: the single seam over every session-scoped table. Exposes
// domain verbs, returns the project's domain types, and owns the session-scoping
// and typed-error invariants. API routes are thin shells over these functions.
//
// Grows one aggregate at a time. Currently: sessions, users, households,
// reactions, decisions, the meeting and its agenda, todos, files and folders.

import { createClient } from '@/utils/supabase/server';
import { CommuteConstraint } from '@/types/user';
import { Household } from '@/types/household';
import { Decision } from '@/types/decisions';
import { MeetingItem, Todo } from '@/types/todos';
import { Meeting } from '@/types/meeting';
import { Folder, SharedFile } from '@/types/files';
import { canMoveFolder, descendantsOf, MAX_FOLDER_DEPTH } from '@/lib/folders';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction, ReactionKind } from '@/types/reactions';
import { Invalid, NotFound } from './errors';
import { resolveToggle } from './reactions';
import { SessionUserRow, toCommuteConstraint } from './mappers';

const REACTION_KINDS: ReactionKind[] = ['love', 'object'];

// A sessions row — now with a human name, an owner account, and the search
// buffer percentage applied to the common ground when searching properties.
export interface SessionRow {
  id: string;
  name: string | null;
  created_by: string | null;
  search_buffer_pct: number;
  created_at?: string;
  updated_at?: string;
}

// A session as it appears in an account's hub: name, the account's role, and a
// glance at who else is in it.
export interface SessionSummary {
  id: string;
  name: string | null;
  role: string;
  members: { id: string; name: string | null }[];
  updatedAt: string | null;
}

// The fields needed to create or replace a participant — a CommuteConstraint
// before the store assigns it an id.
export type CommuteConstraintInput = Omit<CommuteConstraint, 'id'>;

// A session, or NotFound if it doesn't exist.
export async function getSession(id: string): Promise<SessionRow> {
  const db = await createClient();
  const { data, error } = await db.from('sessions').select('*').eq('id', id).single();
  if (error || !data) throw new NotFound('session', id);
  return data as unknown as SessionRow;
}

type MemberRow = { session_id: string; account_id: string; role: string };

// Every session an account belongs to (created or was added to), newest activity
// first, each with its members for avatars/labels.
export async function listSessionsForAccount(accountId: string): Promise<SessionSummary[]> {
  const db = await createClient();

  const { data: mine, error: mineErr } = await db
    .from('session_members')
    .select('session_id, role')
    .eq('account_id', accountId);
  if (mineErr) throw mineErr;
  const ids = ((mine ?? []) as { session_id: string; role: string }[]).map((m) => m.session_id);
  if (ids.length === 0) return [];
  const roleBySession = new Map(
    ((mine ?? []) as { session_id: string; role: string }[]).map((m) => [m.session_id, m.role]),
  );

  const [{ data: sessions, error: sErr }, { data: members, error: memErr }] = await Promise.all([
    db.from('sessions').select('id, name, updated_at').in('id', ids),
    db.from('session_members').select('session_id, account_id, role').in('session_id', ids),
  ]);
  if (sErr) throw sErr;
  if (memErr) throw memErr;

  const memberRows = (members ?? []) as unknown as MemberRow[];
  const accountIds = [...new Set(memberRows.map((m) => m.account_id))];
  const { data: profiles, error: pErr } = await db
    .from('profiles')
    .select('id, display_name')
    .in('id', accountIds);
  if (pErr) throw pErr;
  const nameByAccount = new Map(
    ((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  const membersBySession = new Map<string, { id: string; name: string | null }[]>();
  for (const m of memberRows) {
    const arr = membersBySession.get(m.session_id) ?? [];
    arr.push({ id: m.account_id, name: nameByAccount.get(m.account_id) ?? null });
    membersBySession.set(m.session_id, arr);
  }

  return ((sessions ?? []) as unknown as SessionRow[])
    .map((s) => ({
      id: s.id,
      name: s.name,
      role: roleBySession.get(s.id) ?? 'member',
      members: membersBySession.get(s.id) ?? [],
      updatedAt: s.updated_at ?? null,
    }))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

// Create a named session owned by the account, with the creator as its first
// member.
export async function createSession(accountId: string, name: string): Promise<SessionRow> {
  if (!name?.trim()) throw new Invalid('A session name is required');
  const db = await createClient();

  const { data, error } = await db
    .from('sessions')
    .insert([{ name: name.trim(), created_by: accountId }] as never)
    .select()
    .single();
  if (error) throw error;
  const session = data as unknown as SessionRow;

  const { error: memErr } = await db
    .from('session_members')
    .insert([{ session_id: session.id, account_id: accountId, role: 'owner' }] as never);
  if (memErr) throw memErr;

  return session;
}

// Rename a session. The caller must be a member (creator-only is enforced in the
// RLS issue #9).
export async function renameSession(
  sessionId: string,
  accountId: string,
  name: string,
): Promise<SessionRow> {
  if (!name?.trim()) throw new Invalid('A session name is required');
  const db = await createClient();

  const { data: membership } = await db
    .from('session_members')
    .select('account_id')
    .eq('session_id', sessionId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!membership) throw new NotFound('session', sessionId);

  const { data, error } = await db
    .from('sessions')
    .update({ name: name.trim(), updated_at: new Date().toISOString() } as never)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SessionRow;
}

// Set the session's property-search buffer percentage (0-20). The zone shown
// and searched is extended by this % of its own extent. Members only.
export async function setSearchBufferPct(
  sessionId: string,
  accountId: string,
  pct: number,
): Promise<SessionRow> {
  if (!Number.isInteger(pct) || pct < 0 || pct > 20) {
    throw new Invalid('Buffer must be an integer between 0 and 20');
  }
  const db = await createClient();

  const { data: membership } = await db
    .from('session_members')
    .select('account_id')
    .eq('session_id', sessionId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!membership) throw new NotFound('session', sessionId);

  const { data, error } = await db
    .from('sessions')
    .update({ search_buffer_pct: pct, updated_at: new Date().toISOString() } as never)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SessionRow;
}

// The shareable invite token for a session, for a member to hand out. Members
// only — a non-member can't read or mint it.
export async function getInviteToken(sessionId: string, accountId: string): Promise<string> {
  const db = await createClient();
  const { data: membership } = await db
    .from('session_members')
    .select('account_id')
    .eq('session_id', sessionId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!membership) throw new NotFound('session', sessionId);

  const { data, error } = await db
    .from('sessions')
    .select('invite_token')
    .eq('id', sessionId)
    .single();
  if (error || !data) throw new NotFound('session', sessionId);
  return (data as unknown as { invite_token: string }).invite_token;
}

// Join a session via its invite token (idempotent). Goes through the
// join_session RPC because, under RLS, a non-member can't read the session to
// join it. The RPC adds auth.uid() as a member; we then read the joined session.
export async function joinSession(token: string): Promise<SessionRow> {
  const db = await createClient();
  const { data, error } = await db.rpc('join_session', { p_token: token });
  if (error || !data) throw new NotFound('invite', token);
  return getSession(data as string);
}

// Every participant in a session, oldest first, as domain constraints.
export async function listUsers(sessionId: string): Promise<CommuteConstraint[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('session_users')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as SessionUserRow[]).map(toCommuteConstraint);
}

function assertUserInput(input: CommuteConstraintInput): void {
  const { name, address, latitude, longitude, maxMinutes, transportMode } = input;
  if (!name || !address || !latitude || !longitude || !maxMinutes || !transportMode) {
    throw new Invalid('Missing required fields');
  }
}

// The signed-in account's own participant in a session, or null if they haven't
// added their commute constraint yet. This is "who am I" — no dropdown pick.
export async function getMyParticipant(
  sessionId: string,
  accountId: string,
): Promise<CommuteConstraint | null> {
  const db = await createClient();
  const { data, error } = await db
    .from('session_users')
    .select('*')
    .eq('session_id', sessionId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toCommuteConstraint(data as unknown as SessionUserRow) : null;
}

// Add the signed-in account's commute constraint to the session. Stamps
// account_id so the constraint is owned, and makes the account a member.
export async function addUser(
  sessionId: string,
  accountId: string,
  input: CommuteConstraintInput,
): Promise<CommuteConstraint> {
  assertUserInput(input);
  const db = await createClient();
  const { data, error } = await db
    .from('session_users')
    .insert([{
      session_id: sessionId,
      account_id: accountId,
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      max_minutes: input.maxMinutes,
      transport_mode: input.transportMode,
    } as never])
    .select()
    .single();
  if (error) throw error;
  return toCommuteConstraint(data as unknown as SessionUserRow);
}

// Replace a participant's commute constraint in place.
export async function updateUser(
  sessionId: string,
  userId: string,
  input: CommuteConstraintInput,
): Promise<CommuteConstraint> {
  assertUserInput(input);
  const db = await createClient();
  const { data, error } = await db
    .from('session_users')
    .update({
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      max_minutes: input.maxMinutes,
      transport_mode: input.transportMode,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', userId)
    .eq('session_id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return toCommuteConstraint(data as unknown as SessionUserRow);
}

// Remove a participant from the session.
export async function removeUser(sessionId: string, userId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from('session_users')
    .delete()
    .eq('id', userId)
    .eq('session_id', sessionId);
  if (error) throw error;
}

// Every household in a session. A participant belonging to none is a household
// of one, resolved when convergence is computed rather than stored here.
export async function listHouseholds(sessionId: string): Promise<Household[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('households')
    .select('id, name')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Household[];
}

// Pair participants into one household. Members already in another household
// move across; that household is left to be dissolved separately if empty.
export async function formHousehold(
  sessionId: string,
  name: string,
  memberIds: string[],
): Promise<Household> {
  if (!name?.trim()) throw new Invalid('A household needs a name');
  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== 'string')) {
    throw new Invalid('memberIds must be a list of participant ids');
  }
  const unique = Array.from(new Set(memberIds));
  if (unique.length < 2) throw new Invalid('A household needs at least two participants');

  const db = await createClient();
  const { data, error } = await db
    .from('households')
    .insert([{ session_id: sessionId, name: name.trim() } as never])
    .select('id, name')
    .single();
  if (error) throw error;

  const household = data as unknown as Household;

  // The insert and the link are two statements, so the link can match fewer
  // rows than asked — a stale id, someone removed concurrently, RLS refusing
  // the write. A household with no members is worse than none: the card would
  // show "nobody left" while convergence drops it, so the two disagree. Undo.
  const { data: linked, error: linkError } = await db
    .from('session_users')
    .update({ household_id: household.id } as never)
    .eq('session_id', sessionId)
    .in('id', unique)
    .select('id');

  if (linkError || (linked ?? []).length !== unique.length) {
    const { error: undoError } = await db
      .from('households')
      .delete()
      .eq('id', household.id)
      .eq('session_id', sessionId);

    // If the undo itself fails, say so rather than blaming the participants —
    // a member-less household row is now sitting there reading "nobody left".
    if (undoError) {
      throw new Invalid('Could not pair those two, and cleaning up the half-made household failed');
    }
    if (linkError) throw linkError;
    throw new Invalid('Those participants are no longer all in this session');
  }

  return household;
}

// Dissolve a household, returning its members to households of one. The
// household_id foreign key is ON DELETE SET NULL, so people are never deleted.
export async function dissolveHousehold(sessionId: string, householdId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from('households')
    .delete()
    .eq('id', householdId)
    .eq('session_id', sessionId);
  if (error) throw error;
}

// The group's decisions, oldest first — the order they were agreed in is the
// order they read in.
export async function listDecisions(sessionId: string): Promise<Decision[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('session_decisions')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Decision[];
}

// Record something the group has agreed. Optionally supersedes an earlier
// decision, which stays on the record rather than being deleted — changing
// your mind is history, not an edit.
export async function recordDecision(
  sessionId: string,
  text: string,
  decidedBy: string | null,
  supersedesId?: string | null,
): Promise<Decision> {
  if (!text?.trim()) throw new Invalid('A decision needs some text');

  const db = await createClient();
  const { data, error } = await db
    .from('session_decisions')
    .insert([{ session_id: sessionId, text: text.trim(), decided_by: decidedBy ?? null } as never])
    .select('*')
    .single();
  if (error) throw error;

  const decision = data as unknown as Decision;

  if (supersedesId) {
    const { error: linkError } = await db
      .from('session_decisions')
      .update({ superseded_by: decision.id } as never)
      .eq('id', supersedesId)
      .eq('session_id', sessionId);

    // Two statements again: without undoing the insert, a failed link leaves
    // the replacement standing next to the original it was meant to retire,
    // and retrying makes a third.
    if (linkError) {
      await db.from('session_decisions').delete().eq('id', decision.id).eq('session_id', sessionId);
      throw linkError;
    }
  }

  return decision;
}

// Close the meeting: write what was agreed and what still needs doing, then
// clear the agenda — in one operation, so a failure can never leave the group
// with a wiped agenda and no record of why.
export async function closeMeeting(
  sessionId: string,
  decisions: string[],
  todos: string[],
  by: string | null,
): Promise<void> {
  const clean = (xs: unknown) =>
    Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

  const db = await createClient();
  const { error } = await db.rpc('close_meeting', {
    p_session_id: sessionId,
    p_decisions: clean(decisions),
    p_todos: clean(todos),
    p_by: by ?? null,
  } as never);
  if (error) throw error;
}

// Every reaction in a session.
export async function listReactions(sessionId: string): Promise<ListingReaction[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('listing_reactions')
    .select('*')
    .eq('session_id', sessionId);
  if (error) throw error;
  return (data ?? []) as unknown as ListingReaction[];
}

// Toggle a participant's reaction on a listing. Re-applying the same reaction
// removes it; a different one replaces it. Returns the stored reaction, or null
// when it was toggled off.
export async function toggleReaction(
  sessionId: string,
  listingId: string,
  userId: string,
  reaction: ReactionKind,
): Promise<ListingReaction | null> {
  if (!listingId || !userId) throw new Invalid('listingId and userId are required');
  if (!REACTION_KINDS.includes(reaction)) throw new Invalid('reaction must be love or object');

  const db = await createClient();
  const { data: existing, error: fetchError } = await db
    .from('listing_reactions')
    .select('*')
    .eq('session_id', sessionId)
    .eq('listing_id', listingId)
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const current = (existing as { reaction: ReactionKind } | null)?.reaction ?? null;
  const outcome = resolveToggle(current, reaction);

  if (outcome.action === 'remove') {
    const { error } = await db
      .from('listing_reactions')
      .delete()
      .eq('id', (existing as unknown as { id: string }).id);
    if (error) throw error;
    return null;
  }

  const { data, error } = await db
    .from('listing_reactions')
    .upsert(
      [{
        session_id: sessionId,
        listing_id: listingId,
        user_id: userId,
        reaction: outcome.reaction,
      } as never],
      { onConflict: 'session_id,listing_id,user_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ListingReaction;
}

// ---------------------------------------------------------------------------
// The dashboard's aggregates. Every function here scopes by session_id, so a
// route cannot forget to — the reason these moved out of the route files.
// ---------------------------------------------------------------------------

// The agenda for the next meeting, oldest first (stable reading order).
export async function listMeetingItems(sessionId: string): Promise<MeetingItem[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('meeting_items')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MeetingItem[];
}

export async function addMeetingItem(
  sessionId: string,
  text: string,
  createdBy: string | null,
): Promise<MeetingItem> {
  if (!text?.trim()) throw new Invalid('Agenda text is required');
  const db = await createClient();
  const { data, error } = await db
    .from('meeting_items')
    .insert([{ session_id: sessionId, text: text.trim(), created_by: createdBy ?? null } as never])
    .select()
    .single();
  if (error) throw error;
  return data as unknown as MeetingItem;
}

export async function setMeetingItemDone(
  sessionId: string,
  itemId: string,
  done: boolean,
): Promise<MeetingItem> {
  const db = await createClient();
  const { data, error } = await db
    .from('meeting_items')
    .update({ done: !!done } as never)
    .eq('id', itemId)
    .eq('session_id', sessionId)
    .select()
    .maybeSingle();
  if (error) throw error;
  // maybeSingle, so a row that does not exist (or is not ours) is a clean 404
  // rather than an opaque 500 from single()'s "no rows" error.
  if (!data) throw new NotFound('agenda item', itemId);
  return data as unknown as MeetingItem;
}

export async function removeMeetingItem(sessionId: string, itemId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from('meeting_items')
    .delete()
    .eq('id', itemId)
    .eq('session_id', sessionId);
  if (error) throw error;
}

// Todos, open first then oldest — momentum front and centre, finished ones sink.
export async function listTodos(sessionId: string): Promise<Todo[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('session_todos')
    .select('*')
    .eq('session_id', sessionId)
    .order('done', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Todo[];
}

export async function addTodo(
  sessionId: string,
  title: string,
  assignedTo: string | null,
  createdBy: string | null,
): Promise<Todo> {
  if (!title?.trim()) throw new Invalid('A title is required');
  const db = await createClient();
  const { data, error } = await db
    .from('session_todos')
    .insert([{
      session_id: sessionId,
      title: title.trim(),
      assigned_to: assignedTo ?? null,
      created_by: createdBy ?? null,
    } as never])
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Todo;
}

// Close/reopen a todo and/or reassign it. done_at records when it was closed.
export async function updateTodo(
  sessionId: string,
  todoId: string,
  patch: { done?: boolean; assignedTo?: string | null },
): Promise<Todo> {
  const fields: Record<string, unknown> = {};
  if (patch.done !== undefined) {
    fields.done = !!patch.done;
    fields.done_at = patch.done ? new Date().toISOString() : null;
  }
  if (patch.assignedTo !== undefined) fields.assigned_to = patch.assignedTo || null;

  const db = await createClient();
  const { data, error } = await db
    .from('session_todos')
    .update(fields as never)
    .eq('id', todoId)
    .eq('session_id', sessionId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound('todo', todoId);
  return data as unknown as Todo;
}

export async function removeTodo(sessionId: string, todoId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from('session_todos')
    .delete()
    .eq('id', todoId)
    .eq('session_id', sessionId);
  if (error) throw error;
}

// The single pinned meeting, or null if none is set yet.
export async function getMeeting(sessionId: string): Promise<Meeting | null> {
  const db = await createClient();
  const { data, error } = await db
    .from('session_meetings')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Meeting | null;
}

// Create or replace the next meeting. UNIQUE(session_id) makes this an upsert
// in place — there is only ever one, deliberately (see docs/adr/0003).
export async function setMeeting(
  sessionId: string,
  input: { meetsAt: string; location?: string | null; note?: string | null; updatedBy?: string | null },
): Promise<Meeting> {
  if (!input.meetsAt || isNaN(Date.parse(input.meetsAt))) {
    throw new Invalid('A valid meetsAt timestamp is required');
  }
  const db = await createClient();
  const { data, error } = await db
    .from('session_meetings')
    .upsert(
      [{
        session_id: sessionId,
        meets_at: input.meetsAt,
        location: input.location ?? null,
        note: input.note ?? null,
        updated_by: input.updatedBy ?? null,
        updated_at: new Date().toISOString(),
      } as never],
      { onConflict: 'session_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Meeting;
}

// Folders in the shared files hub, oldest first.
export async function listFolders(sessionId: string): Promise<Folder[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('session_folders')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Folder[];
}

export async function createFolder(
  sessionId: string,
  name: string,
  parentId: string | null = null,
): Promise<Folder> {
  if (!name?.trim()) throw new Invalid('A folder name is required');

  // A new folder is a leaf, so it only has to fit under its parent. Checked
  // here and not just in the hub, because the route is reachable directly.
  if (parentId) {
    const siblings = await listFolders(sessionId);
    const parent = siblings.find((f) => f.id === parentId);
    if (!parent) throw new NotFound('folder', parentId);
    if (!canMoveFolder([...siblings, { id: 'new', session_id: sessionId, name, parent_id: null }], 'new', parentId)) {
      throw new Invalid(`Folders can only go ${MAX_FOLDER_DEPTH} levels deep`);
    }
  }

  const db = await createClient();
  const { data, error } = await db
    .from('session_folders')
    .insert([{ session_id: sessionId, name: name.trim(), parent_id: parentId ?? null } as never])
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Folder;
}

// Move a folder into another (null = the root). Its children and files travel
// with it, since they are attached by id rather than by path.
export async function moveFolder(
  sessionId: string,
  folderId: string,
  parentId: string | null,
): Promise<Folder> {
  const folders = await listFolders(sessionId);
  if (!folders.some((f) => f.id === folderId)) throw new NotFound('folder', folderId);
  if (parentId !== null && !folders.some((f) => f.id === parentId)) {
    throw new NotFound('folder', parentId);
  }

  if (!canMoveFolder(folders, folderId, parentId)) {
    throw new Invalid(
      parentId !== null && descendantsOf(folders, folderId).includes(parentId)
        ? 'A folder cannot be moved inside itself'
        : `Folders can only go ${MAX_FOLDER_DEPTH} levels deep`,
    );
  }

  const db = await createClient();
  const { data, error } = await db
    .from('session_folders')
    .update({ parent_id: parentId } as never)
    .eq('id', folderId)
    .eq('session_id', sessionId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound('folder', folderId);
  return data as unknown as Folder;
}

// Delete a folder. Its files *and* its child folders fall back to the root via
// ON DELETE SET NULL, so the whole subtree survives — deleting a folder never
// destroys a document.
export async function removeFolder(sessionId: string, folderId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db
    .from('session_folders')
    .delete()
    .eq('id', folderId)
    .eq('session_id', sessionId);
  if (error) throw error;
}

// Shared files, newest first.
export async function listFiles(sessionId: string): Promise<SharedFile[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('shared_files')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SharedFile[];
}

// Persist the row pointing at bytes the browser already uploaded to Storage.
export async function recordFile(
  sessionId: string,
  input: {
    fileName: string;
    storagePath: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    listingId?: string | null;
    folderId?: string | null;
    note?: string | null;
    uploadedBy?: string | null;
  },
): Promise<SharedFile> {
  if (!input.fileName || !input.storagePath) {
    throw new Invalid('fileName and storagePath are required');
  }
  const db = await createClient();
  const { data, error } = await db
    .from('shared_files')
    .insert([{
      session_id: sessionId,
      file_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      listing_id: input.listingId ?? null,
      folder_id: input.folderId ?? null,
      note: input.note ?? null,
      uploaded_by: input.uploadedBy ?? null,
    } as never])
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SharedFile;
}

// Move a file between folders; null puts it back at the root of the hub.
export async function moveFile(
  sessionId: string,
  fileId: string,
  folderId: string | null,
): Promise<SharedFile> {
  const db = await createClient();
  const { data, error } = await db
    .from('shared_files')
    .update({ folder_id: folderId ?? null } as never)
    .eq('id', fileId)
    .eq('session_id', sessionId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound('file', fileId);
  return data as unknown as SharedFile;
}

// Remove the bytes first, then the row: if Storage fails we keep the metadata
// so the delete can be retried, rather than orphaning the object forever.
export async function removeFile(sessionId: string, fileId: string): Promise<void> {
  const db = await createClient();
  const { data: file, error: fetchError } = await db
    .from('shared_files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('session_id', sessionId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!file) throw new NotFound('file', fileId);

  const { error: storageError } = await db.storage
    .from('shared-files')
    .remove([(file as { storage_path: string }).storage_path]);
  if (storageError) throw storageError;

  const { error: deleteError } = await db
    .from('shared_files')
    .delete()
    .eq('id', fileId)
    .eq('session_id', sessionId);
  if (deleteError) throw deleteError;
}

// The listings a set of reactions point at — the only listing read the
// dashboard needs, and the last thing convergence was querying inline.
export async function listListingsByIds(ids: string[]): Promise<PropertyListing[]> {
  if (ids.length === 0) return [];
  const db = await createClient();
  const { data, error } = await db.from('property_listings').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []) as unknown as PropertyListing[];
}
