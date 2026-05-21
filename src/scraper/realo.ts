import * as turf from '@turf/turf';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { PropertyListing } from './types';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'nl-BE,nl;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

// Sample a grid of points that fall INSIDE the polygon and reverse-geocode to Belgian postal codes
async function discoverPostalCodes(
  polygon: Feature<Polygon | MultiPolygon>,
  mapboxToken: string
): Promise<string[]> {
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
  const steps = 5;
  const candidates: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lng = minLng + (maxLng - minLng) * (i / steps);
      const lat = minLat + (maxLat - minLat) * (j / steps);
      const pt = turf.point([lng, lat]);
      if (turf.booleanPointInPolygon(pt, polygon)) {
        candidates.push([lng, lat]);
      }
    }
  }

  // Always include the centroid
  const centroid = turf.centroid(polygon);
  candidates.push([centroid.geometry.coordinates[0], centroid.geometry.coordinates[1]]);

  console.log(`[Realo] Sampling ${candidates.length} points inside polygon`);

  const results = await Promise.all(
    candidates.map(async ([lng, lat]) => {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=postcode&country=BE&limit=1&access_token=${mapboxToken}`;
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return (data.features?.[0]?.text as string) ?? null;
    })
  );

  const unique = [...new Set(results.filter((c): c is string => !!c))];
  console.log(`[Realo] Discovered ${unique.length} postal codes inside polygon: ${unique.join(', ')}`);
  return unique;
}

// Use Realo's suggest API to get the proper search URL for a postal code
async function getSearchUrl(postalCode: string): Promise<string | null> {
  const url = `https://www.realo.be/en/search/suggest.json?q=${postalCode}&transaction=for-sale`;
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  }).catch(() => null);
  if (!res?.ok) return null;

  const data = await res.json();
  const first = data.data?.suggestions?.[0];
  if (!first?.forSaleUrl) return null;
  return `https://www.realo.be${first.forSaleUrl}`;
}

function parsePrice(raw: string): number | undefined {
  // Belgian format: € 1.245.000  (dots are thousands separators)
  const match = raw.match(/€\s*([\d.,\s]+)/);
  if (!match) return undefined;
  const cleaned = match[1].replace(/\./g, '').replace(',', '.').replace(/\s/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

function parseCards(html: string, sourceUrl: string): PropertyListing[] {
  const cards = html.split('data-scope="componentEstateGridItem"');
  cards.shift();

  return cards.flatMap(card => {
    // URL slug pattern: /en/{street-slug}-{4digit-postal}-{city-slug}/{id}
    const hrefMatch = card.match(/data-href="(\/en\/([a-z0-9-]+?)-(\d{4})-([a-z0-9-]+)\/(\d+))/);
    if (!hrefMatch) return [];

    const [, path, streetSlug, postalCode, citySlug, id] = hrefMatch;
    const city = citySlug.replace(/-/g, ' ');
    const streetFormatted = streetSlug.replace(/-/g, ' ');
    const address = `${streetFormatted}, ${postalCode} ${city}`;

    const price = parsePrice(card);

    // Cap at sane limits to guard against regex matching IDs/hashes in raw HTML
    const bedsMatch = card.match(/\b(\d{1,3})\s*bed/i);
    const bedsRaw = bedsMatch ? parseInt(bedsMatch[1], 10) : undefined;
    const beds = bedsRaw !== undefined && bedsRaw < 100 ? bedsRaw : undefined;

    const surfaceMatch = card.match(/\b(\d{1,6})\s*m[²2]/i);
    const surfaceRaw = surfaceMatch ? parseInt(surfaceMatch[1], 10) : undefined;
    const surface = surfaceRaw !== undefined && surfaceRaw < 100000 ? surfaceRaw : undefined;

    // First image from the data-images JSON blob
    const imgMatch = card.match(/"srcAt2x":"(https:\/\/realocdn\.com\/[^"]+)"/);
    const imageUrl = imgMatch?.[1];

    // Property type hint from card classes
    const typeHint = card.match(/class="[^"]*component-estate-grid-item[^"]*"/)?.[0] ?? '';
    let property_type: PropertyListing['property_type'] = 'other';
    if (/apartment|flat|studio/i.test(typeHint + card.slice(0, 300))) property_type = 'apartment';
    else if (/house|villa|bungalow/i.test(typeHint + card.slice(0, 300))) property_type = 'house';

    return [{
      source: 'realo' as const,
      external_id: id,
      url: `https://www.realo.be${path}`,
      address,
      city,
      postal_code: postalCode,
      price,
      property_type,
      bedrooms: beds,
      surface_area: surface,
      image_url: imageUrl,
    }];
  });
}

async function scrapeSearchUrl(
  searchUrl: string,
  maxPages: number
): Promise<PropertyListing[]> {
  const all: PropertyListing[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${searchUrl}?page=${page}`;
    console.log(`[Realo] Fetching ${url}`);

    const res = await fetch(url, { headers: BROWSER_HEADERS }).catch(() => null);
    if (!res?.ok) {
      console.warn(`[Realo] HTTP ${res?.status} on ${url}`);
      break;
    }

    const html = await res.text();
    if (html.length < 5000) {
      console.warn('[Realo] Short response, likely blocked');
      break;
    }

    const listings = parseCards(html, url);
    console.log(`[Realo] Page ${page} of ${searchUrl}: ${listings.length} listings`);

    all.push(...listings);

    if (listings.length === 0) break;
    if (page < maxPages) await new Promise(r => setTimeout(r, 800));
  }

  return all;
}

export async function scrapeRealo(
  polygon: Feature<Polygon | MultiPolygon>,
  maxPagesPerPostalCode = 2
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  const mapboxToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!mapboxToken) throw new Error('MAPBOX_SECRET_TOKEN is not set');

  const postalCodes = await discoverPostalCodes(polygon, mapboxToken);
  if (postalCodes.length === 0) {
    console.warn('[Realo] No postal codes discovered inside polygon');
    return { listings: [], blocked: false };
  }

  // Get Realo search URLs for each postal code (deduplicate by URL)
  const searchUrls = new Map<string, string>();
  await Promise.all(
    postalCodes.map(async pc => {
      const url = await getSearchUrl(pc);
      if (url) searchUrls.set(url, pc);
    })
  );

  console.log(`[Realo] Scraping ${searchUrls.size} unique search URLs`);

  const all: PropertyListing[] = [];
  for (const [url] of searchUrls) {
    const listings = await scrapeSearchUrl(url, maxPagesPerPostalCode);
    all.push(...listings);
    await new Promise(r => setTimeout(r, 600));
  }

  // Deduplicate by external_id
  const seen = new Set<string>();
  const unique = all.filter(l => {
    if (seen.has(l.external_id)) return false;
    seen.add(l.external_id);
    return true;
  });

  console.log(`[Realo] Done. ${unique.length} unique listings across ${searchUrls.size} postal codes`);
  return { listings: unique, blocked: false };
}
