import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { computeFavorites } from '@/lib/favorites';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';

// Houses the group has reacted to, ranked by hearts. Derived from existing
// listing_reactions joined to property_listings — same logic as the map's
// Shortlist (see src/lib/favorites.ts).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = getSupabaseClient();

    const [reactionsRes, usersRes] = await Promise.all([
      supabase.from('listing_reactions').select('*').eq('session_id', sessionId),
      supabase.from('session_users').select('id, name').eq('session_id', sessionId),
    ]);

    if (reactionsRes.error) throw reactionsRes.error;
    if (usersRes.error) throw usersRes.error;

    const reactions = (reactionsRes.data ?? []) as unknown as ListingReaction[];
    const users = (usersRes.data ?? []) as unknown as { id: string; name: string }[];

    const listingIds = Array.from(new Set(reactions.map((r) => r.listing_id)));
    if (listingIds.length === 0) {
      return NextResponse.json({ favorites: [] });
    }

    const { data: listings, error: listingsError } = await supabase
      .from('property_listings')
      .select('*')
      .in('id', listingIds);

    if (listingsError) throw listingsError;

    const favorites = computeFavorites(
      (listings ?? []) as unknown as PropertyListing[],
      reactions,
      users,
    );

    return NextResponse.json({ favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}
