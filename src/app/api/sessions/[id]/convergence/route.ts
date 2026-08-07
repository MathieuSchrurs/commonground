import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { listHouseholds, listListingsByIds, listReactions, listUsers } from '@/lib/session/store';
import { computeConvergence } from '@/lib/convergence';

type Ctx = { params: Promise<{ id: string }> };

// Where the group stands, by household: every listing anyone has reacted to,
// partitioned into favorites (converging) and contested (still arguing).
// See src/lib/convergence.ts for the rules.
export const GET = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id } = await params;

  const [reactions, participants, households] = await Promise.all([
    listReactions(id),
    listUsers(id),
    listHouseholds(id),
  ]);

  const listings = await listListingsByIds(
    Array.from(new Set(reactions.map((r) => r.listing_id))),
  );

  // Participants with no household resolve as households of one, so an
  // unpaired session behaves exactly as it did before households existed.
  return computeConvergence({ listings, reactions, participants, households });
});
