from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(slots=True)
class ScrapedListing:
  part_number: str
  source: str
  title: str
  url: str
  price: Optional[str]
  description: Optional[str]
  in_stock: Optional[bool]
  confidence: float


@dataclass(slots=True)
class SourceConfig:
  slug: str
  label: str
  domain: str
  search_template: str
  parser: str
  requires_stealth: bool = False
  notes: Optional[str] = None
  headers: dict[str, str] | None = None
  timeout: float | None = None
