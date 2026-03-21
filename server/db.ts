import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { SearchResult } from './searchService.js'

const DB_PATH = process.env.PARTSKING_DB_PATH
  ? path.resolve(process.cwd(), process.env.PARTSKING_DB_PATH)
  : path.resolve(process.cwd(), 'data/parts.db')

const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const sqlite = new Database(DB_PATH)

sqlite.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_part_number ON part_listings(part_number);
`)

const deleteStmt = sqlite.prepare('DELETE FROM part_listings WHERE part_number = ?')
const insertStmt = sqlite.prepare(
  `INSERT INTO part_listings (part_number, source, title, url, price, stock_status, confidence, payload)
   VALUES (@part_number, @source, @title, @url, @price, @stock_status, @confidence, @payload)`,
)
const listStmt = sqlite.prepare('SELECT DISTINCT part_number FROM part_listings ORDER BY part_number COLLATE NOCASE')
const readStmt = sqlite.prepare(
  `SELECT payload, scraped_at FROM part_listings
     WHERE part_number = ? AND scraped_at >= datetime('now', ?)
     ORDER BY confidence DESC`,
)

export function writeListings(partNumber: string, results: SearchResult[]) {
  if (!results.length) return

  const rows = results.map((item) => ({
    part_number: partNumber,
    source: item.source,
    title: item.title,
    url: item.url,
    price: item.price ?? null,
    stock_status: item.inStock === undefined ? null : item.inStock ? 'in_stock' : 'out_of_stock',
    confidence: item.confidence,
    payload: JSON.stringify(item),
  }))

  const tx = sqlite.transaction((payloads: typeof rows) => {
    deleteStmt.run(partNumber)
    payloads.forEach((payload) => insertStmt.run(payload))
  })

  tx(rows)
}

export function readListings(partNumber: string, maxAgeHours: number) {
  const ttlWindow = `-${maxAgeHours} hours`
  const rows = readStmt.all(partNumber, ttlWindow) as { payload: string; scraped_at: string }[]
  if (!rows.length) return null
  return rows.map((row) => JSON.parse(row.payload) as SearchResult)
}

export function listPartNumbers(): string[] {
  const rows = listStmt.all() as { part_number: string }[]
  return rows.map((row) => row.part_number)
}
