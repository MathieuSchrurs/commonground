import { PropertyListing } from '@/scraper/types';

/**
 * Whether a listing should be shown to a participant, given their
 * hide-commercial preference. Per participant, not per household — see
 * docs/adr/0004-commercial-filter-is-per-participant.md.
 */
export function isListingVisible(listing: PropertyListing, hideCommercial: boolean): boolean {
  if (hideCommercial && listing.property_type === 'commercial') return false;
  return true;
}
