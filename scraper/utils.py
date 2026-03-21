from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path
from typing import List

from .models import ScrapedListing

DB_PATH = Path(__file__).resolve().parents[1] / 'data' / 'parts.db'


def normalize(text: str) -> str:
  return re.sub(r'[^a-z0-9]', '', text.lower())


def levenshtein(a: str, b: str) -> int:
  if not a:
    return len(b)
  if not b:
    return len(a)
  prev = list(range(len(b) + 1))
  for i, ca in enumerate(a, 1):
    cur = [i]
    for j, cb in enumerate(b, 1):
      insert_cost = cur[j - 1] + 1
      delete_cost = prev[j] + 1
      replace_cost = prev[j - 1] + (0 if ca == cb else 1)
      cur.append(min(insert_cost, delete_cost, replace_cost))
    prev = cur
  return prev[-1]


def compute_confidence(part_number: str, candidate: str) -> float:
  part = normalize(part_number)
  sample = normalize(candidate)
  if not part or not sample:
    return 0.0
  if part in sample:
    return 0.95
  distance = levenshtein(part, sample)
  similarity = 1 - distance / max(len(part), len(sample))
  return round(max(0.0, similarity), 2)


def write_to_sqlite(part_number: str, rows: List[ScrapedListing]):
  DB_PATH.parent.mkdir(parents=True, exist_ok=True)
  conn = sqlite3.connect(DB_PATH)
  conn.execute(
    '''
    CREATE TABLE IF NOT EXISTS part_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_number TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      price TEXT,
      stock_status TEXT,
      confidence REAL NOT NULL,
      payload TEXT NOT NULL,
      scraped_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    '''
  )
  conn.execute('CREATE INDEX IF NOT EXISTS idx_part_number ON part_listings(part_number)')
  conn.execute('DELETE FROM part_listings WHERE part_number = ?', (part_number,))

  insert_sql = (
    'INSERT INTO part_listings (part_number, source, title, url, price, stock_status, confidence, payload) '
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?);'
  )

  with conn:
    for idx, row in enumerate(rows):
      stock_status = None
      if row.in_stock is True:
        stock_status = 'in_stock'
      elif row.in_stock is False:
        stock_status = 'out_of_stock'
      payload = {
        'id': f"{part_number}-{row.source}-{idx}-{int(time.time() * 1000)}",
        'source': row.source,
        'title': row.title,
        'url': row.url,
        'price': row.price,
        'description': row.description,
        'inStock': row.in_stock,
        'confidence': row.confidence,
      }
      conn.execute(
        insert_sql,
        (
          part_number,
          row.source,
          row.title,
          row.url,
          row.price,
          stock_status,
          row.confidence,
          json.dumps(payload),
        ),
      )
  conn.close()
