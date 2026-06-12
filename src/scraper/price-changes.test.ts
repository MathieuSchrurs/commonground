import { describe, expect, it } from 'vitest';
import { annotatePriceChanges, ExistingPriceRow } from './price-changes';
import { PropertyListing } from './types';

const NOW = '2026-06-12T10:00:00.000Z';

function incoming(external_id: string, price?: number): PropertyListing {
  return { source: 'immoweb', external_id, url: 'https://example.com', price };
}

function stored(external_id: string, price: number | null, overrides: Partial<ExistingPriceRow> = {}): ExistingPriceRow {
  return {
    id: `db-${external_id}`,
    source: 'immoweb',
    external_id,
    price,
    previous_price: null,
    price_changed_at: null,
    ...overrides,
  };
}

describe('annotatePriceChanges', () => {
  it('records a baseline history entry for new listings with a price', () => {
    const { upserts, history } = annotatePriceChanges([incoming('a', 300000)], [], NOW);

    expect(history).toEqual([{ key: 'immoweb:a', price: 300000 }]);
    expect(upserts[0].previous_price).toBeNull();
    expect(upserts[0].price_changed_at).toBeNull();
  });

  it('skips history for new listings without a price', () => {
    const { history } = annotatePriceChanges([incoming('a')], [], NOW);
    expect(history).toEqual([]);
  });

  it('stamps previous_price and history on a price change', () => {
    const { upserts, history } = annotatePriceChanges(
      [incoming('a', 280000)],
      [stored('a', 300000)],
      NOW
    );

    expect(upserts[0].previous_price).toBe(300000);
    expect(upserts[0].price_changed_at).toBe(NOW);
    expect(history).toEqual([{ key: 'immoweb:a', price: 280000 }]);
  });

  it('carries stored values forward when the price is unchanged', () => {
    const { upserts, history } = annotatePriceChanges(
      [incoming('a', 300000)],
      [stored('a', 300000, { previous_price: 320000, price_changed_at: '2026-06-01T00:00:00Z' })],
      NOW
    );

    // The earlier drop (320k -> 300k) must survive this no-change upsert
    expect(upserts[0].previous_price).toBe(320000);
    expect(upserts[0].price_changed_at).toBe('2026-06-01T00:00:00Z');
    expect(history).toEqual([]);
  });

  it('does not treat a missing scraped price as a change', () => {
    const { upserts, history } = annotatePriceChanges(
      [incoming('a')],
      [stored('a', 300000)],
      NOW
    );

    expect(upserts[0].previous_price).toBeNull();
    expect(history).toEqual([]);
  });

  it('gives every upsert row the same columns (bulk upsert requirement)', () => {
    const { upserts } = annotatePriceChanges(
      [incoming('new', 100000), incoming('changed', 90000), incoming('same', 80000)],
      [stored('changed', 95000), stored('same', 80000)],
      NOW
    );

    for (const row of upserts) {
      expect(row).toHaveProperty('previous_price');
      expect(row).toHaveProperty('price_changed_at');
    }
  });
});
