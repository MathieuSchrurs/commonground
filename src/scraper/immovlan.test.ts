import { describe, expect, it, vi } from 'vitest';
import { parseCards, parsePrice, scrapeImmovlan } from './immovlan';
import { Area } from './areas';
import * as common from './common';

// Keep runWithConcurrency and dedupeById real (that's the seam under test —
// scrapeImmovlan driving the shared pool), but fake scrapePaginated so we can
// observe how many town-scrapes are in flight at once without real network
// calls or real per-page delays.
vi.mock('./common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./common')>();
  return {
    ...actual,
    scrapePaginated: vi.fn(),
  };
});

const card = `
  <article itemscope itemtype="http://schema.org/House"
           data-url="https://immovlan.be/en/detail/house/for-sale/9000/gent/rbs12345">
    <span itemprop="postalCode">9000</span>
    <span itemprop="addressLocality">Gent</span>
    <div class="list-item-price">650 000 €</div>
    <div class="property-highlight"><strong>3</strong> bedrooms</div>
    <div class="property-highlight"><strong>150</strong> m²</div>
    <div class="media-pic"><img data-src="https://img.example.com/1.jpg" /></div>
  </article>`;

describe('parseCards', () => {
  it('parses a listing card', () => {
    const [listing] = parseCards(`<html><body>${card}</body></html>`);

    expect(listing).toMatchObject({
      source: 'immovlan',
      external_id: 'rbs12345',
      url: 'https://immovlan.be/en/detail/house/for-sale/9000/gent/rbs12345',
      city: 'Gent',
      postal_code: '9000',
      price: 650000,
      property_type: 'house',
      bedrooms: 3,
      surface_area: 150,
      image_url: 'https://img.example.com/1.jpg',
    });
  });

  it('skips multi-unit projects (no /detail/ in the URL)', () => {
    const html = `
      <article itemscope itemtype="http://schema.org/Place"
               data-url="https://immovlan.be/en/projectdetail/1132102-1049619">
      </article>`;
    expect(parseCards(html)).toEqual([]);
  });
});

describe('scrapeImmovlan', () => {
  it('scrapes towns through the shared pool at a concurrency of 2', async () => {
    let current = 0;
    let max = 0;

    const scrapePaginated = common.scrapePaginated as unknown as ReturnType<typeof vi.fn>;
    scrapePaginated.mockImplementation(async () => {
      current++;
      max = Math.max(max, current);
      await new Promise(r => setTimeout(r, 20));
      current--;
      return { listings: [], blocked: false };
    });

    const areas: Area[] = Array.from({ length: 5 }, (_, i) => ({
      postalCode: `900${i}`,
      city: `City${i}`,
      citySlug: `city-${i}`,
    }));

    await scrapeImmovlan(areas, 1, 5);

    expect(max).toBe(2);
  });
});

describe('parsePrice', () => {
  it('parses a simple price', () => {
    expect(parsePrice('650 000 €')).toBe(650000);
  });

  it('takes the first price of a range', () => {
    expect(parsePrice('225 000 € - 392 655 €')).toBe(225000);
  });

  it('returns undefined when there is no number', () => {
    expect(parsePrice('Price on request')).toBeUndefined();
  });
});
