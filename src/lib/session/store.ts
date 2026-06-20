// The Session store: the single seam over every session-scoped table. Exposes
// domain verbs, returns the project's domain types, and owns the session-scoping
// and typed-error invariants. API routes are thin shells over these functions.
//
// Grows one aggregate at a time. Currently: sessions, users, reactions.

import { getSupabaseClient } from '@/lib/supabase';
import { CommuteConstraint } from '@/types/user';
import { ListingReaction, ReactionKind } from '@/types/reactions';
import { Invalid, NotFound } from './errors';
import { resolveToggle } from './reactions';
import { SessionUserRow, toCommuteConstraint } from './mappers';

const REACTION_KINDS: ReactionKind[] = ['love', 'veto'];

// A sessions row. The session itself carries no fields the UI reads beyond its
// id; participants and the rest hang off it.
export interface SessionRow {
  id: string;
  created_at?: string;
}

// The fields needed to create or replace a participant — a CommuteConstraint
// before the store assigns it an id.
export type CommuteConstraintInput = Omit<CommuteConstraint, 'id'>;

// A session, or NotFound if it doesn't exist.
export async function getSession(id: string): Promise<SessionRow> {
  const db = getSupabaseClient();
  const { data, error } = await db.from('sessions').select('*').eq('id', id).single();
  if (error || !data) throw new NotFound('session', id);
  return data as unknown as SessionRow;
}

// Every participant in a session, oldest first, as domain constraints.
export async function listUsers(sessionId: string): Promise<CommuteConstraint[]> {
  const db = getSupabaseClient();
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

// Add a participant to the session.
export async function addUser(
  sessionId: string,
  input: CommuteConstraintInput,
): Promise<CommuteConstraint> {
  assertUserInput(input);
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('session_users')
    .insert([{
      session_id: sessionId,
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
  const db = getSupabaseClient();
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
  const db = getSupabaseClient();
  const { error } = await db
    .from('session_users')
    .delete()
    .eq('id', userId)
    .eq('session_id', sessionId);
  if (error) throw error;
}

// Every reaction in a session.
export async function listReactions(sessionId: string): Promise<ListingReaction[]> {
  const db = getSupabaseClient();
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
  if (!REACTION_KINDS.includes(reaction)) throw new Invalid('reaction must be love or veto');

  const db = getSupabaseClient();
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
