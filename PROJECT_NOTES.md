# PartsKing – Requirements Backlog

_Last updated: 2026-03-21_

## Requested features
- Web app where a user enters a part number and the system searches:
  - Amazon
  - eBay
  - Additional supplier websites (list TBD by Nicco)
- Results must include source, link, price, and stock status.
- Use a simple AI/fuzzy-matching step to verify that a hit truly matches the requested part number.
- Keep everything hostable on GitHub (clean README, pnpm scripts, etc.).
- Maintain a local database of scraped parts:
  - Initial run should crawl all configured suppliers and populate the database.
  - The website queries this local database rather than live-scraping every request.
  - Provide a way to run periodic refresh jobs that re-scrape sources and update the stored data.

## Decisions (2026-03-21)
- **Cache storage:** Supabase Postgres is canonical (anon key for the UI, service-role key for scrapers); SQLite only powers offline dev.
- **Cache freshness:** API honors `PARTSKING_CACHE_TTL_HOURS` (24h) while the background job uses `PARTSKING_REFRESH_TTL` (6h) to rehydrate stale SKUs.
- **Automation:** `.github/workflows/cache-refresh.yml` runs `pnpm scrape:refresh` every 6 hours; Mission Control can adopt the same script later if we need on-prem orchestration.

## Open questions
- Final list of supplier domains beyond Amazon/eBay (Nicco to prioritize).
- Do we need price dedupe by quantity/currency before surfacing results?

_(Nicco asked to park supplier expansion until the current feature set is validated.)_
