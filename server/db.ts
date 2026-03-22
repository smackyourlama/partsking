import Database from 'better-sqlite3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import type { SearchResult } from './searchService.js'

export type CachedPartSummary = {
  partNumber: string
  cachedAt: string | null
}

type CachedListingResponse = {
  results: SearchResult[]
  scrapedAt: string
}

type CacheStore = {
  writeListings(partNumber: string, results: SearchResult[]): Promise<void>
  readListings(partNumber: string, maxAgeHours: number): Promise<CachedListingResponse | null>
  listPartNumbers(): Promise<CachedPartSummary[]>
  pruneListings(maxAgeHours: number): Promise<void>
}

const store = createStore()

export function usingSupabase() {
  return store.kind === 'supabase'
}

export async function writeListings(partNumber: string, results: SearchResult[]) {
  await store.writeListings(partNumber, results)
}

export async function readListings(partNumber: string, maxAgeHours: number) {
  return store.readListings(partNumber, maxAgeHours)
}

export async function listPartNumbers() {
  return store.listPartNumbers()
}

export async function pruneListings(maxAgeHours: number) {
  await store.pruneListings(maxAgeHours)
}

function createStore(): CacheStore & { kind: 'supabase' | 'sqlite' } {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { kind: 'supabase', ...createSupabaseStore() }
  }
  return { kind: 'sqlite', ...createSqliteStore() }
}

function createSupabaseStore(): CacheStore {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } })

  async function ensurePartRecord(partNumber: string, cachedAt: string) {
    const { data, error } = await supabase
      .from('parts')
      .upsert(
        { part_number: partNumber, last_cached_at: cachedAt },
        { onConflict: 'part_number' },
      )
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`[parts] unable to upsert ${partNumber}: ${error?.message ?? 'missing row'}`)
    }
    return data.id as string
  }

  return {
    async writeListings(partNumber, results) {
      const cachedAt = new Date().toISOString()
      const partId = await ensurePartRecord(partNumber, cachedAt)

      const { error: deleteError } = await supabase.from('part_listings').delete().eq('part_id', partId)
      if (deleteError) {
        throw new Error(`[part_listings] delete failed: ${deleteError.message}`)
      }

      if (!results.length) {
        return
      }

      const payload = results.map((item) => ({
        part_id: partId,
        part_number: partNumber,
        source: item.source,
        title: item.title,
        url: item.url,
        price: item.price ?? null,
        stock_status: item.inStock === undefined ? null : item.inStock ? 'in_stock' : 'out_of_stock',
        confidence: item.confidence,
        payload: item,
      }))

      const { error: insertError } = await supabase.from('part_listings').insert(payload)
      if (insertError) {
        throw new Error(`[part_listings] insert failed: ${insertError.message}`)
      }
    },

    async readListings(partNumber, maxAgeHours) {
      const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('part_latest')
        .select('payload, scraped_at')
        .eq('part_number', partNumber)
        .gte('scraped_at', cutoff)
        .order('scraped_at', { ascending: false })

      if (error) {
        throw new Error(`[part_latest] read failed: ${error.message}`)
      }

      if (!data || data.length === 0) return null
      const scrapedAt = data[0]?.scraped_at ?? new Date().toISOString()
      const results = data.map((row) => row.payload as SearchResult)
      return { results, scrapedAt }
    },

    async listPartNumbers() {
      const { data, error } = await supabase
        .from('parts')
        .select('part_number, last_cached_at')
        .order('last_cached_at', { ascending: false, nullsFirst: true })
        .order('part_number', { ascending: true })

      if (error) {
        throw new Error(`[parts] list failed: ${error.message}`)
      }

      return (data ?? []).map((row) => ({
        partNumber: row.part_number as string,
        cachedAt: (row.last_cached_at as string | null) ?? null,
      }))
    },

    async pruneListings(maxAgeHours) {
      const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('part_listings').delete().lt('scraped_at', cutoff)
      if (error) {
        throw new Error(`[part_listings] prune failed: ${error.message}`)
      }
    },
  }
}

function createSqliteStore(): CacheStore {
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
  const listStmt = sqlite.prepare(
    `SELECT part_number, MAX(scraped_at) as last_seen
       FROM part_listings
       GROUP BY part_number
       ORDER BY last_seen DESC, part_number COLLATE NOCASE`,
  )
  const readStmt = sqlite.prepare(
    `SELECT payload, scraped_at FROM part_listings
       WHERE part_number = ? AND scraped_at >= datetime('now', ?)
       ORDER BY confidence DESC`,
  )
  const pruneStmt = sqlite.prepare(
    `DELETE FROM part_listings WHERE scraped_at < datetime('now', ?)`
  )

  return {
    async writeListings(partNumber, results) {
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
    },

    async readListings(partNumber, maxAgeHours) {
      const ttlWindow = `-${maxAgeHours} hours`
      const rows = readStmt.all(partNumber, ttlWindow) as { payload: string; scraped_at: string }[]
      if (!rows.length) return null
      const scrapedAt = rows[0]?.scraped_at ?? new Date().toISOString()
      const results = rows.map((row) => JSON.parse(row.payload) as SearchResult)
      return { results, scrapedAt }
    },

    async listPartNumbers() {
      const rows = listStmt.all() as { part_number: string; last_seen: string | null }[]
      return rows.map((row) => ({ partNumber: row.part_number, cachedAt: row.last_seen }))
    },

    async pruneListings(maxAgeHours) {
      const ttlWindow = `-${maxAgeHours} hours`
      pruneStmt.run(ttlWindow)
    },
  }
}
