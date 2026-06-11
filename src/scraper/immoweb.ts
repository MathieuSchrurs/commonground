import * as cheerio from 'cheerio';
import { PropertyListing } from './types';
import { mapPropertyType, scrapePaginated } from './common';

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
export function extractListings(html: string): PropertyListing[] {
  const $ = cheerio.load(html);
  const listings: PropertyListing[] = [];

  $('article[id^="classified_"]').each((_, el) => {
    const card = $(el);
    const id = card.attr('id')?.replace(/^classified_/, '') ?? '';
    if (!id) return;

    // Anchor on the title carries the public URL
    const href = card.find('a.card__title-link, a[href*="/classified/"]').first().attr('href') ?? '';
    // Empty href must stay empty so the per-listing fallback URL kicks in below
    const url = !href || href.startsWith('http') ? href : `https://www.immoweb.be${href}`;

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
      property_type: mapPropertyType(payload.property?.type ?? payload.property?.subtype),
      bedrooms: payload.property?.bedroomCount,
      surface_area: payload.property?.netHabitableSurface,
      land_area: payload.property?.landSurface,
      image_url: payload.media?.pictures?.[0]?.mediumUrl ?? payload.media?.pictures?.[0]?.largeUrl,
    });
  });

  return listings;
}

export async function scrapeImmoweb(
  bbox: [number, number, number, number],
  maxPages = 3
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  console.log(`[Immoweb] Starting scrape — bbox: ${bbox.join(', ')}, pages: ${maxPages}`);

  const [minLng, minLat, maxLng, maxLat] = bbox;

  return scrapePaginated({
    label: 'Immoweb',
    maxPages,
    delayMs: 1500,
    // Immoweb bbox format: ne=lat,lng&sw=lat,lng (note: lat,lng order)
    buildUrl: page => `${SEARCH_URL}?orderBy=newest&page=${page}&ne=${maxLat},${maxLng}&sw=${minLat},${minLng}`,
    parse: extractListings,
  });
}
