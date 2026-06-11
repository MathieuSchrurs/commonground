import { describe, expect, it } from 'vitest';
import { dedupeById, mapPropertyType } from './common';
import { PropertyListing } from './types';

describe('mapPropertyType', () => {
  it('maps house-like types to house', () => {
    expect(mapPropertyType('HOUSE')).toBe('house');
    expect(mapPropertyType('VILLA')).toBe('house');
    expect(mapPropertyType('farmhouse')).toBe('house');
    expect(mapPropertyType('castle')).toBe('house');
    expect(mapPropertyType('residence')).toBe('house');
  });

  it('maps apartment-like types to apartment', () => {
    expect(mapPropertyType('APARTMENT')).toBe('apartment');
    expect(mapPropertyType('studio')).toBe('apartment');
    expect(mapPropertyType('penthouse')).toBe('apartment');
    expect(mapPropertyType('duplex')).toBe('apartment');
  });

  it('treats ground-floor as apartment, not land', () => {
    expect(mapPropertyType('ground-floor')).toBe('apartment');
  });

  it('maps land-like types to land', () => {
    expect(mapPropertyType('building-plot')).toBe('land');
    expect(mapPropertyType('LAND')).toBe('land');
  });

  it('falls back to other', () => {
    expect(mapPropertyType('garage')).toBe('other');
    expect(mapPropertyType(undefined)).toBe('other');
    expect(mapPropertyType('')).toBe('other');
  });
});

describe('dedupeById', () => {
  it('keeps the first listing for each external_id', () => {
    const make = (id: string, price?: number): PropertyListing => ({
      source: 'immoweb',
      external_id: id,
      url: `https://example.com/${id}`,
      price,
    });

    const result = dedupeById([make('1', 100), make('2'), make('1', 999)]);
    expect(result).toHaveLength(2);
    expect(result[0].price).toBe(100);
  });

  it('handles empty input', () => {
    expect(dedupeById([])).toEqual([]);
  });
});
