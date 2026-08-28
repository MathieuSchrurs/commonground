import { PropertyListing } from '@/scraper/types';

/**
 * Resolve the viewer's own hide-commercial preference from a participant
 * list, defaulting to hidden (matching the DB default on session_users) when
 * they aren't found or the field is unset. Pulled out as one helper so every
 * surface that needs "my" preference (Map, ShortlistPanel, the dashboard)
 * reads it the same way — three independent inline copies of this same
 * lookup previously meant the DB default and "not found" cases could drift
 * apart from each other by accident.
 */
export function resolveHideCommercial(
  participants: { id: string; hideCommercial?: boolean }[],
  myUserId: string | null | undefined
): boolean {
  return participants.find((p) => p.id === myUserId)?.hideCommercial ?? true;
}

/**
 * Whether a listing should be shown to a participant, given their
 * hide-commercial preference. Per participant, not per household — see
 * docs/adr/0004-commercial-filter-is-per-participant.md.
 */
export function isListingVisible(listing: PropertyListing, hideCommercial: boolean): boolean {
  if (hideCommercial && listing.property_type === 'commercial') return false;
  return true;
}

/**
 * Shared source/price/commercial predicate used both to compute the
 * filtered count/list (`matchesFilters`) and to set marker opacity on
 * already-rendered Mapbox markers — kept as one function so the two stay
 * in sync.
 */
export function passesListingFilters(
  listing: PropertyListing,
  sourceFilter: Record<string, boolean>,
  priceRange: [number, number] | null,
  hideCommercial: boolean
): boolean {
  if (sourceFilter[listing.source] === false) return false;
  if (listing.price != null && priceRange) {
    if (listing.price < priceRange[0] || listing.price > priceRange[1]) return false;
  }
  return isListingVisible(listing, hideCommercial);
}
