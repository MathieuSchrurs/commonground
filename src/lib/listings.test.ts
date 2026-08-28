import { describe, expect, it } from 'vitest';
import { isListingVisible } from './listings';
import { PropertyListing } from '@/scraper/types';

function listing(property_type: PropertyListing['property_type']): PropertyListing {
  return {
    source: 'immoweb',
    external_id: '1',
    url: 'https://example.com/1',
    property_type,
  };
}

describe('isListingVisible', () => {
  it('hides a commercial listing when hideCommercial is true', () => {
    expect(isListingVisible(listing('commercial'), true)).toBe(false);
  });

  it('shows a commercial listing when hideCommercial is false', () => {
    expect(isListingVisible(listing('commercial'), false)).toBe(true);
  });

  it('shows non-commercial listings regardless of hideCommercial', () => {
    expect(isListingVisible(listing('house'), true)).toBe(true);
    expect(isListingVisible(listing('apartment'), true)).toBe(true);
    expect(isListingVisible(listing('land'), true)).toBe(true);
    expect(isListingVisible(listing('other'), true)).toBe(true);
    expect(isListingVisible(listing('house'), false)).toBe(true);
  });
});
