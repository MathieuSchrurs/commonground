/**
 * Scraper quality audit — scrapes a test area WITHOUT writing to the DB and
 * reports, per source: result counts, field coverage (coords/price/street
 * address), and whether a sample of listing URLs actually resolve to live
 * property pages.
 *
 * Usage: npx tsx src/scraper/diagnose.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Feature, Polygon } from 'geojson';
import * as cheerio from 'cheerio';
import { scrapeImmoweb } from './immoweb';
import { scrapeZimmo } from './zimmo';
import { scrapeImmovlan } from './immovlan';
import { scrapeImmoscoop } from './immoscoop';
import { scrapeRealo } from './realo';
import { discoverAreas } from './areas';
import { BROWSER_HEADERS } from './common';
import { PropertyListing } from './types';

// Gent and surroundings
const BBOX: [number, number, number, number] = [3.5, 50.95, 3.9, 51.15];
const POLYGON: Feature<Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [BBOX[0], BBOX[1]], [BBOX[2], BBOX[1]], [BBOX[2], BBOX[3]], [BBOX[0], BBOX[3]], [BBOX[0], BBOX[1]],
    ]],
  },
};

const DEAD_MARKERS = [
  'no longer available', 'niet meer beschikbaar', 'n\'est plus disponible',
  'has been sold', 'is verkocht', 'listing not found', 'page not found',
  'pagina niet gevonden', 'verlopen', 'offline gehaald',
];

async function checkUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
    if (!res.ok) return `HTTP ${res.status}`;
    const html = await res.text();
    if (html.length < 5000) return 'SHORT (block/captcha?)';
    // Only inspect visible text — sites ship "no longer available" strings in
    // their i18n bundles on every page, which would flag live listings as dead
    const $ = cheerio.load(html);
    $('script, style, noscript, template').remove();
    const visible = $('body').text().toLowerCase();
    const marker = DEAD_MARKERS.find(m => visible.includes(m));
    if (marker) return `DEAD ("${marker}")`;
    return 'OK';
  } catch (err) {
    return `ERROR ${err instanceof Error ? err.message : err}`;
  }
}

function pct(n: number, total: number): string {
  return total === 0 ? '—' : `${Math.round((n / total) * 100)}%`;
}

function hasStreetAddress(l: PropertyListing): boolean {
  // A street-level address contains more than just "9000 Gent": look for a
  // letter sequence that isn't only the city, i.e. address differs from city/postal combos
  if (!l.address) return false;
  const norm = l.address.toLowerCase();
  const cityOnly = [l.postal_code, l.city].filter(Boolean).join(' ').toLowerCase();
  return norm.replace(/[,\s]/g, '') !== cityOnly.replace(/[,\s]/g, '') && /\d/.test(l.address.replace(l.postal_code ?? '', ''));
}

async function audit(name: string, listings: PropertyListing[], blocked: boolean) {
  const total = listings.length;
  console.log(`\n━━━ ${name} ━━━ ${total} listings${blocked ? ' (BLOCKED)' : ''}`);
  if (total === 0) return;

  const withCoords = listings.filter(l => l.latitude && l.longitude).length;
  const withPrice = listings.filter(l => l.price).length;
  const withStreet = listings.filter(hasStreetAddress).length;
  const withImage = listings.filter(l => l.image_url).length;

  console.log(`  coords from source: ${pct(withCoords, total)} | price: ${pct(withPrice, total)} | street address: ${pct(withStreet, total)} | image: ${pct(withImage, total)}`);

  // Sample 5 URLs spread across the result set and check liveness
  const step = Math.max(1, Math.floor(total / 5));
  const sample = listings.filter((_, i) => i % step === 0).slice(0, 5);
  for (const l of sample) {
    const status = await checkUrl(l.url);
    console.log(`  [${status}] ${l.url.slice(0, 110)}`);
    await new Promise(r => setTimeout(r, 600));
  }
}

async function main() {
  console.log(`Auditing scrapers for bbox ${BBOX.join(', ')} (Gent area)\n`);

  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) throw new Error('MAPBOX_SECRET_TOKEN is not set');
  const areas = await discoverAreas(POLYGON, token);

  const immoweb = await scrapeImmoweb(areas.map(a => a.postalCode), 2).catch(e => { console.error(e); return { listings: [], blocked: false }; });
  await audit('Immoweb', immoweb.listings, immoweb.blocked);

  const zimmo = await scrapeZimmo(BBOX, 1).catch(e => { console.error(e); return { listings: [], blocked: false }; });
  await audit('Zimmo', zimmo.listings, zimmo.blocked);

  const immovlan = await scrapeImmovlan(areas, 1).catch(e => { console.error(e); return { listings: [], blocked: false }; });
  await audit('Immovlan', immovlan.listings, immovlan.blocked);

  const immoscoop = await scrapeImmoscoop(areas, 1).catch(e => { console.error(e); return { listings: [], blocked: false }; });
  await audit('ImmoScoop', immoscoop.listings, immoscoop.blocked);

  const realo = await scrapeRealo(areas, 1).catch(e => { console.error(e); return { listings: [], blocked: false }; });
  await audit('Realo', realo.listings, realo.blocked);
}

main();
