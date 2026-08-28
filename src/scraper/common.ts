import { PropertyListing } from './types';
import { buildProxiedUrl } from './proxy-fetch';

// Headers that closely mimic a real Chrome browser on macOS. Shared by all
// scrapers so anti-bot fixes land everywhere at once.
export const BROWSER_HEADERS = {
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

// Below this size a response is almost certainly a captcha/block page, not a
// real search-results page.
const MIN_HTML_LENGTH = 5000;

// Map a site-specific type string ("VILLA", "ground-floor", "building-plot",
// "Huis", …) onto our five buckets, covering both English and Dutch site
// vocabularies. Apartment keywords are checked first because "ground-floor"
// would otherwise match the land keyword "ground".
export function mapPropertyType(raw?: string): PropertyListing['property_type'] {
  const t = (raw ?? '').toLowerCase();
  if (/apartment|appartement|studio|flat|penthouse|ground-floor|duplex|triplex|loft/.test(t)) return 'apartment';
  if (/land|plot|ground|grond/.test(t)) return 'land';
  if (/house|huis|woning|villa|bungalow|cottage|farm|hoeve|chalet|mansion|castle|kasteel|residence/.test(t)) return 'house';
  if (/office|kantoor|retail|winkel|shop|industrial|industrie|bedrijfsruimte|commercial/.test(t)) return 'commercial';
  return 'other';
}

export function dedupeById(listings: PropertyListing[]): PropertyListing[] {
  const seen = new Set<string>();
  return listings.filter(l => {
    if (seen.has(l.external_id)) return false;
    seen.add(l.external_id);
    return true;
  });
}

interface FetchHtmlResult {
  html: string | null;
  blocked: boolean;
}

// Fetch a page and classify failures: network errors and plain HTTP errors
// just yield no HTML, while 403/429 and suspiciously short responses are
// flagged as the site actively blocking us.
//
// `proxied` routes the request through the Cloudflare-solving scraping API
// (when SCRAPER_API_KEY is set). The API supplies its own browser identity, so
// we don't attach BROWSER_HEADERS on that path. If no key is configured,
// buildProxiedUrl returns null and we fall back to a direct fetch.
async function fetchHtml(label: string, url: string, proxied = false): Promise<FetchHtmlResult> {
  const proxiedUrl = proxied ? buildProxiedUrl(url) : null;
  const fetchUrl = proxiedUrl ?? url;
  const init: RequestInit = proxiedUrl ? {} : { headers: BROWSER_HEADERS };

  let res: Response;
  try {
    res = await fetch(fetchUrl, init);
  } catch (err) {
    console.error(`[${label}] Network error:`, err);
    return { html: null, blocked: false };
  }

  if (!res.ok) {
    console.warn(`[${label}] HTTP ${res.status} — site may be blocking requests`);
    return { html: null, blocked: res.status === 403 || res.status === 429 };
  }

  // Reading the body can fail too (connection reset mid-download throws
  // "terminated"); treat that as a failed page, not a fatal error.
  let html: string;
  try {
    html = await res.text();
  } catch (err) {
    console.error(`[${label}] Body read failed:`, err);
    return { html: null, blocked: false };
  }
  if (html.length < MIN_HTML_LENGTH) {
    console.warn(`[${label}] Response is suspiciously short (${html.length} chars) — likely a block/captcha page`);
    return { html: null, blocked: true };
  }

  return { html, blocked: false };
}

// Runs `items` through `worker` with at most `concurrency` calls in flight.
// Results land at their original index regardless of completion order. If
// `stopWhen` matches a completed result, no further items are dispatched, but
// calls already in flight are left to resolve and are still included — this
// is the "break on blocked" shape several per-source scrape loops use, made
// reusable and concurrent instead of strictly sequential.
export function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  stopWhen?: (result: R) => boolean
): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    let inFlight = 0;
    let stopped = false;
    let settled = false;

    const finishIfDone = () => {
      if (settled) return;
      if (inFlight === 0 && (stopped || nextIndex >= items.length)) {
        settled = true;
        resolve(results);
      }
    };

    const launchNext = () => {
      if (stopped || nextIndex >= items.length) return;
      const index = nextIndex++;
      inFlight++;
      worker(items[index])
        .then(result => {
          results[index] = result;
          inFlight--;
          if (stopWhen && stopWhen(result)) stopped = true;
          if (!stopped) launchNext();
          finishIfDone();
        })
        .catch(err => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
    };

    if (items.length === 0) {
      resolve(results);
      return;
    }

    for (let i = 0; i < Math.min(concurrency, items.length); i++) launchNext();
  });
}

export interface PaginatedScrapeOptions {
  label: string;
  maxPages: number;
  /** Pause between page fetches, to avoid hammering the site. */
  delayMs: number;
  buildUrl: (page: number) => string;
  parse: (html: string) => PropertyListing[];
  /** Route fetches through the Cloudflare-solving scraping API (Zimmo). */
  proxied?: boolean;
}

// The pagination loop every scraper shares: fetch page N, parse it, stop as
// soon as the site blocks us or a page comes back empty. Results are deduped
// by external_id since sites repeat listings across pages.
export async function scrapePaginated(
  opts: PaginatedScrapeOptions
): Promise<{ listings: PropertyListing[]; blocked: boolean }> {
  const { label, maxPages, delayMs, buildUrl, parse, proxied = false } = opts;
  const all: PropertyListing[] = [];
  let blocked = false;

  for (let p = 1; p <= maxPages; p++) {
    const url = buildUrl(p);
    console.log(`[${label}] Fetching page ${p}: ${url}${proxied ? ' (via scraping API)' : ''}`);

    const result = await fetchHtml(label, url, proxied);
    blocked = result.blocked;
    if (result.html === null) break;

    const listings = parse(result.html);
    console.log(`[${label}] Page ${p}: ${listings.length} listings`);

    all.push(...listings);
    if (listings.length === 0) break;
    if (p < maxPages) await new Promise(r => setTimeout(r, delayMs));
  }

  const unique = dedupeById(all);
  console.log(`[${label}] Done. ${unique.length} unique listings${blocked ? ' (BLOCKED)' : ''}`);
  return { listings: unique, blocked };
}
