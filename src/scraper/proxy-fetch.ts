// Some sources (Zimmo) sit behind Cloudflare's "Just a moment…" JavaScript
// challenge, which a plain fetch cannot pass. When SCRAPER_API_KEY is set we
// route those requests through a scraping API that renders the page's JS and
// solves the challenge, then returns the real HTML. Without a key this returns
// null and the caller falls back to a direct fetch — so local dev and the
// unprotected sources (Realo, Immoweb, …) are completely unaffected.
//
// PROVIDER: Scrape.do (https://scrape.do/documentation/) — 1,000 requests/month
// free, recurring, no credit card. To switch providers, change ONLY this
// function. For reference, the equivalent URL on other vendors:
//   Bright Data: uses the Web Unlocker zone API (POST), not a simple GET
//   ScrapingBee: https://app.scrapingbee.com/api/v1/?api_key=KEY&url=URL&render_js=true&stealth_proxy=true
//   ScraperAPI:  https://api.scraperapi.com/?api_key=KEY&url=URL&render=true
//
// Cloudflare needs BOTH JavaScript rendering (render) and a residential proxy
// (super), which cost extra API credits — so we only flip this on for the
// source that needs it (the `proxied` flag in common.ts), never for sources
// that work with a direct fetch. geoCode=be scrapes from a Belgian IP, which
// suits a Belgian property site and improves the challenge pass rate.

export function buildProxiedUrl(targetUrl: string): string | null {
  const token = process.env.SCRAPER_API_KEY;
  if (!token) return null;

  const params = new URLSearchParams({
    token,
    url: targetUrl,
    render: 'true', // run a headless browser to clear Cloudflare's JS challenge
    super: 'true', // residential/mobile proxy — required to pass Cloudflare
    geoCode: 'be', // scrape from a Belgian IP
  });
  return `https://api.scrape.do/?${params.toString()}`;
}
