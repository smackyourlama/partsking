from __future__ import annotations

from urllib.parse import urljoin
from typing import List

from scrapling.engines.toolbelt.custom import Response

from .models import ScrapedListing
from .utils import compute_confidence


def _clean_text(value: str | None) -> str:
  return value.strip() if value else ''


def parse_shopify(response: Response, part_number: str, source: str) -> List[ScrapedListing]:
  listings: List[ScrapedListing] = []
  selectors = ['.productgrid--item', '.product-grid .grid__item', '.ProductItem']
  for selector in selectors:
    cards = response.css(selector)
    if cards:
      break
  else:
    cards = []

  for card in cards:
    title = _clean_text(card.css('.card__heading::text').extract_first() or card.css('.card__heading a::text').extract_first())
    if not title:
      continue
    href = card.css('a::attr(href)').extract_first() or ''
    url = urljoin(response.url, href)
    price = _clean_text(
      card.css('.price-item--regular::text').extract_first()
      or card.css('.price__current::text').extract_first()
      or card.css('.price::text').extract_first(),
    )
    description = _clean_text(
      card.css('.card-information__text::text').extract_first()
      or card.css('.card__content::text').extract_first()
      or card.css('.productitem--desc::text').extract_first(),
    )
    sold_out = 'sold out' in card.get(default='').lower()
    listings.append(
      ScrapedListing(
        part_number=part_number,
        source=source,
        title=title,
        url=url,
        price=price or None,
        description=description or None,
        in_stock=not sold_out if price else None,
        confidence=compute_confidence(part_number, title),
      ),
    )
  return listings


def parse_woocommerce(response: Response, part_number: str, source: str) -> List[ScrapedListing]:
  listings: List[ScrapedListing] = []
  cards = response.css('.products .product, .product-grid .product')
  for card in cards:
    title = _clean_text(
      card.css('.woocommerce-loop-product__title::text').extract_first()
      or card.css('h2::text').extract_first(),
    )
    if not title:
      continue
    href = card.css('a::attr(href)').extract_first() or ''
    url = urljoin(response.url, href)
    price = _clean_text(
      card.css('.price ins .amount::text').extract_first()
      or card.css('.price .amount::text').extract_first(),
    )
    description = ' '.join(
      text.strip()
      for text in card.css('.woocommerce-product-details__short-description::text').extract()
      if text.strip()
    )
    stock_class = (card.attrib.get('class') or '').lower()
    in_stock = None
    if 'outofstock' in stock_class:
      in_stock = False
    elif 'instock' in stock_class:
      in_stock = True
    listings.append(
      ScrapedListing(
        part_number=part_number,
        source=source,
        title=title,
        url=url,
        price=price or None,
        description=description or None,
        in_stock=in_stock,
        confidence=compute_confidence(part_number, title),
      ),
    )
  return listings


def parse_bigcommerce(response: Response, part_number: str, source: str) -> List[ScrapedListing]:
  listings: List[ScrapedListing] = []
  cards = response.css('.productGrid li.product, .productGrid .product, .productGrid .card')
  seen_urls: set[str] = set()

  def _first_text(card_selector) -> str:
    for raw in card_selector:
      cleaned = _clean_text(raw)
      if cleaned:
        return cleaned
    return ''

  for card in cards:
    title = _first_text(card.css('.card-title a::text, .card-title::text').extract())
    if not title:
      continue
    href = card.css('a.card-title::attr(href)').extract_first() or card.css('a::attr(href)').extract_first() or ''
    url = urljoin(response.url, href)
    if not url or url in seen_urls:
      continue
    seen_urls.add(url)
    price = _first_text(
      card.css('.price-section--withoutTax .price::text, .card-price::text, .price::text').extract()
    )
    description = ' '.join(
      text.strip()
      for text in card.css('.card-text--cart::text, .card-text--price::text, .card-body::text').extract()
      if text.strip()
    )
    stock_note = _first_text(
      card.css('.stock-level::text, .stock-aggregate-value::text').extract()
    )
    in_stock = None
    if stock_note:
      lowered = stock_note.lower()
      if 'in stock' in lowered or 'ships' in lowered or 'available' in lowered:
        in_stock = True
      elif 'out of stock' in lowered or 'backorder' in lowered or 'backordered' in lowered:
        in_stock = False
    listings.append(
      ScrapedListing(
        part_number=part_number,
        source=source,
        title=title,
        url=url,
        price=price or None,
        description=description or None,
        in_stock=in_stock,
        confidence=compute_confidence(part_number, title),
      ),
    )
  return listings


def parse_shift4shop(response: Response, part_number: str, source: str) -> List[ScrapedListing]:
  listings: List[ScrapedListing] = []
  rows = response.css('.product-item, .itemblock')
  for row in rows:
    title = _clean_text(
      row.css('.ProductTitle::text').extract_first()
      or row.css('.ProductDetails a::text').extract_first(),
    )
    if not title:
      continue
    href = row.css('a::attr(href)').extract_first() or ''
    url = urljoin(response.url, href)
    price = _clean_text(
      row.css('.ProductPrice::text').extract_first()
      or row.css('.price::text').extract_first(),
    )
    description = _clean_text(
      row.css('.ProductDescription::text').extract_first()
      or row.css('.description::text').extract_first(),
    )
    body = row.get(default='').lower()
    in_stock = None
    if 'out of stock' in body:
      in_stock = False
    listings.append(
      ScrapedListing(
        part_number=part_number,
        source=source,
        title=title,
        url=url,
        price=price or None,
        description=description or None,
        in_stock=in_stock,
        confidence=compute_confidence(part_number, title),
      ),
    )
  return listings


def parse_repairclinic(response: Response, part_number: str, source: str) -> List[ScrapedListing]:
  listings: List[ScrapedListing] = []
  cards = response.css('[data-entity-type="Product"]')
  for card in cards:
    title = _clean_text(card.css('[data-variable="product-name"]::text').extract_first())
    if not title:
      continue
    href = card.css('a.product-card__title::attr(href)').extract_first() or card.css('a::attr(href)').extract_first() or ''
    url = urljoin(response.url, href)
    price = _clean_text(card.css('.product-card__price::text').extract_first() or card.css('.price::text').extract_first())
    description = _clean_text(
      card.css('.product-card__description::text').extract_first()
      or card.css('.product-card__subtitle::text').extract_first(),
    )
    stock_badge = card.css('.product-card__availability::text').extract_first()
    in_stock = None
    if stock_badge:
      text = stock_badge.strip().lower()
      if 'in stock' in text:
        in_stock = True
      elif 'out of stock' in text:
        in_stock = False
    listings.append(
      ScrapedListing(
        part_number=part_number,
        source=source,
        title=title,
        url=url,
        price=price or None,
        description=description or None,
        in_stock=in_stock,
        confidence=compute_confidence(part_number, title),
      ),
    )
  return listings


def parse_partstree(response: Response, part_number: str, source: str) -> List[ScrapedListing]:
  listings: List[ScrapedListing] = []
  cards = response.css('.pt-product.catalog.part, .pt-product')
  for card in cards:
    title = _clean_text(card.css('.description a::text').extract_first())
    if not title:
      continue
    href = card.css('.description a::attr(href)').extract_first() or ''
    url = urljoin(response.url, href)
    price_text = ''.join(text.strip() for text in card.css('.price .price::text').extract() if text.strip())
    if not price_text:
      price_text = ''.join(text.strip() for text in card.css('.price::text').extract() if text.strip())
    currency = _clean_text(card.css('.price .currency::text').extract_first())
    price = f"{currency}{price_text}".strip() if price_text else ''
    description = ' '.join(text.strip() for text in card.css('.short-description::text').extract() if text.strip())
    stock_note = ' '.join(text.strip() for text in card.css('.shipping::text, .availability::text').extract() if text.strip())
    in_stock = None
    if stock_note:
      lowered = stock_note.lower()
      if 'in stock' in lowered:
        in_stock = True
      elif 'out of stock' in lowered or 'backorder' in lowered:
        in_stock = False
    listings.append(
      ScrapedListing(
        part_number=part_number,
        source=source,
        title=title,
        url=url,
        price=price or None,
        description=description or None,
        in_stock=in_stock,
        confidence=compute_confidence(part_number, title),
      ),
    )
  return listings


PARSER_MAP = {
  'shopify': parse_shopify,
  'woocommerce': parse_woocommerce,
  'bigcommerce': parse_bigcommerce,
  'shift4shop': parse_shift4shop,
  'repairclinic': parse_repairclinic,
  'partstree': parse_partstree,
}
