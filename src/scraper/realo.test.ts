import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCards, parsePrice, scrapeRealo } from './realo';
import { Area } from './areas';
import * as common from './common';

// Keep runWithConcurrency and dedupeById real (that's the seam under test —
// scrapeRealo driving the shared pool), but fake scrapePaginated so we can
// observe how many search-URL scrapes are in flight at once without real
// network calls or real per-page delays.
vi.mock('./common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./common')>();
  return {
    ...actual,
    scrapePaginated: vi.fn(),
  };
});

describe('parsePrice', () => {
  it('parses Belgian dot-separated thousands', () => {
    expect(parsePrice('€ 1.245.000')).toBe(1245000);
  });

  it('returns undefined without a euro sign', () => {
    expect(parsePrice('1.245.000')).toBeUndefined();
  });
});

describe('parseCards', () => {
  it('parses a grid item from its data attributes', () => {
    const html = `
      <div>before</div>
      <div data-scope="componentEstateGridItem" class="component-estate-grid-item house">
        <a data-href="/en/veldstraat-9000-gent/123456">Veldstraat</a>
        <span>€ 350.000</span>
        <span>3 bed</span>
        <span>120 m²</span>
        <div data-images="{srcAt2x&quot;:&quot;https:\\/\\/realocdn.com\\/image\\/5\\/abc.jpg\\/736x491&quot;}"></div>
      </div>`;

    const [listing] = parseCards(html);
    expect(listing).toMatchObject({
      source: 'realo',
      external_id: '123456',
      url: 'https://www.realo.be/en/veldstraat-9000-gent/123456',
      address: 'veldstraat, 9000 gent',
      city: 'gent',
      postal_code: '9000',
      price: 350000,
      bedrooms: 3,
      surface_area: 120,
      // entity-encoded, slash-escaped JSON must still yield a clean URL
      image_url: 'https://realocdn.com/image/5/abc.jpg/736x491',
    });
  });

  it('returns nothing when no grid items are present', () => {
    expect(parseCards('<html><body>empty</body></html>')).toEqual([]);
  });

  it('classifies an office listing as commercial', () => {
    const html = `
      <div>before</div>
      <div data-scope="componentEstateGridItem" class="component-estate-grid-item office">
        <a data-href="/en/kantoorstraat-9000-gent/654321">Kantoorstraat</a>
        <span>€ 480.000</span>
        <span>200 m²</span>
        <div data-images="{srcAt2x&quot;:&quot;https:\\/\\/realocdn.com\\/image\\/6\\/def.jpg\\/736x491&quot;}"></div>
      </div>`;

    const [listing] = parseCards(html);
    expect(listing.property_type).toBe('commercial');
  });
});

describe('scrapeRealo', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('scrapes search URLs through the shared pool at a concurrency of 2', async () => {
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

    // Each postal code resolves to a distinct search URL via Realo's
    // suggest API, avoided here with a fake fetch keyed on the query.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const pcMatch = url.match(/q=(\d+)/);
      const pc = pcMatch ? pcMatch[1] : 'unknown';
      return {
        ok: true,
        json: async () => ({
          data: { suggestions: [{ forSaleUrl: `/en/search/for-sale/${pc}` }] },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const areas: Area[] = Array.from({ length: 5 }, (_, i) => ({
      postalCode: `900${i}`,
      city: `City${i}`,
      citySlug: `city-${i}`,
    }));

    await scrapeRealo(areas, 1);

    expect(max).toBe(2);
  });
});
