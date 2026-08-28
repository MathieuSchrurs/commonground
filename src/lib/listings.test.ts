import { describe, expect, it } from 'vitest';
import { isListingVisible, passesListingFilters, resolveHideCommercial } from './listings';
import { PropertyListing } from '@/scraper/types';

function listing(
  property_type: PropertyListing['property_type'],
  overrides: Partial<PropertyListing> = {}
): PropertyListing {
  return {
    source: 'immoweb',
    external_id: '1',
    url: 'https://example.com/1',
    property_type,
    ...overrides,
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

describe('passesListingFilters', () => {
  it('excludes a listing whose source is turned off', () => {
    const l = listing('house', { source: 'zimmo' });
    expect(passesListingFilters(l, { zimmo: false }, null, true)).toBe(false);
  });

  it('excludes a listing whose price falls outside the price range', () => {
    const l = listing('house', { price: 500000 });
    expect(passesListingFilters(l, {}, [100000, 300000], true)).toBe(false);
  });

  it('excludes a commercial listing when hideCommercial is true', () => {
    const l = listing('commercial', { price: 200000 });
    expect(passesListingFilters(l, {}, [100000, 300000], true)).toBe(false);
  });

  it('passes a listing that satisfies the source, price and commercial checks', () => {
    const l = listing('house', { source: 'zimmo', price: 200000 });
    expect(passesListingFilters(l, { zimmo: true }, [100000, 300000], true)).toBe(true);
  });
});

describe('resolveHideCommercial', () => {
  it("reads the matching participant's own preference", () => {
    const participants = [{ id: 'a', hideCommercial: false }, { id: 'b', hideCommercial: true }];
    expect(resolveHideCommercial(participants, 'a')).toBe(false);
    expect(resolveHideCommercial(participants, 'b')).toBe(true);
  });

  it('defaults to hidden when the field is unset on the matching participant', () => {
    expect(resolveHideCommercial([{ id: 'a' }], 'a')).toBe(true);
  });

  it('defaults to hidden when no participant matches myUserId', () => {
    expect(resolveHideCommercial([{ id: 'a', hideCommercial: false }], 'b')).toBe(true);
    expect(resolveHideCommercial([{ id: 'a', hideCommercial: false }], null)).toBe(true);
    expect(resolveHideCommercial([], 'a')).toBe(true);
  });
});
