import { PropertyListing } from './types';
import { Area } from './areas';
import { dedupeById, mapPropertyType, scrapePaginated } from './common';

const BASE = 'https://www.zimmo.be';

// Zimmo's results page embeds its listings as a `properties: [ … ]` array
// inside an inline `app.start({ … })` call — there's no JSON-LD or
// __NEXT_DATA__ to lean on. Each object carries exact lat/lon plus the street
// address, so Zimmo listings need no geocoding at all.
//
// We can't regex the array out: values contain stray brackets (image URLs,
// nested advertiser objects), so we scan from the opening `[` tracking bracket
// depth (and skipping string contents) until the matching `]`, then JSON.parse.
export function extractProperties(html: string): Record<string, unknown>[] {
  const appStart = html.indexOf('app.start(');
  const keyAt = html.indexOf('properties:', appStart === -1 ? 0 : appStart);
  if (keyAt === -1) return [];
  const open = html.indexOf('[', keyAt);
  if (open === -1) return [];

  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1)) as Record<string, unknown>[];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

// Zimmo sends every numeric field as a string ("2150000", "51.0463", "5").
const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function parseListings(html: string): PropertyListing[] {
  return extractProperties(html).flatMap((r): PropertyListing[] => {
    const code = str(r.code);
    if (!code) return [];
    const url = str(r.url) ?? '';
    return [{
      source: 'zimmo' as const,
      external_id: code,
      url: url.startsWith('http') ? url : `${BASE}${url}`,
      price: num(r.prijs),
      address: str(r.address),
      city: str(r.gemeente),
      postal_code: str(r.postcode),
      latitude: num(r.lat),
      longitude: num(r.lon),
      property_type: mapPropertyType(str(r.type)),
      bedrooms: num(r.slaapkamers),
      surface_area: num(r.b_woonopp),
      image_url: str(r.hoofdFoto),
    }];
  });
}

export async function scrapeZimmo(
  areas: Area[],
  maxPagesPerArea = 2
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  if (areas.length === 0) {
    console.warn('[Zimmo] No areas to scrape');
    return { listings: [], blocked: false };
  }

  // One search URL per area: /nl/{citySlug}-{postalCode}/te-koop/ . Dedupe by
  // slug — adjacent grid points can resolve to the same municipality.
  const slugs = new Map<string, true>();
  for (const a of areas) {
    if (a.citySlug && a.postalCode) slugs.set(`${a.citySlug}-${a.postalCode}`, true);
  }

  console.log(`[Zimmo] Scraping ${slugs.size} area URLs`);

  const all: PropertyListing[] = [];
  let blocked = false;
  for (const slug of slugs.keys()) {
    const base = `${BASE}/nl/${slug}/te-koop/`;
    const result = await scrapePaginated({
      label: 'Zimmo',
      maxPages: maxPagesPerArea,
      delayMs: 1500,
      // Cloudflare-protected → route every fetch through the scraping API.
      proxied: true,
      buildUrl: page => `${base}?p=${page}`,
      parse: parseListings,
    });
    all.push(...result.listings);
    blocked = blocked || result.blocked;
    await new Promise(r => setTimeout(r, 600));
  }

  // Adjacent areas return overlapping listings — dedupe by Zimmo's code.
  const unique = dedupeById(all);
  console.log(`[Zimmo] Done. ${unique.length} unique listings across ${slugs.size} areas`);
  return { listings: unique, blocked };
}
