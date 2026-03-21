from __future__ import annotations

import argparse
import json
import sys
from typing import List

from scrapling import Fetcher

from .models import ScrapedListing
from .parsers import PARSER_MAP
from .source_registry import SOURCES, PLATFORM_JACKS, PLATFORM_REPAIRCLINIC
from .utils import compute_confidence, write_to_sqlite


def run_for_part(part_number: str, limit_per_source: int | None = None) -> List[ScrapedListing]:
  aggregated: List[ScrapedListing] = []
  for source in SOURCES:
    if source.parser in {PLATFORM_JACKS, PLATFORM_REPAIRCLINIC}:
      print(f"[skip] {source.label} requires stealth fetcher (coming soon)")
      continue
    url = source.search_template.format(query=part_number)
    print(f"[fetch] {source.label} -> {url}")
    try:
      response = Fetcher.get(url, verify=False)
    except Exception as error:  # noqa: BLE001
      print(f"  ! fetch failed: {error}")
      continue

    parser = PARSER_MAP.get(source.parser)
    if not parser:
      print(f"  ! no parser registered for {source.parser}")
      continue

    listings = parser(response, part_number, source.label)
    if limit_per_source:
      listings = listings[:limit_per_source]
    print(f"  → {len(listings)} listings")
    aggregated.extend(listings)

  return aggregated


def main():
  parser = argparse.ArgumentParser(description="Scrape supplier catalogs via Scrapling and populate SQLite cache")
  parser.add_argument('--part', required=True, help='Part number / SKU to search for')
  parser.add_argument('--limit', type=int, default=None, help='Max results per source (optional)')
  parser.add_argument('--write', action='store_true', help='Persist results into data/parts.db')
  args = parser.parse_args()

  listings = run_for_part(args.part, args.limit)

  if args.write and listings:
    write_to_sqlite(args.part, listings)
    print(f"[db] Wrote {len(listings)} rows into listings table")
  else:
    print(json.dumps([l.__dict__ for l in listings], indent=2))


if __name__ == '__main__':
  main()
