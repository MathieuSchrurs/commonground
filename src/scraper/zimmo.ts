import * as cheerio from 'cheerio';
import { PropertyListing } from './types';
import { mapPropertyType, scrapePaginated } from './common';

const SEARCH_URL = 'https://www.zimmo.be/en/to-buy/';

function buildSearchUrl(pageNum: number, bbox?: [number, number, number, number]): string {
  const filter: Record<string, unknown> = { filter: {} };
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    (filter.filter as Record<string, unknown>).geo = {
      shape: {
        type: 'envelope',
        coordinates: [[minLng, maxLat], [maxLng, minLat]],
      },
    };
  }
  const encoded = Buffer.from(JSON.stringify(filter)).toString('base64');
  return `${SEARCH_URL}?search=${encoded}&page=${pageNum}`;
}

export function extractFromScripts(html: string): PropertyListing[] | null {
  const $ = cheerio.load(html);

  // Zimmo sometimes stores data in a <script> with a specific variable.
  // cheerio's .html() yields only the script's inner text — no closing
  // </script> tag — so end-of-content must also terminate the match.
  const scriptPatterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});\s*(?:window\.|<\/script>|$)/,
    /window\.__APP_STATE__\s*=\s*({[\s\S]+?});\s*(?:window\.|<\/script>|$)/,
    /__NUXT__\s*=\s*({[\s\S]+?});\s*(?:<\/script>|$)/,
  ];

  for (const pattern of scriptPatterns) {
    let found: Record<string, unknown> | null = null;
    $('script').each((_, el) => {
      if (found) return;
      const content = $(el).html() ?? '';
      const m = content.match(pattern);
      if (m) {
        try { found = JSON.parse(m[1]); } catch { /* skip */ }
      }
    });

    if (found) {
      // Try to find listings array in the parsed state
      const candidates = JSON.stringify(found).match(/"properties":\[{|"listings":\[{|"results":\[{/);
      if (candidates) {
        console.log('[Zimmo] Found state object, attempting extraction');
        // Deep search for array of objects with price/url fields
        function findListings(obj: unknown): unknown[] | null {
          if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') {
            const first = obj[0] as Record<string, unknown>;
            if (first.price !== undefined || first.url !== undefined || first.id !== undefined) {
              return obj;
            }
          }
          if (obj && typeof obj === 'object') {
            for (const val of Object.values(obj as Record<string, unknown>)) {
              const result = findListings(val);
              if (result) return result;
            }
          }
          return null;
        }
        const listings = findListings(found);
        if (listings && listings.length > 0) {
          return listings.map((item: unknown) => {
            const r = item as Record<string, unknown>;
            const id = String(r.id ?? r.propertyId ?? '');
            const url = r.url as string ?? r.detailUrl as string ?? '';
            const fullUrl = url.startsWith('http') ? url : `https://www.zimmo.be${url}`;
            const priceObj = r.price as Record<string, unknown> ?? {};
            const locObj = r.location as Record<string, unknown> ?? r.address as Record<string, unknown> ?? {};

            return {
              source: 'zimmo' as const,
              external_id: id,
              url: fullUrl,
              price: (priceObj.amount ?? priceObj.value ?? r.price) as number ?? undefined,
              city: locObj.city as string ?? locObj.locality as string ?? undefined,
              postal_code: String(locObj.postalCode ?? locObj.zip ?? '') || undefined,
              address: [locObj.street, locObj.city].filter(Boolean).join(', ') || undefined,
              property_type: mapPropertyType(r.type as string ?? (r.property as Record<string, unknown>)?.type as string),
              bedrooms: (r.bedrooms ?? (r.property as Record<string, unknown>)?.bedroomCount) as number ?? undefined,
              surface_area: (r.livingArea ?? (r.property as Record<string, unknown>)?.livingSurface) as number ?? undefined,
              image_url: ((r.images as Record<string, unknown>[])?.[0]?.url as string) ?? undefined,
            };
          }).filter(l => l.external_id);
        }
      }
    }
  }

  return null;
}

export function extractFromHtml(html: string): PropertyListing[] {
  const $ = cheerio.load(html);
  const listings: PropertyListing[] = [];

  // Try JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? '');
      const items = Array.isArray(data) ? data : [data];
      items.forEach((item: Record<string, unknown>) => {
        if (item['@type'] === 'Residence' || item['@type'] === 'House' || item['@type'] === 'Apartment') {
          const id = String(item['@id'] ?? item.identifier ?? '').replace(/\D/g, '');
          if (id) {
            const addr = item.address as Record<string, unknown> ?? {};
            listings.push({
              source: 'zimmo',
              external_id: id,
              url: item.url as string ?? '',
              title: item.name as string ?? undefined,
              city: addr.addressLocality as string ?? undefined,
              postal_code: addr.postalCode as string ?? undefined,
              price: (item.offers as Record<string, unknown>)?.price as number ?? undefined,
              latitude: item.geo ? (item.geo as Record<string, unknown>).latitude as number : undefined,
              longitude: item.geo ? (item.geo as Record<string, unknown>).longitude as number : undefined,
            });
          }
        }
      });
    } catch { /* skip */ }
  });

  if (listings.length > 0) return listings;

  // Card-based fallback
  $('article, [class*="PropertyCard"], [class*="property-card"], [data-testid="property-card"]').each((_, el) => {
    const card = $(el);
    const anchor = card.find('a[href*="/property/"], a[href*="/te-koop/"], a[href*="/for-sale/"]').first();
    const href = anchor.attr('href') ?? card.find('a').first().attr('href') ?? '';
    const idMatch = href.match(/\/(\d+)\/?(?:\?|$)/);
    const id = idMatch?.[1];
    if (!id || !href) return;

    const priceText = card.find('[class*="price"], [class*="Price"]').first().text().replace(/[^\d]/g, '');
    const locality = card.find('[class*="location"], [class*="Location"], [class*="city"], [class*="City"]').first().text().trim();
    const localityMatch = locality.match(/^(\d{4})\s+(.+)$/);

    listings.push({
      source: 'zimmo',
      external_id: id,
      url: href.startsWith('http') ? href : `https://www.zimmo.be${href}`,
      address: locality || undefined,
      city: (localityMatch?.[2] ?? locality) || undefined,
      postal_code: localityMatch?.[1] ?? undefined,
      price: priceText ? parseInt(priceText, 10) : undefined,
      image_url: card.find('img').first().attr('src') ?? undefined,
    });
  });

  return listings;
}

export async function scrapeZimmo(
  bbox: [number, number, number, number],
  maxPages = 3
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  console.log(`[Zimmo] Starting scrape — bbox: ${bbox.join(', ')}, pages: ${maxPages}`);

  return scrapePaginated({
    label: 'Zimmo',
    maxPages,
    delayMs: 1500,
    buildUrl: page => buildSearchUrl(page, bbox),
    parse: html => {
      const fromScripts = extractFromScripts(html);
      if (fromScripts !== null) {
        console.log(`[Zimmo] Extracted ${fromScripts.length} from scripts`);
        return fromScripts;
      }
      const fromHtml = extractFromHtml(html);
      console.log(`[Zimmo] HTML fallback: ${fromHtml.length} listings`);
      return fromHtml;
    },
  });
}
