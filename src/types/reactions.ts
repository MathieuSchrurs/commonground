export type ReactionKind = 'love' | 'veto';

export interface ListingReaction {
  id: string;
  session_id: string;
  listing_id: string;
  user_id: string;
  reaction: ReactionKind;
  created_at?: string;
}
