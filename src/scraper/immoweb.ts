import * as cheerio from 'cheerio';
import { PropertyListing } from './types';

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

// Try to extract listings from Immoweb's embedded __NEXT_DATA__ JSON
function extractFromNextData(html: string): PropertyListing[] | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;

  let nextData: Record<string, unknown>;
  try {
    nextData = JSON.parse(match[1]);
  } catch {
    console.log('[Immoweb] Failed to parse __NEXT_DATA__ JSON');
    return null;
  }

  // Try multiple known paths for the results array
  const pageProps = (nextData?.props as Record<string, unknown>)?.pageProps as Record<string, unknown>;
  const results: unknown[] =
    (pageProps?.searchResult as Record<string, unknown>)?.results as unknown[] ??
    pageProps?.results as unknown[] ??
    pageProps?.classifieds as unknown[] ??
    (pageProps?.data as Record<string, unknown>)?.results as unknown[] ??
    [];

  if (!Array.isArray(results) || results.length === 0) {
    console.log('[Immoweb] __NEXT_DATA__ found but no results at expected paths. Keys:', Object.keys(pageProps ?? {}));
    return null;
  }

  console.log(`[Immoweb] Extracted ${results.length} results from __NEXT_DATA__`);

  return results.map((item: unknown) => {
    const r = item as Record<string, unknown>;
    const property = r.property as Record<string, unknown> ?? {};
    const loc = (r.property as Record<string, unknown>)?.location as Record<string, unknown>
      ?? r.property_location as Record<string, unknown>
      ?? {};
    const price = r.price as Record<string, unknown> ?? {};
    const images = r.images as Record<string, unknown>[] ?? [];
    const id = String(r.id ?? r.classifiedId ?? '');
    const slug = r.url as string ?? r.slug as string ?? '';
    const fullUrl = slug.startsWith('http') ? slug : `https://www.immoweb.be${slug}`;

    const street = loc.street as string ?? '';
    const number = loc.number as string ?? loc.streetNumber as string ?? '';
    const city = loc.city as string ?? loc.locality as string ?? '';
    const postal_code = String(loc.postalCode ?? loc.zip ?? '');
    const addressParts = [street, number].filter(Boolean).join(' ');
    const address = [addressParts, city].filter(Boolean).join(', ') || undefined;

    return {
      source: 'immoweb' as const,
      external_id: id,
      url: fullUrl || `https://www.immoweb.be/en/classified/${id}`,
      title: property.title as string ?? undefined,
      address,
      city: city || undefined,
      postal_code: postal_code || undefined,
      price: (price.mainValue ?? price.price) as number ?? undefined,
      property_type: mapType(property.type as string ?? property.subtype as string),
      bedrooms: property.bedroomCount as number ?? undefined,
      surface_area: (property.netHabitableSurface ?? property.livingArea) as number ?? undefined,
      land_area: (property as Record<string, unknown>)?.land ? ((property as Record<string, unknown>).land as Record<string, unknown>).surface as number : undefined,
      image_url: (images[0]?.mediumUrl as string) ?? (images[0]?.url as string) ?? undefined,
    };
  }).filter(l => l.external_id);
}

// Fallback: parse HTML article cards directly
function extractFromHtml(html: string): PropertyListing[] {
  const $ = cheerio.load(html);
  const listings: PropertyListing[] = [];

  // Try JSON-LD structured data first
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? '');
      const items = Array.isArray(data) ? data : [data];
      items.forEach((item: Record<string, unknown>) => {
        if (item['@type'] === 'Product' || item['@type'] === 'Offer') {
          const id = String(item.productID ?? item['@id'] ?? '');
          if (id) {
            listings.push({
              source: 'immoweb',
              external_id: id,
              url: item.url as string ?? '',
              title: item.name as string ?? undefined,
              price: (item.offers as Record<string, unknown>)?.price as number ?? undefined,
            });
          }
        }
      });
    } catch { /* skip */ }
  });

  if (listings.length > 0) return listings;

  // Last resort: article cards
  $('article[data-classified-id]').each((_, el) => {
    const card = $(el);
    const id = card.attr('data-classified-id') ?? '';
    if (!id) return;

    const anchor = card.find('a[href*="/classified/"]').first();
    const href = anchor.attr('href') ?? '';
    const url = href.startsWith('http') ? href : `https://www.immoweb.be${href}`;

    const priceText = card.find('[class*="price"]').first().text().replace(/[^\d]/g, '');
    const locality = card.find('[class*="locality"], [class*="location"], [class*="city"]').first().text().trim();
    const localityMatch = locality.match(/^(\d{4})\s+(.+)$/);

    listings.push({
      source: 'immoweb',
      external_id: id,
      url,
      address: locality || undefined,
      city: (localityMatch?.[2] ?? locality) || undefined,
      postal_code: localityMatch?.[1] ?? undefined,
      price: priceText ? parseInt(priceText, 10) : undefined,
      image_url: card.find('img').first().attr('src'),
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

  // Try __NEXT_DATA__ first, fall back to HTML parsing
  const fromNext = extractFromNextData(html);
  if (fromNext !== null) {
    return { listings: fromNext, blocked: false };
  }

  const fromHtml = extractFromHtml(html);
  console.log(`[Immoweb] HTML fallback found ${fromHtml.length} listings`);
  return { listings: fromHtml, blocked: false };
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
