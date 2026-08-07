# CommonGround Roadmap

The goal: help **3 couples find a house to buy together** in Belgium. No portal
serves this — Immoweb's search is better than ours will ever be at *searching*,
but nothing out there does **multi-party constraint solving and group
decision-making**. That's the moat. Six people don't struggle to find houses;
they struggle to *converge* on one.

## Phase 1 — Pipeline, not snapshot ✅ (in progress)

House hunting is a weeks-long watch, not a one-time query.

- [x] Scheduled scraping: a GitHub Actions crawler
      (`.github/workflows/crawl.yml` → `src/scraper/run-crawler.ts`) crawls the
      unioned commute zone of all active sessions, deep-paginated and with no
      300s limit. Free sources daily; Zimmo weekly + capped to fit Scrape.do's
      free tier. (Superseded the daily Vercel cron, now retired to a manual
      `/api/cron/scrape` fallback.)
- [x] `first_seen_at` on listings — set once when a listing first appears, so
      the UI can flag what's new since you last looked.
- [x] Auto-load cached listings when a session opens (no button press needed);
      "NEW" highlight on pins that appeared since your last visit.
- [ ] Email/push alerts when a new listing lands inside the zone + budget
      (needs an email provider, e.g. Resend — see "Later").
- [x] Price-drop and time-on-market history: `price_history` table records the
      full series, `previous_price` powers "↓ was €X" in popups and shortlist,
      `first_seen_at` powers "N days on the market".

## Phase 2 — The social layer ✅ (in progress)

The actual "common ground": converging as a group.

- [x] Identity: pick "who am I" per browser (localStorage, no login — fine for
      six people who trust each other).
- [x] Love / object reactions per person per listing, synced realtime.
- [x] Pin styling: gold ring = loved, grayed out = objected to by someone.
- [x] Shortlist panel: listings ranked by hearts, "everyone loves this" called out.
- [ ] Comments per listing ("garden is north-facing", "viewed it, smells of damp").
- [ ] Status pipeline: new → shortlisted → visit planned → visited → offer / rejected.

## Phase 3 — Better constraints

- [ ] More constraint types: near a train station, schools, distance to parents.
      Mapbox isochrones already support walking; POI proximity needs a different
      query (Mapbox tilequery or Overpass).
- [ ] Soft constraints / scoring instead of binary intersection. With six
      commutes, a hard intersection is often empty. "Satisfies 5 of 6, the
      sixth is 8 min over" beats a blank map. Render as a heatmap of
      satisfaction count.
- [ ] Per-couple budgets → joint affordability filter.

## Phase 4 — Co-buying specific

- [ ] Search profile tuned for 3 couples: large plots (`land_area`), 6+
      bedrooms, multiple units, farm/B&B-style properties that convert well.
- [ ] Belgian zoning awareness: kangoeroewoning, splitting into units requires
      a permit, region-specific rules.
- [ ] Financial modeling: combined purchasing power, monthly cost per couple,
      registration duties per region (Flanders 2% vs Brussels/Wallonia 12.5%),
      indivision vs company structure, exit scenarios. This is the feature
      that turns "fun map app" into "the thing that got us a notary appointment".

## Standing concerns

- **Scrapers are the most fragile layer.** Sites change markup and block bots.
  Keep parsing logic under test (`npm test`), scrape politely (delays between
  pages, daily cron, 6h cache), treat each scraper as a replaceable input.
  Run `npx tsx src/scraper/diagnose.ts` to audit live result quality per
  source (counts, field coverage, dead-link sampling) — June 2026 it caught
  Immoweb's bbox params silently dying and Immovlan's markup change.
- **Zimmo is Cloudflare-blocked** ("Just a moment…" challenge) — kept as a
  graceful no-op; beating it would need a headless browser. Its inventory
  overlaps heavily with the other sources anyway.
- **Sources** (June 2026): Realo (richest, street-level), ImmoScoop
  (Flanders-focused, images), Immoweb (source coordinates), Immovlan
  (postcode-level only → approximate pins). Candidates not yet integrated:
  Biddit (notary auctions, SPA/API), 2dehands (private sales).
- **Cron cadence**: Vercel Hobby allows one run/day. If we need more, a GitHub
  Action on a schedule can curl the same endpoint with the `CRON_SECRET`.
- **Email alerts** need a provider. Resend has a free tier; the hook point is
  in `/api/cron/scrape` where new listings are counted after each refresh.
