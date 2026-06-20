// The Session store: the single seam over every session-scoped table. Exposes
// domain verbs, returns the project's domain types, and owns the session-scoping
// and typed-error invariants. API routes are thin shells over these functions.
//
// Grows one aggregate at a time. Currently: reactions.

import { getSupabaseClient } from '@/lib/supabase';
import { ListingReaction, ReactionKind } from '@/types/reactions';
import { Invalid } from './errors';
import { resolveToggle } from './reactions';

const REACTION_KINDS: ReactionKind[] = ['love', 'veto'];

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
