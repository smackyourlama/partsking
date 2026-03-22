# PartsKing build session – 2026-03-21

## Shipping log
- ✅ React UI now supports cached mode (chips to load cached SKUs, automatic fallback when live search fails, "Last refreshed" timestamp, CSV export button for filtered results).
- ✅ Express API persists every search to SQLite (`data/parts.db`), enforces TTL via `PARTSKING_CACHE_TTL_HOURS`, and returns `source` + `cachedAt` metadata.
- ✅ `/api/cache` exposes cached SKUs with fresh timestamps for the UI, plus `/api/cache/:partNumber` (optional `ttlHours`).
- ✅ CLI helpers:
  - `pnpm scrape:seed` – populates the SQLite cache from `data/seed_parts.json`.
  - `pnpm scrape:refresh` – re-scrapes only the SKUs that have aged past `PARTSKING_REFRESH_TTL` (dry-run supported).
  - `pnpm prune:cache [hours]` – deletes rows older than the retention window.
- ✅ README/.env docs updated with all env knobs (`SERPAPI_KEY`, `PARTSKING_DB_PATH`, `PARTSKING_CACHE_TTL_HOURS`, refresh env vars) + pipeline doc now covers the incremental refresher.
- ✅ GitHub Pages workflow now builds the Vite bundle with repo-provided `VITE_API_BASE_URL`/`VITE_BASE_PATH` vars, so pushes to `main` auto-deploy the static UI via `actions/deploy-pages`.

## Outstanding items
1. **Supplier expansion** – need Nicco&apos;s priority list (Arrow, Newark, Octopart, etc.) to extend the adapter set.
2. **Scraper pipeline** – hook `pnpm scrape:refresh` into Mission Control/cron + add telemetry so we know when batches finish.
3. **Data export/reporting** – decide whether to surface CSV/JSON exports or Mission Control dashboards.
4. **GitHub prep** – finalize README polish + choose OSS license before publishing.

## Next actions once requirements arrive
- Implement additional supplier adapters + scoring tweaks.
- Wire Mission Control job template for periodic refresh.
- Add saved-search UX (recent SKUs, pinned suppliers).
- Harden the API (rate limiting, auth) if this goes multi-tenant.
### 23:40 EDT
- Front-end cache chips now show `{partNumber, cachedAt}` metadata (recency labels + tooltips) and fall back gracefully when the cache list mixes strings/objects.
- `/api/cache` accepts `?limit=` and the store returns part summaries ordered by most recent cache time (Supabase + SQLite parity).
- Added `.github/workflows/cache-refresh.yml` (6h cadence) to run `pnpm scrape:refresh` with Supabase secrets + Python deps.
- Updated `.env.example`, README, and `docs/pipeline-architecture.md` to document TTL behavior, Supabase as canonical storage, and the automation plan.
- PROJECT_NOTES now records the cache/storage decisions + open supplier questions.

