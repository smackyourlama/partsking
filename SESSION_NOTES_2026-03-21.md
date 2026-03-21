# PartsKing build session – 2026-03-21

## Open tasks
1. Confirm front-end requirements for the v1 UI (additional fields? saved searches? dashboards?).
2. Define scraper pipeline inputs/outputs and storage target (SQLite vs. Postgres vs. JSONL cache).
3. Inventory current SerpAPI coverage vs. suppliers Nicco wants next.
4. Draft CLI/cron entry point for refresh jobs (seed + incremental updates).

## Proposed next steps
- [ ] Gather requirements from Nicco (front-end scope, supplier list, desired database).
- [ ] Design the scraper pipeline:
  - Source adapters per marketplace.
  - Normalized `PartListing` schema.
  - Persistence layer + refresh strategy.
- [ ] Add UI affordances for local-database search (vs. live SerpAPI fetch).
- [ ] Document the job runner in README + Mission Control.

_Note: waiting on requirements before writing code so we don’t build the wrong flow._
