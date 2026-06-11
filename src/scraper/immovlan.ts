import * as cheerio from 'cheerio';
import { PropertyListing } from './types';
import { mapPropertyType, scrapePaginated } from './common';

const BASE_URL = 'https://immovlan.be/en/real-estate?transactiontypes=for-sale&propertytypes=house,apartment&countries=BE';

export function parsePrice(raw: string): number | undefined {
  // "650 000 €" → 650000   or   "225 000 € - 392 655 €" → take the first
  const cleaned = raw.replace(/&[#x][a-z0-9]+;/g, ' ').trim();
  const match = cleaned.match(/[\d][\d\s.,]*/);
  if (!match) return undefined;
  const digits = match[0].replace(/[^\d]/g, '');
  const n = parseInt(digits, 10);
  return isNaN(n) ? undefined : n;
}

export function parseCards(html: string): PropertyListing[] {
  const $ = cheerio.load(html);
  const listings: PropertyListing[] = [];

  $('article[itemscope][itemtype="http://schema.org/Place"]').each((_, el) => {
    const card = $(el);
    const url = card.attr('data-url') ?? '';
    if (!url) return;

    // Skip multi-unit "projects" — they're price ranges, not single listings
    if (!url.includes('/detail/')) return;

    // URL pattern: /en/detail/<type>/for-sale/<postal>/<city>/<id>
    const m = url.match(/\/detail\/([a-z-]+)\/for-sale\/(\d{4})\/([a-z0-9-]+)\/([a-z0-9-]+)/i);
    if (!m) return;
    const [, typeSlug, urlPostal, urlCity, externalId] = m;

    // Microdata is the most reliable address source
    const postal = card.find('[itemprop="postalCode"]').text().trim() || urlPostal;
    const city = card.find('[itemprop="addressLocality"]').text().trim() || urlCity.replace(/-/g, ' ');

    const priceText = card.find('.list-item-price').first().text();
    const price = parsePrice(priceText);

    let surface_area: number | undefined;
    let bedrooms: number | undefined;
    card.find('.property-highlight').each((_, ph) => {
      const phEl = $(ph);
      const text = phEl.text().toLowerCase();
      const num = parseInt(phEl.find('strong').text().trim(), 10);
      if (isNaN(num)) return;
      if (text.includes('m²') && surface_area === undefined) surface_area = num;
      if (text.includes('bedroom') && bedrooms === undefined) bedrooms = num;
    });

    const img = card.find('.media-pic img').first();
    const rawImg = img.attr('data-src') ?? img.attr('src') ?? '';
    const image_url = rawImg && !rawImg.includes('nopic.svg') ? rawImg : undefined;

    listings.push({
      source: 'immovlan',
      external_id: externalId,
      url,
      city,
      postal_code: postal,
      price,
      property_type: mapPropertyType(typeSlug),
      bedrooms,
      surface_area,
      image_url,
    });
  });

  return listings;
}

export async function scrapeImmovlan(
  // bbox is accepted for signature parity with the other scrapers; Immovlan's
  // public search doesn't bbox-filter, so the polygon filter in route.ts does
  // the geographic narrowing after geocoding.
  _bbox: [number, number, number, number],
  maxPages = 3
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  console.log(`[Immovlan] Starting scrape — pages: ${maxPages}`);

  return scrapePaginated({
    label: 'Immovlan',
    maxPages,
    delayMs: 1000,
    buildUrl: page => `${BASE_URL}&page=${page}`,
    parse: parseCards,
  });
}
