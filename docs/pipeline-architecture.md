# PartsKing scraper pipeline (draft)

## Objectives
- Build a repeatable ingest job that pulls listings from the prioritized suppliers (Shopify, WooCommerce, Shift4Shop, RepairClinic, etc.) via Scrapling adapters.
- Normalize the data into a single `part_listings` table for local queries.
- Support two execution modes:
  1. **Seed crawl** – full refresh over the part catalog.
  2. **Incremental refresh** – update only the SKUs touched in the past N hours or those flagged in Mission Control.
- Expose a CLI (pnpm script) so Mission Control can schedule the job.

## Proposed stack
- **Runtime:** Node.js + TypeScript (shared with existing server).
- **Storage:** Supabase Postgres (anon read for the static UI, service-role writes for the scraper; local SQLite fallback for offline dev).
- **ORM/Query builder:** Drizzle ORM for typed SQL + migrations (emits SQL applied via Supabase).
- **Queueing:** In-process task runner for now; can swap to Mission Control jobs when scale increases.

## Data model
```sql
CREATE TABLE part_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  price TEXT,
  stock_status TEXT,
  confidence REAL NOT NULL,
  payload JSON,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_part_source_url
  ON part_listings(part_number, source, url);
```

## Job flow
1. Load list of target part numbers (`parts-seed.json` or Mission Control input).
2. For each part number:
   - Fan out to supplier adapters (Amazon, eBay, Digi-Key, Mouser, TBD).
   - Parse results and compute confidence (reuse existing Levenshtein helper).
   - Upsert into `part_listings` (retain history or overwrite based on flag).
3. Emit summary metrics (records upserted, suppliers failed, API quota usage).
4. Optionally trim stale rows (`DELETE WHERE scraped_at < now() - interval '30 days'`).

## Incremental refresh driver (implemented)
- `scripts/refreshCache.ts` now powers `pnpm scrape:refresh`, which:
  - Reads the seed list (`data/seed_parts.json`) or falls back to whatever SKUs already exist in Supabase/SQLite.
  - Checks each SKU against the configured TTL (`PARTSKING_REFRESH_TTL`, default 6h) via `readCachedResults`.
  - Re-runs the Scrapling runner only for stale or missing SKUs (dry-run mode supported for diagnostics).
- Mission Control or cron can trigger this script hourly/overnight; set `PARTSKING_REFRESH_LIMIT` to cap batch size when API quotas are tight.

## Refresh cadence & hosting
- **API cache TTL:** `PARTSKING_CACHE_TTL_HOURS` (24h) controls how long `/api/parts` trusts a cached snapshot before re-running the scraper for end-user queries.
- **Refresh job TTL:** `PARTSKING_REFRESH_TTL` (6h) governs when `pnpm scrape:refresh` re-hydrates a SKU proactively.
- **Hosting plan:** `.github/workflows/cache-refresh.yml` runs the refresh script every 6 hours on `ubuntu-latest`, installing Node + Python deps and writing directly into Supabase using the service-role key.
- **Customization:** Override cadence by editing the cron string or triggering `workflow_dispatch` with `ttl_hours` / `limit` overrides. If you migrate to Mission Control later, reuse the same script + env bundle.

## Integration points
- `/api/cache` now surfaces `{ partNumber, cachedAt }` objects so the UI can display recency labels instead of opaque strings.
- `/api/cache/:partNumber` doubles as a fallback endpoint for the UI and any CLI automation that needs cached data without rerunning the scraper.
- Mission Control template: `pnpm scrape:refresh` with the same env bundle used in GitHub Actions (drop into Mission Control when background workers are ready).
- README documents the Supabase + cache env vars; Mission Control only needs the service-role key and Python binary path.

## Open questions
- Finalize supplier list for v1.
- Decide whether to dedupe prices by currency/quantity.
