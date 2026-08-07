// An objection is an opening position that needs answering, not a kill switch:
// a listing stays alive and visible while objections stand. See
// docs/adr/0003 — removing a listing is a deliberate group act.
export type ReactionKind = 'love' | 'object';

export interface ListingReaction {
  id: string;
  session_id: string;
  listing_id: string;
  user_id: string;
  reaction: ReactionKind;
  created_at?: string;
}
