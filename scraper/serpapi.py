from __future__ import annotations

import os
from typing import List

import httpx

from .models import ScrapedListing, SourceConfig
from .utils import compute_confidence

SERPAPI_ENDPOINT = os.getenv('SERPAPI_ENDPOINT', 'https://serpapi.com/search.json')
SERPAPI_KEY = os.getenv('SERPAPI_KEY')
SERPAPI_ENGINE = os.getenv('SERPAPI_ENGINE', 'google')
SERPAPI_TIMEOUT = float(os.getenv('SERPAPI_TIMEOUT', '30'))
MAX_RESULTS_PER_SOURCE = int(os.getenv('SERPAPI_MAX_RESULTS', '8'))


def _append_unique(results: List[ScrapedListing], seen: set[str], listing: ScrapedListing) -> None:
  normalized = listing.url.lower()
  if normalized in seen:
    return
  seen.add(normalized)
  results.append(listing)


def _parse_price(raw_price):
  if raw_price is None:
    return None
  if isinstance(raw_price, (int, float)):
    return f"${raw_price:,.2f}"
  if isinstance(raw_price, str):
    return raw_price.strip()
  return None


def search_serpapi(part_number: str, source: SourceConfig) -> List[ScrapedListing]:
  if not SERPAPI_KEY:
    print('[serpapi] missing SERPAPI_KEY – skipping SerpAPI-backed sources')
    return []

  params = {
    'engine': SERPAPI_ENGINE,
    'api_key': SERPAPI_KEY,
    'q': f"{part_number} site:{source.domain}",
    'num': MAX_RESULTS_PER_SOURCE,
    'google_domain': 'google.com',
  }

  try:
    with httpx.Client(timeout=SERPAPI_TIMEOUT) as client:
      response = client.get(SERPAPI_ENDPOINT, params=params)
      response.raise_for_status()
      payload = response.json()
  except Exception as error:
    print(f"[serpapi] {source.slug} lookup failed: {error}")
    return []

  listings: List[ScrapedListing] = []
  seen: set[str] = set()

  for row in payload.get('organic_results', [])[:MAX_RESULTS_PER_SOURCE]:
    url = row.get('link') or row.get('displayed_link')
    title = row.get('title') or row.get('rich_snippet', {}).get('top', {}).get('title')
    if not url or not title:
      continue
    listing = ScrapedListing(
      part_number=part_number,
      source=source.label,
      title=title.strip(),
      url=url,
      price=_parse_price(row.get('price')),
      description=(row.get('snippet') or '').strip() or None,
      in_stock=None,
      confidence=compute_confidence(part_number, title),
    )
    _append_unique(listings, seen, listing)

  shopping_rows = payload.get('shopping_results', []) or []
  for row in shopping_rows:
    link = row.get('link') or row.get('product_link')
    title = row.get('title')
    if not link or not title:
      continue
    listing = ScrapedListing(
      part_number=part_number,
      source=f"{source.label} (Shopping)",
      title=title.strip(),
      url=link,
      price=_parse_price(row.get('price')),
      description=(row.get('snippet') or '').strip() or None,
      in_stock=None,
      confidence=compute_confidence(part_number, title),
    )
    _append_unique(listings, seen, listing)
    if len(listings) >= MAX_RESULTS_PER_SOURCE:
      break

  return listings
