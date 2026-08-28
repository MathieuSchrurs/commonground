import { describe, expect, it } from 'vitest';
import { dedupeById, mapPropertyType, runWithConcurrency } from './common';
import { PropertyListing } from './types';

// A controllable promise: the test decides exactly when it settles, so we can
// assert what's in-flight at a given instant without racing real timers.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

// Lets pending .then() chains inside runWithConcurrency run before we assert.
const flush = () => new Promise(r => setTimeout(r, 0));

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

describe('runWithConcurrency', () => {
  it('never runs more than `concurrency` workers at once', async () => {
    const items = [0, 1, 2, 3, 4];
    const deferreds = items.map(() => deferred<number>());
    let live = 0;
    let maxLive = 0;

    const resultsPromise = runWithConcurrency(items, 2, async (item) => {
      live++;
      maxLive = Math.max(maxLive, live);
      try {
        return await deferreds[item].promise;
      } finally {
        live--;
      }
    });

    await flush();
    expect(live).toBe(2); // only the first two started

    // Resolve one at a time; each resolution should free a slot for the next.
    for (const item of items) {
      deferreds[item].resolve(item * 10);
      await flush();
    }

    const results = await resultsPromise;
    expect(results).toEqual([0, 10, 20, 30, 40]);
    expect(maxLive).toBeLessThanOrEqual(2);
    expect(maxLive).toBe(2); // with 5 items and concurrency 2 this must be hit
  });

  it('returns results in input order even when they resolve out of order', async () => {
    const items = ['a', 'b', 'c'];
    const deferreds = items.map(() => deferred<string>());

    const resultsPromise = runWithConcurrency(items, 3, (item) =>
      deferreds[items.indexOf(item)].promise
    );

    await flush();
    // Resolve out of order: c, then a, then b.
    deferreds[2].resolve('C');
    await flush();
    deferreds[0].resolve('A');
    await flush();
    deferreds[1].resolve('B');

    const results = await resultsPromise;
    expect(results).toEqual(['A', 'B', 'C']);
  });

  it('stops dispatching new items once stopWhen matches, without abandoning in-flight ones', async () => {
    const items = [0, 1, 2, 3, 4, 5];
    const deferreds = items.map(() => deferred<number>());
    const started: number[] = [];

    const resultsPromise = runWithConcurrency(
      items,
      2,
      async (item) => {
        started.push(item);
        return deferreds[item].promise;
      },
      (result) => result === 1
    );

    await flush();
    expect(started).toEqual([0, 1]); // only the first two dispatched so far

    // Resolving item 1 satisfies stopWhen — no further items should dispatch.
    deferreds[1].resolve(1);
    await flush();
    expect(started).toEqual([0, 1]);

    // Item 0 was already in flight before the stop; it must still resolve
    // and land in the output, rather than being abandoned.
    deferreds[0].resolve(0);
    const results = await resultsPromise;

    expect(started).toEqual([0, 1]); // never grew — items 2-5 were never called
    expect(results[0]).toBe(0);
    expect(results[1]).toBe(1);
    expect(results.length).toBe(6);
    expect(2 in results).toBe(false);
  });
});
