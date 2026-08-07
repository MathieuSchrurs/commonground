import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { computeConvergence } from '@/lib/convergence';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';
import { Household } from '@/types/household';

// Where the group stands, by household: every listing anyone has reacted to,
// partitioned into favorites (converging) and contested (still arguing). The
// dashboard's cards read this; see src/lib/convergence.ts for the rules.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createClient();

    const [reactionsRes, usersRes, householdsRes] = await Promise.all([
      supabase.from('listing_reactions').select('*').eq('session_id', sessionId),
      supabase.from('session_users').select('id, name, household_id').eq('session_id', sessionId),
      supabase.from('households').select('id, name').eq('session_id', sessionId),
    ]);

    if (reactionsRes.error) throw reactionsRes.error;
    if (usersRes.error) throw usersRes.error;
    if (householdsRes.error) throw householdsRes.error;

    const reactions = (reactionsRes.data ?? []) as unknown as ListingReaction[];
    const households = (householdsRes.data ?? []) as unknown as Household[];
    const participants = (
      (usersRes.data ?? []) as unknown as { id: string; name: string; household_id: string | null }[]
    ).map((u) => ({ id: u.id, name: u.name, householdId: u.household_id }));

    const listingIds = Array.from(new Set(reactions.map((r) => r.listing_id)));
    if (listingIds.length === 0) {
      return NextResponse.json({ engaged: [], considered: [], favorites: [], contested: [] });
    }

    const { data: listings, error: listingsError } = await supabase
      .from('property_listings')
      .select('*')
      .in('id', listingIds);

    if (listingsError) throw listingsError;

    // Participants with no household resolve as households of one, so an
    // unpaired session behaves exactly as it did before households existed.
    return NextResponse.json(
      computeConvergence({
        listings: (listings ?? []) as unknown as PropertyListing[],
        reactions,
        participants,
        households,
      }),
    );
  } catch (error) {
    console.error('Error computing convergence:', error);
    return NextResponse.json({ error: 'Failed to compute convergence' }, { status: 500 });
  }
}
