import * as cheerio from 'cheerio';
import { PropertyListing } from './types';

// Immoweb embeds the full listing payload (incl. lat/lng) as a Vue prop on
// every search-result card. We pull the JSON out of the `:classified="..."`
// attribute. Shape covers what we read.
interface ImmowebPayload {
  id: number;
  property?: {
    type?: string;
    subtype?: string;
    title?: string;
    bedroomCount?: number;
    netHabitableSurface?: number;
    landSurface?: number;
    location?: {
      street?: string;
      number?: string;
      locality?: string;
      postalCode?: string | number;
      latitude?: number;
      longitude?: number;
    };
  };
  price?: { mainValue?: number };
  transaction?: { sale?: { price?: number } };
  media?: { pictures?: Array<{ mediumUrl?: string; largeUrl?: string }> };
}

const SEARCH_URL = 'https://www.immoweb.be/en/search/house,villa,bungalow,farmhouse,country-cottage,apartment/for-sale/belgium';

// Headers that closely mimic a real Chrome browser on macOS
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'nl-BE,nl;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

function mapType(type?: string): PropertyListing['property_type'] {
  const t = (type ?? '').toLowerCase();
  if (t.includes('apartment') || t.includes('flat') || t.includes('studio')) return 'apartment';
  if (t.includes('land') || t.includes('plot') || t.includes('ground')) return 'land';
  if (t.includes('house') || t.includes('villa') || t.includes('bungalow') || t.includes('cottage') || t.includes('farm')) return 'house';
  return 'other';
}

// Decode the small set of HTML entities Immoweb uses inside Vue prop attrs.
// cheerio already decodes `&quot;` when reading via .attr(), so this is for
// raw-string fallbacks only.
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'");
}

// The page renders `<article id="classified_NNNN">` cards. Every card has an
// `<iw-classified-item-bookmark :classified="{...JSON...}">` child whose JSON
// payload holds the entire listing — including lat/lng. We parse from there.
function extractListings(html: string): PropertyListing[] {
  const $ = cheerio.load(html);
  const listings: PropertyListing[] = [];

  $('article[id^="classified_"]').each((_, el) => {
    const card = $(el);
    const id = card.attr('id')?.replace(/^classified_/, '') ?? '';
    if (!id) return;

    // Anchor on the title carries the public URL
    const href = card.find('a.card__title-link, a[href*="/classified/"]').first().attr('href') ?? '';
    const url = href.startsWith('http') ? href : `https://www.immoweb.be${href}`;

    // The bookmark element holds the full JSON. cheerio decodes &quot; for us.
    const raw = card.find('iw-classified-item-bookmark').attr(':classified')
      ?? card.find('iw-classified-item-bookmark').attr('classified');

    let payload: ImmowebPayload | null = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        // Some Vue serializations leave HTML-encoded payloads — try one decode.
        try { payload = JSON.parse(decodeEntities(raw)); } catch { /* give up */ }
      }
    }

    if (!payload) {
      // No JSON for this card — keep a stub so we at least know the URL exists.
      listings.push({
        source: 'immoweb',
        external_id: id,
        url: url || `https://www.immoweb.be/en/classified/${id}`,
      });
      return;
    }

    const loc = payload.property?.location;
    const street = loc?.street ?? '';
    const number = loc?.number ?? '';
    const city = loc?.locality ?? '';
    const postal = loc?.postalCode != null ? String(loc.postalCode) : undefined;
    const addressLine = [street, number].filter(Boolean).join(' ').trim();
    const address = [addressLine, postal && city ? `${postal} ${city}` : city].filter(Boolean).join(', ') || undefined;

    listings.push({
      source: 'immoweb',
      external_id: id,
      url: url || `https://www.immoweb.be/en/classified/${id}`,
      title: payload.property?.title,
      address,
      city: city || undefined,
      postal_code: postal,
      latitude: loc?.latitude,
      longitude: loc?.longitude,
      price: payload.price?.mainValue ?? payload.transaction?.sale?.price,
      property_type: mapType(payload.property?.type ?? payload.property?.subtype),
      bedrooms: payload.property?.bedroomCount,
      surface_area: payload.property?.netHabitableSurface,
      land_area: payload.property?.landSurface,
      image_url: payload.media?.pictures?.[0]?.mediumUrl ?? payload.media?.pictures?.[0]?.largeUrl,
    });
  });

  return listings;
}

async function fetchPage(pageNum: number, bbox?: [number, number, number, number]): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  let url = `${SEARCH_URL}?orderBy=newest&page=${pageNum}`;
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    // Immoweb bbox format: ne=lat,lng&sw=lat,lng (note: lat,lng order)
    url += `&ne=${maxLat},${maxLng}&sw=${minLat},${minLng}`;
  }

  console.log(`[Immoweb] Fetching page ${pageNum}: ${url}`);

  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS });
  } catch (err) {
    console.error('[Immoweb] Network error:', err);
    return { listings: [], blocked: false };
  }

  console.log(`[Immoweb] Response status: ${res.status}`);

  if (!res.ok) {
    console.warn(`[Immoweb] HTTP ${res.status} — site may be blocking requests`);
    return { listings: [], blocked: res.status === 403 || res.status === 429 };
  }

  const html = await res.text();
  console.log(`[Immoweb] HTML length: ${html.length} chars`);

  if (html.length < 5000) {
    console.warn('[Immoweb] Response is suspiciously short — likely a block/captcha page');
    return { listings: [], blocked: true };
  }

  const listings = extractListings(html);
  console.log(`[Immoweb] Parsed ${listings.length} listings`);
  return { listings, blocked: false };
}

export async function scrapeImmoweb(
  bbox: [number, number, number, number],
  maxPages = 3
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  console.log(`[Immoweb] Starting scrape — bbox: ${bbox.join(', ')}, pages: ${maxPages}`);

  const all: PropertyListing[] = [];
  let blocked = false;

  for (let p = 1; p <= maxPages; p++) {
    const result = await fetchPage(p, bbox);
    blocked = result.blocked;
    console.log(`[Immoweb] Page ${p}: ${result.listings.length} listings${result.blocked ? ' (BLOCKED)' : ''}`);
    all.push(...result.listings);
    if (result.blocked || result.listings.length === 0) break;
    if (p < maxPages) await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`[Immoweb] Done. Total: ${all.length} listings`);
  return { listings: all, blocked };
}
