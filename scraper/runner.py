from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import List

import requests
from requests import Response as RequestsResponse
from requests.exceptions import RequestException
import urllib3

from scrapling.engines.toolbelt.custom import Response as ScraplingResponse

from .models import ScrapedListing
from .parsers import PARSER_MAP
from .source_registry import SOURCES, PLATFORM_JACKS, PLATFORM_REPAIRCLINIC
from .utils import write_to_sqlite

DEFAULT_TIMEOUT = 15
DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
}

_session = requests.Session()
_session.headers.update(DEFAULT_HEADERS)
_session.verify = False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def _to_scrapling_response(resp: RequestsResponse, request_headers: dict[str, str]) -> ScraplingResponse:
  cookies = tuple(resp.cookies.items())
  history = [{'status': h.status_code, 'url': h.url} for h in resp.history] if resp.history else []
  encoding = resp.encoding or resp.apparent_encoding or 'utf-8'
  method = resp.request.method if resp.request else 'GET'
  return ScraplingResponse(
    url=resp.url,
    content=resp.content,
    status=resp.status_code,
    reason=resp.reason or '',
    cookies=cookies,
    headers=dict(resp.headers),
    request_headers=request_headers,
    encoding=encoding,
    method=method,
    history=history,
  )


def _fetch_source(source, part_number: str) -> ScraplingResponse | None:
  url = source.search_template.format(query=part_number)
  headers = {**DEFAULT_HEADERS, **(source.headers or {})}
  timeout = source.timeout or DEFAULT_TIMEOUT
  print(f"[fetch] {source.label} -> {url}")
  try:
    response = _session.get(url, headers=headers, timeout=timeout, allow_redirects=True)
  except RequestException as error:  # noqa: BLE001
    print(f"  ! fetch failed: {error}")
    return None

  if response.status_code >= 400:
    print(f"  ! fetch failed with status {response.status_code}")
    return None

  return _to_scrapling_response(response, headers)


def run_for_part(part_number: str, limit_per_source: int | None = None) -> List[ScrapedListing]:
  aggregated: List[ScrapedListing] = []
  for source in SOURCES:
    if source.parser in {PLATFORM_JACKS, PLATFORM_REPAIRCLINIC}:
      print(f"[skip] {source.label} requires stealth fetcher (coming soon)")
      continue

    response = _fetch_source(source, part_number)
    if response is None:
      continue

    parser = PARSER_MAP.get(source.parser)
    if not parser:
      print(f"  ! no parser registered for {source.parser}")
      continue

    listings = parser(response, part_number, source.slug)
    if limit_per_source:
      listings = listings[:limit_per_source]
    print(f"  → {len(listings)} listings")
    aggregated.extend(listings)

  return aggregated


def main():
  parser = argparse.ArgumentParser(description="Scrape supplier catalogs via HTTP clients and populate SQLite cache")
  parser.add_argument('--part', required=True, help='Part number / SKU to search for')
  parser.add_argument('--limit', type=int, default=None, help='Max results per source (optional)')
  parser.add_argument('--write', action='store_true', help='Persist results into data/parts.db')
  parser.add_argument('--json-out', type=str, help='Write normalized listings to this JSON file (node ingestion)')
  args = parser.parse_args()

  listings = run_for_part(args.part, args.limit)

  if args.write and listings:
    write_to_sqlite(args.part, listings)
    print(f"[db] Wrote {len(listings)} rows into listings table")

  payload = [asdict(listing) for listing in listings]
  if args.json_out:
    output_path = Path(args.json_out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2))
    print(f"[json] wrote {len(payload)} rows to {output_path}")
  elif not args.write:
    print(json.dumps(payload, indent=2))


if __name__ == '__main__':
  main()
