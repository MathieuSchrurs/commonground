import { describe, expect, it, vi } from 'vitest';
import { parseCards, scrapeImmoscoop } from './immoscoop';
import { Area } from './areas';
import * as common from './common';

// Keep runWithConcurrency and dedupeById real (that's the seam under test —
// scrapeImmoscoop driving the shared pool), but fake scrapePaginated so we can
// observe how many city-scrapes are in flight at once without real network
// calls or real per-page delays.
vi.mock('./common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./common')>();
  return {
    ...actual,
    scrapePaginated: vi.fn(),
  };
});

// Mirrors the live card structure: anchor with data-selector children
const card = `
  <a href="/te-koop/9000-gent/1146868" class="rounded-lg bg-white shadow-card">
    <div data-selector="property-card:media">
      <img data-selector="property-card:image" src="https://images.immoscoop.be/cp-abc123.jpg" alt="" />
    </div>
    <div data-selector="property-card:content">
      <h3 data-selector="property-card:title">Huis - Te koopGent</h3>
      <span data-selector="property-card:price">€ 499.000</span>
      <span data-selector="property-card:address">Sleepstraat 1379000 Gent</span>
    </div>
  </a>`;

describe('parseCards (immoscoop)', () => {
  it('parses a listing card', () => {
    const [listing] = parseCards(`<html><body>${card}</body></html>`);

    expect(listing).toMatchObject({
      source: 'immoscoop',
      external_id: '1146868',
      url: 'https://www.immoscoop.be/te-koop/9000-gent/1146868',
      title: 'Huis - Te koopGent',
      // street and postal+city are concatenated in the source markup
      address: 'Sleepstraat 137, 9000 Gent',
      city: 'Gent',
      postal_code: '9000',
      price: 499000,
      property_type: 'house',
      image_url: 'https://images.immoscoop.be/cp-abc123.jpg',
    });
  });

  it('maps Dutch apartment types', () => {
    const apt = card
      .replace('Huis - Te koopGent', 'Appartement - Te koopGent')
      .replace('/te-koop/9000-gent/1146868', '/te-koop/9000-gent/555');
    const [listing] = parseCards(apt);
    expect(listing.property_type).toBe('apartment');
  });

  it('ignores non-listing te-koop links (no numeric id)', () => {
    const html = '<a href="/te-koop/gent">all listings in Gent</a>';
    expect(parseCards(html)).toEqual([]);
  });

  it('falls back to URL parts when the address is missing', () => {
    const html = '<a href="/te-koop/9051-sint-denijs-westrem/777"><span data-selector="property-card:price">€ 250.000</span></a>';
    const [listing] = parseCards(html);
    expect(listing.postal_code).toBe('9051');
    expect(listing.city).toBe('sint denijs westrem');
  });
});

describe('scrapeImmoscoop', () => {
  it('scrapes cities through the shared pool at a concurrency of 2', async () => {
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

    await scrapeImmoscoop(areas, 1, 5);

    expect(max).toBe(2);
  });
});
