import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';
import { CommuteConstraint } from '@/types/user';

// One loved listing with its reaction tallies, ready to render.
export interface Favorite {
  listing: PropertyListing;
  loveCount: number;
  loveNames: string[];
  objectNames: string[];
  unanimous: boolean; // everyone in the session loves it
}

// The convergence view: every listing at least one person has hearted, ranked
// by heart count, with unanimous picks flagged. Shared by the map's Shortlist
// panel and the dashboard's Group Favorites card so both agree exactly.
export function computeFavorites(
  listings: PropertyListing[],
  reactions: ListingReaction[],
  users: Pick<CommuteConstraint, 'id' | 'name'>[],
): Favorite[] {
  const byListing = new Map<string, ListingReaction[]>();
  for (const r of reactions) {
    const arr = byListing.get(r.listing_id) ?? [];
    arr.push(r);
    byListing.set(r.listing_id, arr);
  }

  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return listings
    .filter((p) => p.id && byListing.get(p.id)?.some((r) => r.reaction === 'love'))
    .map((p) => {
      const rs = byListing.get(p.id!) ?? [];
      const loves = rs.filter((r) => r.reaction === 'love');
      const objections = rs.filter((r) => r.reaction === 'object');
      return {
        listing: p,
        loveCount: loves.length,
        loveNames: loves.map((r) => nameOf.get(r.user_id) ?? '?'),
        objectNames: objections.map((r) => nameOf.get(r.user_id) ?? '?'),
        unanimous: users.length > 1 && loves.length === users.length,
      };
    })
    .sort((a, b) => b.loveCount - a.loveCount);
}

// The houses the group is split on — loved by someone and objected to by
// someone else. The dashboard's conflict card is built from this; when a house
// shows up here it is the debate worth having next.
export function computeSplitVotes(favorites: Favorite[]): Favorite[] {
  return favorites.filter((f) => f.objectNames.length > 0);
}
