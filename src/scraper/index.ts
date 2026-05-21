/**
 * CommonGround property scraper
 *
 * Usage:
 *   npx tsx src/scraper/index.ts              (scrape both sources, 5 pages each)
 *   npx tsx src/scraper/index.ts --pages 10   (scrape 10 pages per source)
 *   npx tsx src/scraper/index.ts --source immoweb
 *   npx tsx src/scraper/index.ts --source zimmo
 *
 * Requires .env.local with MAPBOX_SECRET_TOKEN and Supabase vars.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local from project root
config({ path: resolve(process.cwd(), '.env.local') });

import { scrapeImmoweb } from './immoweb';
import { scrapeZimmo } from './zimmo';
import { upsertListings } from './db';

async function main() {
  const args = process.argv.slice(2);

  const pagesFlag = args.indexOf('--pages');
  const maxPages = pagesFlag !== -1 ? parseInt(args[pagesFlag + 1], 10) : 5;

  const sourceFlag = args.indexOf('--source');
  const source = sourceFlag !== -1 ? args[sourceFlag + 1] : 'all';

  console.log(`\n=== CommonGround Property Scraper ===`);
  console.log(`Source: ${source} | Pages per source: ${maxPages}\n`);

  // Default bbox: all of Belgium
  const belgiumBbox: [number, number, number, number] = [2.54, 49.5, 6.4, 51.5];

  if (source === 'all' || source === 'immoweb') {
    const { listings } = await scrapeImmoweb(belgiumBbox, maxPages);
    await upsertListings(listings);
  }

  if (source === 'all' || source === 'zimmo') {
    const { listings } = await scrapeZimmo(belgiumBbox, maxPages);
    await upsertListings(listings);
  }

  console.log('\n=== Scrape complete ===\n');
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
