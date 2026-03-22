# PartsKing

Omni-source part search with a Supabase-backed cache. Enter a part number once, and PartsKing collects Amazon/eBay/Digi-Key/Mouser listings plus the supplier domains you specified via a Scrapling crawler, scores them with a Levenshtein-based confidence check, and stores the results in Supabase Postgres so repeat lookups are instant. Subsequent searches hit the cache first, so you get near-zero latency and a fallback when live lookups fail.

## Requirements
- Node.js 18+
- pnpm 9+
- Supabase project (Postgres) with anon + service-role keys
- Python 3.11+ (needed for the Scrapling runner + refresh workflows)

## Project layout
```
parts-king/
├── src/                # React front-end (Vite)
├── server/             # Express API + search adapters + cache abstraction (Supabase or SQLite fallback)
├── scripts/cacheParts.ts  # CLI to pre-populate Supabase from seed_parts.json
├── scripts/refreshCache.ts  # Background refresh driver (re-scrapes stale SKUs)
├── drizzle/            # SQL migrations for Supabase
├── data/
│   ├── parts.db        # Optional SQLite fallback cache (local dev)
│   └── seed_parts.json # initial part numbers to warm the cache
└── .env.local          # local env vars (Supabase, SERPAPI_KEY, Python paths)
```

## Setup

```bash
cd parts-king
cp .env.example .env.local
pnpm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Update `.env.local` as needed:

```
PARTSKING_DB_PATH=./data/parts.db          # optional override
PARTSKING_CACHE_TTL_HOURS=24               # adjust cache freshness window
PARTSKING_PYTHON_BIN=python3               # or path to your venv python
PARTSKING_SCRAPER_LIMIT=5                  # max results per source (optional)
PARTSKING_REFRESH_TTL=6                    # hours before a SKU is considered stale
PARTSKING_REFRESH_LIST=data/seed_parts.json  # optional override for the watch list file
PARTSKING_REFRESH_LIMIT=25                 # optional cap on refresh batch size

# Supabase (required for the hosted cache)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=your_public_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_MIGRATION_URL=postgresql://postgres:<db-password>@db.<project>.supabase.co:6543/postgres

# Frontend (Vite) — optional overrides
VITE_API_BASE_URL=https://parts.king-api.com   # leave blank for same-origin API in dev
VITE_BASE_PATH=./                              # keep ./ for GitHub Pages to serve from /<repo>/
```

### Supabase migrations
1. Grab the project password from Supabase → **Database → Connect** (Port 6543).
2. Export it as `SUPABASE_MIGRATION_URL` in `.env.local` (or your shell).
3. Run `pnpm db:generate` after editing `server/schema.ts` to emit SQL into `drizzle/`.
4. Apply the SQL via `pnpm db:push` (requires the same env) or paste it into the Supabase SQL editor.

The base migration (`drizzle/0000_supabase_init.sql`) sets up the tables/views + anon read / service-role write policies, so the GitHub Pages frontend can query the cache with only the anon key.

### Pre-populate the cache
```bash
pnpm scrape:seed    # uses the Scrapling runner for each SKU in data/seed_parts.json
```

### Refresh stale cache entries automatically
```bash
pnpm scrape:refresh          # re-scrapes SKUs that are older than PARTSKING_REFRESH_TTL
pnpm scrape:refresh --dry-run# show which SKUs would be refreshed without running Python
pnpm scrape:refresh --ttl 4  # override the TTL window for this invocation
```
- Defaults to the SKUs listed in `data/seed_parts.json`. If that file is missing, it falls back
  to whatever the cache already contains.
- Pair this with Mission Control jobs or cron to schedule hourly/overnight refreshes.

### Run everything locally
```bash
pnpm dev:full   # runs Vite UI (5173) + Express API (4000)
```
- Frontend: http://localhost:3765
- API: http://localhost:4000/api/parts?partNumber=LM358N

### Export results
Once a lookup completes, use the **Export CSV** button in the Results panel to download the filtered
supplier matches (includes part number, supplier, URL, confidence, price/stock, and cache metadata).

### Production build
```bash
pnpm build      # builds React app + compiles API (dist/server)
pnpm api:start  # runs compiled API
pnpm preview    # serves built React bundle for inspection
```

## GitHub Pages deployment
The repository ships with `.github/workflows/static.yml`, which builds the Vite bundle and deploys `dist/` to Pages. To make the hosted UI work:

1. In **Settings → Pages**, set **Build and deployment** to **GitHub Actions**.
2. Add either a repository variable or secret named `VITE_API_BASE_URL` that points to your hosted Express API (e.g. Render/Fly/Supabase Functions). The workflow forwards it into `pnpm build` so the static bundle hits the correct origin instead of `/api` on github.io.
3. (Optional) Override `VITE_BASE_PATH` if you serve from a custom domain; otherwise leave it at `./` so assets resolve when Pages serves from `/partsking/`.
4. Push to `main`. The workflow installs pnpm, runs `pnpm build`, uploads `dist/`, and `actions/deploy-pages` publishes it.

Once the deployment succeeds, the Pages URL listed under the `github-pages` environment will load the React front-end and proxy API calls to the host you supplied via `VITE_API_BASE_URL`.

## Scheduled cache refresh (GitHub Actions)
The repo also includes `.github/workflows/cache-refresh.yml`, which re-runs `pnpm scrape:refresh` on a 6-hour cadence.

1. Add the Supabase + cache secrets under **Settings → Secrets and variables → Actions**:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MIGRATION_URL`
   - (optional) override defaults by setting repo variables such as `PARTSKING_REFRESH_TTL`, `PARTSKING_REFRESH_LIMIT`, `PARTSKING_REFRESH_LIST`, or `VITE_API_BASE_URL`.
2. The workflow pulls the repo, installs Node/Python deps, and executes `pnpm scrape:refresh`.
3. Use `workflow_dispatch` inputs (`ttl_hours`, `limit`) to run ad-hoc refreshes with different windows.

Secrets are only required when the job needs to write into Supabase; the workflow skips scheduled runs for forks automatically.

## Data refresh strategy
- Supabase is the canonical cache in production. Local dev falls back to SQLite (`data/parts.db`) automatically.
- Every `/api/parts` call checks the cache using `PARTSKING_CACHE_TTL_HOURS` (default 24h). Fresh hits return immediately with `source: 'cache'` + `cachedAt`.
- Cache misses spawn the Scrapling runner (`python -m scraper.runner --part ... --json-out <tmp>`). Once results succeed, the API writes them back into Supabase so the next lookup is instant.
- `/api/cache` responses now emit TTL metadata (`ageMinutes`, `status`, `isStale`) plus the server’s configured `ttlHours`, so the UI (and any downstream automations) can flag stale SKUs.
- `POST /api/cache/:partNumber/refresh` triggers a manual, single-SKU refresh. It re-runs the scraper immediately, updates Supabase/SQLite, and returns the live listings + new `cachedAt` timestamp so the UI can update in-place.
- `pnpm scrape:refresh` inspects the watch list (`PARTSKING_REFRESH_LIST`) and re-fetches SKUs whose last cached timestamp is older than `PARTSKING_REFRESH_TTL` (default 6h). Pair it with the included GitHub Action or any cron job.
- `pnpm scrape:seed` still force-refreshes the SKUs found in `data/seed_parts.json`, bypassing TTL checks.
- `pnpm prune:cache [hours]` deletes rows older than the provided window to keep Supabase lean.

## Cache health monitor
- The React UI ships with a **Cache health** section that lists the most recent cached SKUs, highlights stale entries (based on `PARTSKING_CACHE_TTL_HOURS`), and lets you refresh individual SKUs or batch-refresh the top stale ones (up to 3 per click).
- The panel calls `/api/cache?limit=25` for telemetry and `/api/cache/:partNumber/refresh` for inline refreshes, so you can keep the cache warm without leaving the dashboard.

## Simple AI / scoring
The matching confidence is a normalized Levenshtein score (0–1). Requests can enforce a minimum confidence via
the UI or `minConfidence` query parameter, so you only act on listings that look similar to the requested part
number.


## Supplier coverage

We currently prioritize the 11 dealer sites Nicco specified (Jack's Small Engines, Pro Auto Parts Direct, Exmark,
Menominee Industrial Supply, PorchTree, BMI Karts, Safford Equipment, Chicago Engines, MowPart, RepairClinic,
and Stems). See [`docs/SOURCES.md`](docs/SOURCES.md) for exact search endpoints + parser notes.


### Python scrapers

A Scrapling-based scraper lives in `scraper/runner.py`. Example usage (inside the project venv):

```bash
cd parts-king
source .venv/bin/activate
python -m scraper.runner --part LM358N --limit 5 --json-out /tmp/lm358n.json
```

That fetches each supplier catalog (Shopify/WooCommerce/Shift4Shop parsers today). When invoked from the Node API/CLI we pass `--json-out <tmpfile>` so the TypeScript layer can push the listings into Supabase. Passing `--write` still works for the legacy SQLite fallback.

### Getting started

- `pnpm install`
- `cp .env.example .env.local` and set `SERPAPI_KEY`
- `pnpm dev:full` → API on :4000, UI on http://localhost:3765
