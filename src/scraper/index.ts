/**
 * CommonGround property scraper CLI
 *
 * Usage:
 *   npx tsx src/scraper/index.ts --postal 9000,9050,9830   (scrape those areas)
 *   npx tsx src/scraper/index.ts --postal 9000 --pages 5
 *   npx tsx src/scraper/index.ts --postal 9000 --source immoweb
 *
 * Requires .env.local with MAPBOX_SECRET_TOKEN and Supabase vars.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local from project root
config({ path: resolve(process.cwd(), '.env.local') });

import { scrapeImmoweb } from './immoweb';
import { scrapeImmovlan } from './immovlan';
import { scrapeImmoscoop } from './immoscoop';
import { scrapeRealo } from './realo';
import { upsertListings } from './db';
import { Area, slugifyCity } from './areas';
import { geocodeAddress } from './geocode';

// Resolve a postal code to its municipality name via Mapbox, so the
// town-filtered scrapers (Immovlan, ImmoScoop) know what to ask for.
async function toArea(postalCode: string): Promise<Area> {
  const geo = await geocodeAddress(`${postalCode}, Belgium`).catch(() => null);
  let city = '';
  if (geo) {
    const token = process.env.MAPBOX_SECRET_TOKEN;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${geo.longitude},${geo.latitude}.json?types=place&country=BE&limit=1&access_token=${token}`;
    const res = await fetch(url).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      city = (data.features?.[0]?.text as string) ?? '';
    }
  }
  return { postalCode, city, citySlug: slugifyCity(city) };
}

async function main() {
  const args = process.argv.slice(2);

  const pagesFlag = args.indexOf('--pages');
  const maxPages = pagesFlag !== -1 ? parseInt(args[pagesFlag + 1], 10) : 3;

  const sourceFlag = args.indexOf('--source');
  const source = sourceFlag !== -1 ? args[sourceFlag + 1] : 'all';

  const postalFlag = args.indexOf('--postal');
  if (postalFlag === -1) {
    console.error('Missing --postal: pass the postal codes to scrape, e.g. --postal 9000,9050');
    process.exit(1);
  }
  const postalCodes = args[postalFlag + 1].split(',').map(s => s.trim()).filter(Boolean);

  console.log(`\n=== CommonGround Property Scraper ===`);
  console.log(`Source: ${source} | Areas: ${postalCodes.join(', ')} | Pages: ${maxPages}\n`);

  const areas = await Promise.all(postalCodes.map(toArea));
  console.log('Areas:', areas.map(a => `${a.postalCode} ${a.city}`).join(', '));

  if (source === 'all' || source === 'immoweb') {
    const { listings } = await scrapeImmoweb(postalCodes, maxPages);
    await upsertListings(listings);
  }

  if (source === 'all' || source === 'immovlan') {
    const { listings } = await scrapeImmovlan(areas, maxPages);
    await upsertListings(listings);
  }

  if (source === 'all' || source === 'immoscoop') {
    const { listings } = await scrapeImmoscoop(areas, maxPages);
    await upsertListings(listings);
  }

  if (source === 'all' || source === 'realo') {
    const { listings } = await scrapeRealo(areas, maxPages);
    await upsertListings(listings);
  }

  console.log('\n=== Scrape complete ===\n');
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
