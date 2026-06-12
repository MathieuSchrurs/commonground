import { describe, expect, it } from 'vitest';
import { dedupeAcrossSources } from './dedupe';
import { PropertyListing } from './types';

function listing(overrides: Partial<PropertyListing> & { source: PropertyListing['source'] }): PropertyListing {
  return {
    external_id: Math.random().toString(36).slice(2),
    url: 'https://example.com',
    ...overrides,
  };
}

describe('dedupeAcrossSources', () => {
  it('merges listings sharing the same normalized street address', () => {
    const a = listing({
      source: 'zimmo',
      address: 'Veldstraat 12, Gent',
      postal_code: '9000',
      price: 350000,
    });
    const b = listing({
      source: 'realo',
      address: 'veldstraat 12,  gent, Belgium',
      postal_code: '9000',
      price: 350000,
    });

    const { listings, merged } = dedupeAcrossSources([a, b]);
    expect(listings).toHaveLength(1);
    expect(merged).toBe(1);
    // realo outranks zimmo
    expect(listings[0].source).toBe('realo');
  });

  it('merges address-less listings that are geographically and price-wise identical', () => {
    const a = listing({
      source: 'immoweb',
      latitude: 51.05,
      longitude: 3.72,
      price: 400000,
      property_type: 'house',
    });
    const b = listing({
      source: 'immovlan',
      latitude: 51.05001, // ~1 m away
      longitude: 3.72001,
      price: 402000, // within 2%
      property_type: 'house',
    });

    const { listings, merged } = dedupeAcrossSources([a, b]);
    expect(listings).toHaveLength(1);
    expect(merged).toBe(1);
    // immoweb outranks immovlan
    expect(listings[0].source).toBe('immoweb');
  });

  it('keeps distinct properties apart', () => {
    const a = listing({
      source: 'immoweb',
      address: 'Veldstraat 12',
      postal_code: '9000',
      latitude: 51.05,
      longitude: 3.72,
      price: 400000,
      property_type: 'house',
    });
    const b = listing({
      source: 'immoweb',
      address: 'Kortrijksesteenweg 800',
      postal_code: '9000',
      latitude: 51.02,
      longitude: 3.70,
      price: 400000,
      property_type: 'house',
    });

    const { listings, merged } = dedupeAcrossSources([a, b]);
    expect(listings).toHaveLength(2);
    expect(merged).toBe(0);
  });

  it('does not merge nearby listings with different prices', () => {
    const a = listing({
      source: 'immoweb',
      latitude: 51.05,
      longitude: 3.72,
      price: 400000,
      property_type: 'house',
    });
    const b = listing({
      source: 'zimmo',
      latitude: 51.05,
      longitude: 3.72,
      price: 500000, // way more than 2% apart
      property_type: 'house',
    });

    const { listings } = dedupeAcrossSources([a, b]);
    expect(listings).toHaveLength(2);
  });
});
