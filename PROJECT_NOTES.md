# PartsKing – Requirements Backlog

_Last updated: 2026-03-20_

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

## Open questions
- Preferred database (SQLite, Postgres, etc.)?
- Final list of supplier domains beyond Amazon/eBay?
- How often should the refresh job run, and should it be automated (cron) or manual?

_(Nicco asked to park this for later; revisit when it’s time to implement.)_
