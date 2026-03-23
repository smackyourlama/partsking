import Database from 'better-sqlite3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import type { SearchResult } from './searchService.js'
import { getSupplierLabel, mapSourceToSupplierSlug } from '../shared/suppliers.js'

export type CachedPartSummary = {
  partNumber: string
  cachedAt: string | null
}

export type CachedListingResponse = {
  results: SearchResult[]
  scrapedAt: string
  isStale: boolean
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

function enrichSearchResult(result: SearchResult): SearchResult {
  const supplierSlug = result.supplierSlug ?? mapSourceToSupplierSlug(result.source) ?? undefined
  return {
    ...result,
    supplierSlug,
    supplierName: result.supplierName ?? getSupplierLabel(supplierSlug) ?? undefined,
  }
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
  const supplierCache = new Map<string, string | null>()

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

  async function resolveSupplierId(source: string) {
    const supplierSlug = mapSourceToSupplierSlug(source)
    if (!supplierSlug) {
      return null
    }

    if (supplierCache.has(supplierSlug)) {
      return supplierCache.get(supplierSlug) ?? null
    }

    const { data, error } = await supabase
      .from('suppliers')
      .select('id')
      .eq('slug', supplierSlug)
      .single()

    if (error) {
      console.warn(`[suppliers] unable to resolve ${supplierSlug}: ${error.message}`)
      supplierCache.set(supplierSlug, null)
      return null
    }

    supplierCache.set(supplierSlug, data?.id ?? null)
    return data?.id ?? null
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

      const payload = await Promise.all(
        results.map(async (item) => ({
          part_id: partId,
          part_number: partNumber,
          source: item.source,
          supplier_id: await resolveSupplierId(item.source),
          title: item.title,
          url: item.url,
          price: item.price ?? null,
          stock_status: item.inStock === undefined ? null : item.inStock ? 'in_stock' : 'out_of_stock',
          confidence: item.confidence,
          payload: item,
        })),
      )

      const { error: insertError } = await supabase.from('part_listings').insert(payload)
      if (insertError) {
        throw new Error(`[part_listings] insert failed: ${insertError.message}`)
      }
    },

    async readListings(partNumber, maxAgeHours) {
      const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString()

      const fetchRows = async (after?: string) => {
        let query = supabase
          .from('part_latest')
          .select('payload, scraped_at')
          .eq('part_number', partNumber)
          .order('scraped_at', { ascending: false })

        if (after) {
          query = query.gte('scraped_at', after)
        }

        const { data, error } = await query
        if (error) {
          throw new Error(`[part_latest] read failed: ${error.message}`)
        }
        return data ?? []
      }

      const freshRows = await fetchRows(cutoff)
      if (freshRows.length > 0) {
        const scrapedAt = freshRows[0]?.scraped_at ?? new Date().toISOString()
        const results = freshRows.map((row) => enrichSearchResult(row.payload as SearchResult))
        return { results, scrapedAt, isStale: false }
      }

      const fallbackRows = await fetchRows()
      if (fallbackRows.length === 0) {
        return null
      }

      const scrapedAt = fallbackRows[0]?.scraped_at ?? new Date().toISOString()
      const results = fallbackRows.map((row) => enrichSearchResult(row.payload as SearchResult))
      return { results, scrapedAt, isStale: true }
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
  const readFreshStmt = sqlite.prepare(
    `SELECT payload, scraped_at FROM part_listings
       WHERE part_number = ? AND scraped_at >= datetime('now', ?)
       ORDER BY scraped_at DESC, confidence DESC`,
  )
  const readAnyStmt = sqlite.prepare(
    `SELECT payload, scraped_at FROM part_listings
       WHERE part_number = ?
       ORDER BY scraped_at DESC, confidence DESC`,
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
      const freshRows = readFreshStmt.all(partNumber, ttlWindow) as { payload: string; scraped_at: string }[]
      if (freshRows.length > 0) {
        const scrapedAt = freshRows[0]?.scraped_at ?? new Date().toISOString()
        const results = freshRows.map((row) => JSON.parse(row.payload) as SearchResult)
        return { results, scrapedAt, isStale: false }
      }

      const fallbackRows = readAnyStmt.all(partNumber) as { payload: string; scraped_at: string }[]
      if (fallbackRows.length === 0) {
        return null
      }

      const scrapedAt = fallbackRows[0]?.scraped_at ?? new Date().toISOString()
      const results = fallbackRows.map((row) => JSON.parse(row.payload) as SearchResult)
      return { results, scrapedAt, isStale: true }
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
