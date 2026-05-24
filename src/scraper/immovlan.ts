import * as cheerio from 'cheerio';
import { PropertyListing } from './types';

const BASE_URL = 'https://immovlan.be/en/real-estate?transactiontypes=for-sale&propertytypes=house,apartment&countries=BE';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'nl-BE,nl;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6',
  'Accept-Encoding': 'gzip, deflate, br',
};

function parsePrice(raw: string): number | undefined {
  // "650 000 €" → 650000   or   "225 000 € - 392 655 €" → take the first
  const cleaned = raw.replace(/&[#x][a-z0-9]+;/g, ' ').trim();
  const match = cleaned.match(/[\d][\d\s.,]*/);
  if (!match) return undefined;
  const digits = match[0].replace(/[^\d]/g, '');
  const n = parseInt(digits, 10);
  return isNaN(n) ? undefined : n;
}

function mapType(slug: string): PropertyListing['property_type'] {
  const t = slug.toLowerCase();
  if (/apartment|studio|flat|penthouse|ground-floor|duplex|triplex|loft/.test(t)) return 'apartment';
  if (/house|residence|villa|bungalow|cottage|farmhouse|chalet|mansion|castle/.test(t)) return 'house';
  if (/land|plot|ground|building-plot/.test(t)) return 'land';
  return 'other';
}

function parseCards(html: string): PropertyListing[] {
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
      property_type: mapType(typeSlug),
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

  const all: PropertyListing[] = [];
  let blocked = false;

  for (let p = 1; p <= maxPages; p++) {
    const url = `${BASE_URL}&page=${p}`;
    console.log(`[Immovlan] Fetching ${url}`);

    let res: Response;
    try {
      res = await fetch(url, { headers: BROWSER_HEADERS });
    } catch (err) {
      console.error('[Immovlan] Network error:', err);
      break;
    }

    if (!res.ok) {
      console.warn(`[Immovlan] HTTP ${res.status}`);
      blocked = res.status === 403 || res.status === 429;
      break;
    }

    const html = await res.text();
    if (html.length < 5000) {
      console.warn('[Immovlan] Short response, likely blocked');
      blocked = true;
      break;
    }

    const listings = parseCards(html);
    console.log(`[Immovlan] Page ${p}: ${listings.length} listings`);

    if (listings.length === 0) break;
    all.push(...listings);
    if (p < maxPages) await new Promise(r => setTimeout(r, 1000));
  }

  // Dedup within Immovlan by external_id
  const seen = new Set<string>();
  const unique = all.filter(l => {
    if (seen.has(l.external_id)) return false;
    seen.add(l.external_id);
    return true;
  });

  console.log(`[Immovlan] Done. ${unique.length} unique listings`);
  return { listings: unique, blocked };
}
