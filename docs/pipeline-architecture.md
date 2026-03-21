# PartsKing scraper pipeline (draft)

## Objectives
- Build a repeatable ingest job that pulls listings from Amazon, eBay, Digi-Key, Mouser (and future suppliers) via SerpAPI or native adapters.
- Normalize the data into a single `part_listings` table for local queries.
- Support two execution modes:
  1. **Seed crawl** – full refresh over the part catalog.
  2. **Incremental refresh** – update only the SKUs touched in the past N hours or those flagged in Mission Control.
- Expose a CLI (pnpm script) so Mission Control can schedule the job.

## Proposed stack
- **Runtime:** Node.js + TypeScript (shared with existing server).
- **Storage:** SQLite (file-backed, easy to ship with repo; upgradeable to Postgres later).
- **ORM/Query builder:** Drizzle ORM for typed SQL + migrations.
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

## Integration points
- Expose `/api/cache/:partNumber` endpoint so the UI can read from SQLite when offline or rate-limited.
- Add Mission Control job template: `pnpm scrape --seed-file data/parts_seed.json`.
- Document env vars (`DATABASE_URL`, `SERPAPI_KEY`, etc.) in README.

## Open questions
- Finalize supplier list for v1.
- Define cadence for incremental refresh (cron schedule?).
- Decide whether to dedupe prices by currency/quantity.
