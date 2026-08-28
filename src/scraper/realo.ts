import { PropertyListing } from './types';
import { Area } from './areas';
import { BROWSER_HEADERS, dedupeById, scrapePaginated } from './common';

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

export function parsePrice(raw: string): number | undefined {
  // Belgian format: € 1.245.000  (dots are thousands separators)
  const match = raw.match(/€\s*([\d.,\s]+)/);
  if (!match) return undefined;
  const cleaned = match[1].replace(/\./g, '').replace(',', '.').replace(/\s/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

export function parseCards(html: string): PropertyListing[] {
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

    // First image from the data-images JSON blob. The JSON arrives
    // HTML-entity-encoded (&quot;) with escaped slashes, so match both forms.
    const imgMatch = card.match(/srcAt2x(?:&quot;|"):(?:&quot;|")(https:[\s\S]+?)(?:&quot;|")/);
    const imageUrl = imgMatch ? imgMatch[1].replace(/\\\//g, '/') : undefined;

    // Property type hint from card classes
    const typeHint = card.match(/class="[^"]*component-estate-grid-item[^"]*"/)?.[0] ?? '';
    let property_type: PropertyListing['property_type'] = 'other';
    if (/apartment|flat|studio/i.test(typeHint + card.slice(0, 300))) property_type = 'apartment';
    else if (/house|villa|bungalow/i.test(typeHint + card.slice(0, 300))) property_type = 'house';
    else if (/office|retail|industrial|commercial/i.test(typeHint + card.slice(0, 300))) property_type = 'commercial';

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

export async function scrapeRealo(
  areas: Area[],
  maxPagesPerPostalCode = 2
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  const postalCodes = areas.map(a => a.postalCode);
  if (postalCodes.length === 0) {
    console.warn('[Realo] No postal codes to scrape');
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
  let blocked = false;
  for (const [searchUrl] of searchUrls) {
    const result = await scrapePaginated({
      label: 'Realo',
      maxPages: maxPagesPerPostalCode,
      delayMs: 800,
      buildUrl: page => `${searchUrl}?page=${page}`,
      parse: parseCards,
    });
    all.push(...result.listings);
    blocked = blocked || result.blocked;
    await new Promise(r => setTimeout(r, 600));
  }

  // Deduplicate across postal codes — adjacent searches return the same listings
  const unique = dedupeById(all);
  console.log(`[Realo] Done. ${unique.length} unique listings across ${searchUrls.size} postal codes`);
  return { listings: unique, blocked };
}
