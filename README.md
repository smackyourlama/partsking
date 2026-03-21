# PartsKing

Omni-source part search that caches supplier listings locally. Enter a part number once, and PartsKing
collects Amazon/eBay/Digi-Key/Mouser listings plus the supplier domains you specified via a Scrapling crawler, scores them with a Levenshtein-based confidence check, and stores the results in SQLite so repeat lookups are instant. Subsequent searches hit the cache first, so you get near-zero
latency and a fallback when live lookups fail.

## Requirements
- Node.js 18+
- pnpm 9+
- Python 3.14+ (only if you want to run Scrapling/Python-based enrichments later)

## Project layout
```
parts-king/
├── src/                # React front-end (Vite)
├── server/             # Express API + search adapters + SQLite access
├── scripts/cacheParts.ts  # CLI to pre-populate the cache from seed_parts.json
├── data/
│   ├── parts.db        # SQLite cache (auto-created)
│   └── seed_parts.json # initial part numbers to warm the cache
└── .env.local          # place SERPAPI_KEY here
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
```

### Pre-populate the cache
```bash
pnpm scrape:seed    # uses the Scrapling runner for each SKU in data/seed_parts.json
```

### Run everything locally
```bash
pnpm dev:full   # runs Vite UI (5173) + Express API (4000)
```
- Frontend: http://localhost:3765
- API: http://localhost:4000/api/parts?partNumber=LM358N

### Production build
```bash
pnpm build      # builds React app + compiles API (dist/server)
pnpm api:start  # runs compiled API
pnpm preview    # serves built React bundle for inspection
```

## Data refresh strategy
- The API returns cached results first (entries fresher than `PARTSKING_CACHE_TTL_HOURS`, default 24h).
- On a cache miss, the Node server spawns the Scrapling runner (`python -m scraper.runner --part ... --write`),
  waits for it to populate SQLite, then serves the filtered results.
- You can periodically re-run `pnpm scrape:seed` (or call the runner directly) to warm specific SKUs.
- Use `pnpm prune:cache [hours]` to delete rows older than your retention window.

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
python -m scraper.runner --part LM358N --limit 5 --write
```

That fetches each supplier catalog (Shopify/WooCommerce/Shift4Shop parsers today), writes the normalized listings into `data/parts.db`, and the UI/API immediately serve the data via the existing `/api/parts` route.

### Getting started

- `pnpm install`
- `cp .env.example .env.local` and set `SERPAPI_KEY`
- `pnpm dev:full` → API on :4000, UI on http://localhost:3765
