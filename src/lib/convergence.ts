import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';

export interface Household {
  id: string;
  name: string;
}

export interface Participant {
  id: string;
  name: string;
  householdId?: string | null;
}

// Where one household stands on one listing. A split household is an
// unresolved conversation inside the couple, not a rejection.
export type HouseholdPosition = 'yes' | 'split' | 'no' | 'silent';

export interface HouseholdStanding {
  householdId: string;
  householdName: string;
  position: HouseholdPosition;
  // Who inside this household said what — a split is only actionable if you
  // know which partner to talk to.
  loveNames: string[];
  objectNames: string[];
}

export interface ListingConvergence {
  listing: PropertyListing;
  standings: HouseholdStanding[];
  yesCount: number;
  // Every household is yes and none silent — the strongest signal the hunt can
  // produce, and deliberately rare.
  unanimous: boolean;
}

export interface ConvergenceInput {
  listings: PropertyListing[];
  reactions: ListingReaction[];
  participants: Participant[];
  households: Household[];
}

export interface Convergence {
  // Every listing anyone has reacted to — including ones nobody wants, which
  // belong in neither card. The file picker reads this; the map's shortlist
  // will once it migrates. Favorites and contested are disjoint subsets.
  engaged: ListingConvergence[];
  favorites: ListingConvergence[];
  contested: ListingConvergence[];
}

// A household with an objection still standing — either it has said no, or it
// is split and one of its members has objected. Either way the listing is
// contested rather than converged.
const isObjecting = (s: HouseholdStanding) => s.position === 'no' || s.position === 'split';

export function computeConvergence({
  listings,
  reactions,
  participants,
  households,
}: ConvergenceInput): Convergence {
  // Resolve the deciding units once. A participant belonging to no household
  // is a household of one, so the count is never zero, a solo co-buyer is a
  // first-class case, and six unpaired participants behave exactly as six
  // people did before households existed.
  const known = new Set(households.map((h) => h.id));
  const units: { household: Household; members: Participant[] }[] = [
    // A household nobody belongs to is not a decider — left in, it could never
    // be yes, so unanimity would be unreachable for the whole session.
    ...households
      .map((household) => ({
        household,
        members: participants.filter((p) => p.householdId === household.id),
      }))
      .filter((u) => u.members.length > 0),
    ...participants
      .filter((p) => !p.householdId || !known.has(p.householdId))
      .map((p) => ({ household: { id: p.id, name: p.name }, members: [p] })),
  ];

  // Index once rather than rescanning every reaction per listing per household.
  const byListing = new Map<string, ListingReaction[]>();
  for (const r of reactions) {
    const arr = byListing.get(r.listing_id) ?? [];
    arr.push(r);
    byListing.set(r.listing_id, arr);
  }

  const unitOf = new Map<string, number>();
  units.forEach((u, i) => u.members.forEach((m) => unitOf.set(m.id, i)));

  const nameOf = new Map(participants.map((p) => [p.id, p.name]));

  const engaged: ListingConvergence[] = [];
  const favorites: ListingConvergence[] = [];
  const contested: ListingConvergence[] = [];

  for (const listing of listings) {
    const rs = listing.id ? byListing.get(listing.id) ?? [] : [];
    if (rs.length === 0) continue;

    const perUnit: ListingReaction[][] = units.map(() => []);
    for (const r of rs) {
      const i = unitOf.get(r.user_id);
      if (i !== undefined) perUnit[i].push(r);
    }

    const standings = units.map(({ household }, i) => {
      const mine = perUnit[i];
      const named = (kind: ListingReaction['reaction']) =>
        mine.filter((r) => r.reaction === kind).map((r) => nameOf.get(r.user_id) ?? '?');

      const loveNames = named('love');
      const objectNames = named('object');

      // Contradiction wins, so silence can never block: one partner speaks for
      // the household until the other disagrees.
      const position: HouseholdPosition =
        loveNames.length && objectNames.length
          ? 'split'
          : loveNames.length
            ? 'yes'
            : objectNames.length
              ? 'no'
              : 'silent';

      return {
        householdId: household.id,
        householdName: household.name,
        position,
        loveNames,
        objectNames,
      };
    });

    const entry: ListingConvergence = {
      listing,
      standings,
      yesCount: standings.filter((s) => s.position === 'yes').length,
      // A lone household agreeing with itself is not the group agreeing.
      unanimous: standings.length > 1 && standings.every((s) => s.position === 'yes'),
    };

    engaged.push(entry);

    // Objecting is how the group prunes the map, and a prune is not a debate:
    // a listing nobody wants belongs in neither card. A split household counts
    // as wanting it, since one of its members loved it.
    const wanted = standings.some((s) => s.position === 'yes' || s.position === 'split');
    if (!wanted) continue;

    // A listing lands in at most one bucket, decided here and nowhere else —
    // the old code derived the contested list by filtering favorites, which is
    // why a listing could appear in both cards at once.
    if (entry.standings.some(isObjecting)) {
      contested.push(entry);
    } else if (entry.yesCount >= 2) {
      favorites.push(entry);
    }
  }

  // Most household support first. For contested listings that reads as
  // closeness to consensus, tie-broken by how many households still object —
  // the top row is the debate most worth having.
  const objectingCount = (e: ListingConvergence) => e.standings.filter(isObjecting).length;

  favorites.sort((a, b) => b.yesCount - a.yesCount);
  contested.sort((a, b) => b.yesCount - a.yesCount || objectingCount(a) - objectingCount(b));

  return { engaged, favorites, contested };
}
