import { describe, expect, it } from 'vitest';
import { roundIntegerFields } from './db';
import { PropertyListing } from './types';

const base: PropertyListing = {
  source: 'realo',
  external_id: '1',
  url: 'https://example.com/1',
};

describe('roundIntegerFields', () => {
  it('rounds fractional prices to integers (BIGINT-safe)', () => {
    const out = roundIntegerFields({ ...base, price: 415580.07 });
    expect(out.price).toBe(415580);
  });

  it('rounds bedrooms, surface_area and land_area', () => {
    const out = roundIntegerFields({
      ...base,
      bedrooms: 3.0,
      surface_area: 120.4,
      land_area: 250.6,
    });
    expect(out.bedrooms).toBe(3);
    expect(out.surface_area).toBe(120);
    expect(out.land_area).toBe(251);
  });

  it('leaves undefined fields untouched', () => {
    const out = roundIntegerFields({ ...base });
    expect(out.price).toBeUndefined();
    expect(out.bedrooms).toBeUndefined();
  });

  it('does not mutate the original listing', () => {
    const input = { ...base, price: 99.9 };
    roundIntegerFields(input);
    expect(input.price).toBe(99.9);
  });
});
