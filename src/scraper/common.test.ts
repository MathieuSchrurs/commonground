import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dedupeById, mapPropertyType, scrapePaginated } from './common';
import { PropertyListing } from './types';
import { DIRECT_FETCH_TIMEOUT_MS, fetchWithTimeout, PROXIED_FETCH_TIMEOUT_MS } from '../lib/http';

vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

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

  it('maps Dutch vocabulary (ImmoScoop)', () => {
    expect(mapPropertyType('Huis')).toBe('house');
    expect(mapPropertyType('Appartement')).toBe('apartment');
    expect(mapPropertyType('Bouwgrond')).toBe('land');
    expect(mapPropertyType('Hoeve')).toBe('house');
  });

  it('maps commercial-like types to commercial', () => {
    expect(mapPropertyType('office')).toBe('commercial');
    expect(mapPropertyType('retail')).toBe('commercial');
    expect(mapPropertyType('industrial')).toBe('commercial');
    expect(mapPropertyType('kantoor')).toBe('commercial');
    expect(mapPropertyType('winkel')).toBe('commercial');
    expect(mapPropertyType('bedrijfsruimte')).toBe('commercial');
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

describe('scrapePaginated fetch timeouts', () => {
  const mockResponse = {
    ok: true,
    status: 200,
    text: () => Promise.resolve('x'.repeat(6000)),
  } as unknown as Response;

  const baseOpts = {
    label: 'test-source',
    maxPages: 1,
    delayMs: 0,
    buildUrl: (page: number) => `https://example.com/page/${page}`,
    parse: () => [] as PropertyListing[],
  };

  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockClear();
    vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);
  });

  it('uses the proxied timeout when proxied is true', async () => {
    await scrapePaginated({ ...baseOpts, proxied: true });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      PROXIED_FETCH_TIMEOUT_MS
    );
  });

  it('uses the direct timeout when proxied is false', async () => {
    await scrapePaginated({ ...baseOpts, proxied: false });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      DIRECT_FETCH_TIMEOUT_MS
    );
  });
});
