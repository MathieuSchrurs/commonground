import * as cheerio from 'cheerio';
import { PropertyListing } from './types';
import { Area } from './areas';
import { mapPropertyType, scrapePaginated, dedupeById } from './common';

const BASE_URL = 'https://www.immoscoop.be/zoeken/te-koop';

// Cities scraped per run; each costs maxPages requests
const MAX_CITIES = 6;

function parsePrice(raw: string): number | undefined {
  // "€ 499.000" — dots are thousands separators
  const match = raw.match(/€\s*([\d.\s]+)/);
  if (!match) return undefined;
  const n = parseInt(match[1].replace(/[.\s]/g, ''), 10);
  return isNaN(n) ? undefined : n;
}

// Cards are <a href="/te-koop/9000-gent/1146868"> elements with stable
// data-selector attributes for price/address/title.
export function parseCards(html: string): PropertyListing[] {
  const $ = cheerio.load(html);
  const listings: PropertyListing[] = [];

  $('a[href^="/te-koop/"]').each((_, el) => {
    const card = $(el);
    const href = card.attr('href') ?? '';
    // /te-koop/{postal}-{city-slug}/{id} — some cards omit the postal prefix
    const m = href.match(/^\/te-koop\/(?:(\d{4})-)?([a-z0-9-]+)\/(\d+)$/);
    if (!m) return;
    const [, urlPostal, urlCitySlug, id] = m;

    // "Huis - Te koopGent" → property type before the dash
    const title = card.find('[data-selector="property-card:title"]').text().trim();
    const typeRaw = title.split('-')[0]?.trim();

    const price = parsePrice(card.find('[data-selector="property-card:price"]').text());

    // "Sleepstraat 1379000 Gent" — street+number and postal+city are
    // concatenated without a separator; the last 4-digit group before the
    // trailing city name is the postal code.
    const addrRaw = card.find('[data-selector="property-card:address"]').text().replace(/\s+/g, ' ').trim();
    const addrMatch = addrRaw.match(/^(.*?)(\d{4})\s+([^\d]+)$/);
    const street = addrMatch?.[1]?.trim();
    const postal = addrMatch?.[2] ?? urlPostal;
    const city = addrMatch?.[3]?.trim() ?? urlCitySlug.replace(/-/g, ' ');
    const address = [street, postal && city ? `${postal} ${city}` : city].filter(Boolean).join(', ') || undefined;

    const image = card.find('[data-selector="property-card:image"]').first().attr('src');

    listings.push({
      source: 'immoscoop',
      external_id: id,
      url: `https://www.immoscoop.be${href}`,
      title: title || undefined,
      address,
      city,
      postal_code: postal,
      price,
      property_type: mapPropertyType(typeRaw),
      image_url: image || undefined,
    });
  });

  return listings;
}

// ImmoScoop filters by city through the URL path (/zoeken/te-koop/gent);
// query-param variants silently return unfiltered national results.
export async function scrapeImmoscoop(
  areas: Area[],
  maxPages = 3
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  const citySlugs = [...new Set(areas.map(a => a.citySlug).filter(Boolean))].slice(0, MAX_CITIES);
  if (citySlugs.length === 0) return { listings: [], blocked: false };
  console.log(`[ImmoScoop] Starting scrape — cities: ${citySlugs.join(', ')}, ${maxPages} pages each`);

  const all: PropertyListing[] = [];
  let blocked = false;

  for (const slug of citySlugs) {
    const result = await scrapePaginated({
      label: 'ImmoScoop',
      maxPages,
      delayMs: 1000,
      buildUrl: page => `${BASE_URL}/${slug}?page=${page}`,
      parse: parseCards,
    });
    all.push(...result.listings);
    blocked = blocked || result.blocked;
    if (result.blocked) break;
    await new Promise(r => setTimeout(r, 800));
  }

  const unique = dedupeById(all);
  console.log(`[ImmoScoop] Done. ${unique.length} unique listings across ${citySlugs.length} cities`);
  return { listings: unique, blocked };
}
