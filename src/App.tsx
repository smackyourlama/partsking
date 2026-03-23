import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SearchResult } from './types'
import './App.css'
import { getSupabaseClient } from './lib/supabaseClient'

const confidenceBands = [
  { label: 'Lenient (0.4+)', value: 0.4 },
  { label: 'Balanced (0.6+)', value: 0.6 },
  { label: 'Strict (0.8+)', value: 0.8 },
]

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
const buildApiUrl = (path: string, searchParams?: URLSearchParams) => {
  const query = searchParams ? `?${searchParams.toString()}` : ''
  if (rawApiBaseUrl) {
    return `${rawApiBaseUrl}${path}${query}`
  }
  return `${path}${query}`
}
const apiBackendAvailable = Boolean(rawApiBaseUrl || import.meta.env.DEV)

const CACHE_LIST_LIMIT = 25
const DEFAULT_CACHE_TTL_HOURS = 24
const MAX_BULK_REFRESH = 3

const supabaseClient = getSupabaseClient()
const supabaseReadsEnabled = Boolean(supabaseClient)
const preferSupabaseReads = !apiBackendAvailable && supabaseReadsEnabled
const configuredTtl = Number.parseFloat(import.meta.env.VITE_CACHE_TTL_HOURS ?? '')
const SUPABASE_CACHE_TTL_HOURS = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : DEFAULT_CACHE_TTL_HOURS

type ResultOrigin = 'live' | 'cache' | null

type ApiResponse = {
  results: SearchResult[]
  source?: ResultOrigin
  cachedAt?: string
}

type CachedResult = {
  results: SearchResult[]
  cachedAt?: string | null
  isStale?: boolean
}

type CacheEntryWire =
  | string
  | {
      partNumber?: string
      cachedAt?: string | null
      ageMinutes?: number | null
      isStale?: boolean
      status?: string
    }

type CachedPartSummary = {
  partNumber: string
  cachedAt: string | null
  ageMinutes: number | null
  isStale: boolean
  status: 'fresh' | 'stale' | 'unknown'
}

type CacheResponse = {
  parts?: CacheEntryWire[]
  ttlHours?: number
}

type RefreshResponse = {
  partNumber: string
  results: SearchResult[]
  cachedAt?: string | null
  source?: ResultOrigin
}

const deriveAgeMinutes = (age?: number | null, cachedAt?: string | null) => {
  if (typeof age === 'number' && Number.isFinite(age) && age >= 0) {
    return Math.floor(age)
  }
  if (!cachedAt) return null
  const timestamp = Date.parse(cachedAt)
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
}

const normalizeCachedParts = (entries?: CacheEntryWire[]): CachedPartSummary[] => {
  if (!entries) return []

  const normalized: CachedPartSummary[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (!trimmed) continue
      normalized.push({ partNumber: trimmed, cachedAt: null, ageMinutes: null, isStale: true, status: 'unknown' })
      continue
    }

    const partNumber = entry.partNumber?.trim()
    if (!partNumber) continue
    const ageMinutes = deriveAgeMinutes(entry.ageMinutes, entry.cachedAt ?? null)
    const explicitStatus = entry.status === 'fresh' || entry.status === 'stale' ? entry.status : null
    const inferredStale =
      typeof entry.isStale === 'boolean'
        ? entry.isStale
        : explicitStatus
        ? explicitStatus === 'stale'
        : ageMinutes === null
        ? true
        : false
    const status: CachedPartSummary['status'] =
      explicitStatus ?? (ageMinutes === null ? 'unknown' : inferredStale ? 'stale' : 'fresh')

    normalized.push({
      partNumber,
      cachedAt: entry.cachedAt ?? null,
      ageMinutes,
      isStale: inferredStale,
      status,
    })
  }

  return normalized
}

const describeCacheAge = (value?: string | null) => {
  if (!value) return 'age unknown'

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return value
  }

  const diffMs = Date.now() - timestamp
  const minutes = Math.floor(Math.abs(diffMs) / 60000)

  if (minutes < 1) return 'moments ago'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const SUPABASE_TTL_MS = SUPABASE_CACHE_TTL_HOURS * 60 * 60 * 1000

type SupabaseCacheRow = {
  part_number: string | null
  last_cached_at: string | null
}

type SupabaseListingRow = {
  payload: SearchResult | null
  scraped_at: string | null
}

const timestampFromIso = (value: string | null) => {
  if (!value) return Number.NaN
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

const computeIsStale = (cachedAt: string | null) => {
  if (!cachedAt) return true
  const ts = timestampFromIso(cachedAt)
  if (!Number.isFinite(ts)) return true
  return Date.now() - ts > SUPABASE_TTL_MS
}

const normalizePartNumber = (value: string) => value.trim()

const fetchSupabaseCacheSummary = async (limit: number) => {
  if (!supabaseClient) {
    return { parts: [] as CachedPartSummary[], ttlHours: SUPABASE_CACHE_TTL_HOURS }
  }

  const { data, error } = await supabaseClient
    .from('parts')
    .select('part_number,last_cached_at')
    .order('last_cached_at', { ascending: false, nullsFirst: false })
    .order('part_number', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  const normalized = (data ?? [])
    .map((row: SupabaseCacheRow) => {
      const partNumber = row.part_number ? row.part_number.trim() : null
      if (!partNumber) return null
      const cachedAt = row.last_cached_at ?? null
      const isStale = computeIsStale(cachedAt)
      const ageMinutes = deriveAgeMinutes(null, cachedAt)
      const status: CachedPartSummary['status'] = cachedAt ? (isStale ? 'stale' : 'fresh') : 'unknown'
      return { partNumber, cachedAt, ageMinutes, isStale, status }
    })
    .filter(Boolean) as CachedPartSummary[]

  return { parts: normalized, ttlHours: SUPABASE_CACHE_TTL_HOURS }
}

const fetchSupabaseListings = async (partNumber: string) => {
  if (!supabaseClient) return []
  const normalized = normalizePartNumber(partNumber)
  if (!normalized) return []
  const { data, error } = await supabaseClient
    .from('part_latest')
    .select('payload, scraped_at')
    .eq('part_number', normalized)
    .order('scraped_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SupabaseListingRow[]
}

const selectRowsWithTtl = (rows: SupabaseListingRow[]) => {
  if (rows.length === 0) {
    return { selected: rows, isStale: true }
  }

  const freshRows = rows.filter((row) => {
    const ts = timestampFromIso(row.scraped_at)
    return Number.isFinite(ts) && Date.now() - ts <= SUPABASE_TTL_MS
  })

  if (freshRows.length > 0) {
    return { selected: freshRows, isStale: false }
  }

  return { selected: rows, isStale: true }
}

const fetchSupabaseSearchResults = async (partNumber: string, minConfidence: number) => {
  if (!supabaseClient) return null
  const rows = await fetchSupabaseListings(partNumber)
  if (rows.length === 0) return null

  const { selected, isStale } = selectRowsWithTtl(rows)
  const filteredResults = selected
    .map((row) => row.payload)
    .filter((entry): entry is SearchResult => Boolean(entry && typeof entry.confidence === 'number' && entry.confidence >= minConfidence))

  return {
    results: filteredResults,
    cachedAt: selected[0]?.scraped_at ?? null,
    isStale,
  }
}

const fetchSupabaseCacheEntry = async (partNumber: string) => {
  if (!supabaseClient) return null
  const rows = await fetchSupabaseListings(partNumber)
  if (rows.length === 0) return null
  const { selected, isStale } = selectRowsWithTtl(rows)
  const mapped = selected
    .map((row) => row.payload)
    .filter((entry): entry is SearchResult => Boolean(entry))

  return {
    results: mapped,
    cachedAt: selected[0]?.scraped_at ?? null,
    isStale,
  }
}

function App() {
  const [partNumber, setPartNumber] = useState('')
  const [minConfidence, setMinConfidence] = useState(0.6)
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin>(null)
  const [cachedParts, setCachedParts] = useState<CachedPartSummary[]>([])
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [cacheTtlHours, setCacheTtlHours] = useState<number | null>(null)
  const [refreshingPart, setRefreshingPart] = useState<string | null>(null)
  const [bulkRefreshing, setBulkRefreshing] = useState(false)

  const loadCachedResults = useCallback(async (value: string): Promise<CachedResult | null> => {
    const trimmed = value.trim()
    if (!trimmed) return null

    if (supabaseReadsEnabled) {
      try {
        const snapshot = await fetchSupabaseCacheEntry(trimmed)
        if (snapshot) {
          return snapshot
        }
      } catch (error) {
        console.warn('[cache-fallback] supabase cache lookup failed', error)
      }
    }

    if (!apiBackendAvailable) {
      return null
    }

    try {
      const response = await fetch(buildApiUrl(`/api/cache/${encodeURIComponent(trimmed)}`))
      if (!response.ok) return null
      const data = (await response.json()) as CachedResult
      return data
    } catch (error) {
      console.warn('[cache-fallback] unable to load cached results', error)
      return null
    }
  }, [])

  const reloadCacheList = useCallback(async () => {
    if (preferSupabaseReads) {
      try {
        const data = await fetchSupabaseCacheSummary(CACHE_LIST_LIMIT)
        setCachedParts(normalizeCachedParts(data.parts))
        setCacheTtlHours(data.ttlHours)
        return
      } catch (error) {
        console.warn('[cache-list] supabase summary failed', error)
      }
    }

    if (!apiBackendAvailable) return

    try {
      const params = new URLSearchParams({ limit: CACHE_LIST_LIMIT.toString() })
      const response = await fetch(buildApiUrl('/api/cache', params))
      if (!response.ok) return
      const data = (await response.json()) as CacheResponse
      setCachedParts(normalizeCachedParts(data.parts))
      setCacheTtlHours(typeof data.ttlHours === 'number' ? data.ttlHours : null)
    } catch (error) {
      console.warn('[cache-list] unable to load cached parts', error)
    }
  }, [])

  useEffect(() => {
    reloadCacheList()
  }, [reloadCacheList])

  const filteredResults = useMemo(
    () => results.filter((item) => item.confidence >= minConfidence),
    [results, minConfidence],
  )

  const staleCount = useMemo(() => cachedParts.filter((entry) => entry.isStale).length, [cachedParts])
  const ttlDisplay = cacheTtlHours ?? DEFAULT_CACHE_TTL_HOURS
  const actionableStale = Math.min(staleCount, MAX_BULK_REFRESH)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!partNumber.trim()) {
      setError('Enter a part number to search.')
      return
    }

    const trimmedPart = partNumber.trim()

    try {
      setIsLoading(true)
      setError(null)
      setResults([])
      setResultOrigin(null)
      setCachedAt(null)

      if (preferSupabaseReads) {
        const supaData = await fetchSupabaseSearchResults(trimmedPart, minConfidence)
        if (!supaData) {
          throw new Error('No cached snapshot exists for that part yet. Run a refresh from a trusted device to populate it.')
        }

        setResults(supaData.results)
        setResultOrigin(supaData.isStale ? 'cache' : 'live')
        setCachedAt(supaData.cachedAt ?? null)
        if (supaData.results.length === 0) {
          setError('The cache is empty for this part. Trigger a refresh to source new listings.')
        }
        return
      }

      const params = new URLSearchParams({
        partNumber: trimmedPart,
        minConfidence: minConfidence.toString(),
      })
      const response = await fetch(buildApiUrl('/api/parts', params))
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Search failed. Try again later.')
      }
      const data = (await response.json()) as ApiResponse
      setResults(data.results)
      setResultOrigin(data.source ?? 'live')
      setCachedAt(data.cachedAt ?? null)
    } catch (err) {
      const friendly = (() => {
        if (err instanceof TypeError && /Failed to fetch/i.test(err.message)) {
          return 'Unable to reach the API. Make sure `pnpm api:dev` (or `pnpm dev:full`) is running.'
        }
        return err instanceof Error ? err.message : 'Unexpected error occurred.'
      })()
      const cachedResults = await loadCachedResults(trimmedPart)

      if (cachedResults) {
        setResults(cachedResults.results)
        setResultOrigin('cache')
        setCachedAt(cachedResults.cachedAt ?? null)
        setError(`${friendly} Showing cached snapshot instead.`)
      } else {
        setError(friendly)
        setResultOrigin(null)
        setCachedAt(null)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleCachedSelect = async (entry: CachedPartSummary) => {
    const value = entry.partNumber
    setPartNumber(value)
    setIsLoading(true)
    setError(null)
    setResultOrigin(null)
    setCachedAt(null)

    const cachedResults = await loadCachedResults(value)
    if (cachedResults) {
      setResults(cachedResults.results)
      setResultOrigin('cache')
      setCachedAt(cachedResults.cachedAt ?? null)
    } else {
      setResults([])
      setError('No cached snapshot for that part yet. Run a live search to populate it.')
    }

    setIsLoading(false)
  }

  const formatTimestamp = (value: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    } catch {
      return value
    }
  }

  const handleExport = useCallback(() => {
    if (filteredResults.length === 0) return
    const headers = ['partNumber', 'source', 'title', 'url', 'price', 'stockStatus', 'confidence', 'origin', 'cachedAt']
    const exportName = partNumber.trim() ? partNumber.trim() : 'parts'
    const rows = filteredResults.map((item) => [
      partNumber.trim() || '',
      item.source,
      item.title,
      item.url,
      item.price ?? '',
      item.inStock === undefined ? '' : item.inStock ? 'in_stock' : 'out_of_stock',
      item.confidence.toFixed(3),
      resultOrigin ?? 'live',
      cachedAt ?? '',
    ])

    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escape(String(cell ?? ''))).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `partsking-${exportName}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [filteredResults, partNumber, resultOrigin, cachedAt])

  const refreshPart = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      if (!apiBackendAvailable) {
        setError('Refresh queue is only available when the API backend is running.')
        return
      }
      const normalizedKey = trimmed.toLowerCase()
      setError(null)
      setRefreshingPart(normalizedKey)
      try {
        const response = await fetch(buildApiUrl(`/api/cache/${encodeURIComponent(trimmed)}/refresh`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        let payload: RefreshResponse | { error?: string } | Record<string, never> = {}
        try {
          payload = (await response.json()) as RefreshResponse | { error?: string }
        } catch {
          payload = {}
        }

        if (!response.ok) {
          const possibleError =
            typeof payload === 'object' && payload && 'error' in payload ? (payload as { error?: string }).error : null
          throw new Error(possibleError || 'Unable to refresh cache entry right now.')
        }

        const data = payload as RefreshResponse
        const activePart = partNumber.trim().toLowerCase()
        if (activePart && activePart === normalizedKey) {
          setResults(data.results ?? [])
          setResultOrigin(data.source ?? 'live')
          setCachedAt(data.cachedAt ?? null)
        }

        await reloadCacheList()
      } catch (err) {
        const friendly = err instanceof Error ? err.message : 'Unable to refresh cache entry right now.'
        setError(friendly)
      } finally {
        setRefreshingPart(null)
      }
    },
    [partNumber, reloadCacheList],
  )

  const refreshStaleParts = useCallback(async () => {
    if (!apiBackendAvailable) {
      setError('Cannot bulk refresh without the API backend running.')
      return
    }
    const staleTargets = cachedParts.filter((entry) => entry.isStale).slice(0, MAX_BULK_REFRESH)
    if (!staleTargets.length) return
    setBulkRefreshing(true)
    try {
      for (const entry of staleTargets) {
        await refreshPart(entry.partNumber)
      }
    } finally {
      setBulkRefreshing(false)
    }
  }, [cachedParts, refreshPart])

  return (
    <div className="page">
      <header className="nav glass">
        <div className="brand">
          <div className="badge">PK</div>
          <div>
            <strong>PartsKing</strong>
            <p>Multi-source parts hunting</p>
          </div>
        </div>
        <div className="nav-links">
          <a href="#overview">Overview</a>
          <a href="#results">Catalog</a>
          <a href="#workflow">Workflow</a>
        </div>
        <span className="pill">Scrapling + Supabase cache</span>
      </header>

      <main className="container">
        <section className="hero glass" id="overview">
          <div className="hero-main">
            <p className="eyebrow">Supplier search • Cache-first responses • Export-friendly</p>
            <h1>Turn a single part number into cross-marketplace intel.</h1>
            <p className="lede">
              PartsKing pulls Amazon, eBay, Digi-Key, Mouser, and the supplier domains you asked for via a Scrapling crawler, then snapshots the matches in Supabase so you never repeat the same lookup twice.
            </p>
            <div className="hero-stats">
              <div className="stat">
                <strong>11 sources</strong>
                <span>Jack&apos;s, Pro Auto Parts Direct, Exmark, BMI, Safford, and more.</span>
              </div>
              <div className="stat">
                <strong>Cache w/ TTL</strong>
                <span>Backed by Supabase Postgres + API TTL so sourced SKUs respond instantly.</span>
              </div>
              <div className="stat">
                <strong>Confidence filter</strong>
                <span>Normalized Levenshtein score keeps mismatched listings out.</span>
              </div>
            </div>
          </div>

          <div className="hero-panel glass">
            <div className="panel-head">
              <div>
                <span className="pill">Search the catalog</span>
                <h2>Query suppliers</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setPartNumber('LM358N')}>
                Load sample SKU
              </button>
            </div>
            <form className="search-panel" onSubmit={handleSubmit}>
              <label>
                Part number
                <input
                  type="text"
                  placeholder="e.g. LM358N"
                  value={partNumber}
                  onChange={(event) => setPartNumber(event.target.value)}
                />
              </label>

              <div className="confidence-row">
                <span>Minimum confidence</span>
                <div className="chip-group">
                  {confidenceBands.map((band) => (
                    <button
                      key={band.value}
                      type="button"
                      className={band.value === minConfidence ? 'chip active' : 'chip'}
                      onClick={() => setMinConfidence(band.value)}
                    >
                      {band.label}
                    </button>
                  ))}
                </div>
              </div>

              {cachedParts.length > 0 && (
                <div className="cached-hint">
                  <span>Cached SKUs</span>
                  <div className="chip-group">
                    {cachedParts.slice(0, 6).map((cachedPart) => (
                      <button
                        key={cachedPart.partNumber}
                        type="button"
                        className="chip chip-stack"
                        title={cachedPart.cachedAt ? `Cached ${formatTimestamp(cachedPart.cachedAt)}` : undefined}
                        onClick={() => handleCachedSelect(cachedPart)}
                      >
                        <span className="chip-label">{cachedPart.partNumber}</span>
                        <span className={`chip-meta ${cachedPart.isStale ? 'warn' : 'ok'}`}>
                          {cachedPart.cachedAt
                            ? `${cachedPart.isStale ? 'Stale' : 'Fresh'} • ${describeCacheAge(cachedPart.cachedAt)}`
                            : 'Needs refresh'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {preferSupabaseReads && (
                <p className="muted warning">
                  Read-only cache mode: live refresh endpoints are disabled on this static build.
                </p>
              )}

              <button type="submit" disabled={isLoading} className="btn btn-primary">
                {isLoading ? 'Searching…' : 'Search suppliers'}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
        </section>

        <section className="section glass" id="results">
          <div className="section-head">
            <div>
              <span className="pill">Supplier catalog</span>
              <h2>Live matches</h2>
              {resultOrigin === 'cache' && <p className="muted">Served from cache {cachedAt && `(${formatTimestamp(cachedAt)})`}</p>}
              {resultOrigin === 'live' && cachedAt && <p className="muted">Fresh lookup {formatTimestamp(cachedAt)}</p>}
            </div>
            <div className="section-actions">
              <div className="result-count">
                <strong>{filteredResults.length}</strong>
                <span>results ≥ {minConfidence.toFixed(1)}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleExport}
                disabled={filteredResults.length === 0}
              >
                Export CSV
              </button>
            </div>
          </div>

          {filteredResults.length === 0 && !isLoading ? (
            <div className="empty-state">
              <p>Run a lookup to populate this panel. Cached requests will appear instantly.</p>
            </div>
          ) : (
            <div className="result-grid">
              {filteredResults.map((result) => (
                <article key={result.id} className="result-card">
                  <header>
                    <p className="source">{result.source}</p>
                    <span className="confidence">{Math.round(result.confidence * 100)}% match</span>
                  </header>
                  <a href={result.url} target="_blank" rel="noreferrer">
                    <h3>{result.title}</h3>
                  </a>
                  {result.description && <p className="muted">{result.description}</p>}
                  <div className="result-details">
                    {result.price && <span className="price">{result.price}</span>}
                    {result.inStock !== undefined && (
                      <span className={result.inStock ? 'stock in' : 'stock out'}>
                        {result.inStock ? 'In stock' : 'Out of stock'}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="section glass" id="cache-monitor">
          <div className="section-head">
            <div>
              <span className="pill">Cache monitor</span>
              <h2>Cache health</h2>
              <p className="muted">
                Entries older than {ttlDisplay}h flip to stale. {staleCount === 0 ? 'Everything is fresh right now.' : `${staleCount} entr${staleCount === 1 ? 'y' : 'ies'} need attention.`}
              </p>
            </div>
            <div className="section-actions">
              <button type="button" className="btn btn-tertiary" onClick={reloadCacheList}>
                Reload list
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={refreshStaleParts}
                disabled={!apiBackendAvailable || staleCount === 0 || bulkRefreshing}
                title={apiBackendAvailable ? undefined : 'API backend must be running to queue refresh jobs.'}
              >
                {bulkRefreshing ? 'Refreshing…' : staleCount === 0 ? 'All fresh' : `Refresh stale (${actionableStale})`}
              </button>
            </div>
          </div>

          {cachedParts.length === 0 ? (
            <div className="empty-state">
              <p>Run a lookup to seed the cache, then monitor health here.</p>
            </div>
          ) : (
            <ul className="cache-list">
              {cachedParts.map((entry) => (
                <li key={entry.partNumber} className={`cache-item ${entry.isStale ? 'stale' : 'fresh'}`}>
                  <div>
                    <p className="cache-sku">{entry.partNumber}</p>
                    <p className="cache-age">
                      {entry.cachedAt ? `Cached ${describeCacheAge(entry.cachedAt)}` : 'No snapshot yet'}
                    </p>
                  </div>
                  <div className="cache-actions">
                    <span className={`status-badge ${entry.isStale ? 'warn' : 'ok'}`}>
                      {entry.cachedAt ? (entry.isStale ? 'Stale' : 'Fresh') : 'Pending'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-link"
                      onClick={() => refreshPart(entry.partNumber)}
                      disabled={!apiBackendAvailable || refreshingPart === entry.partNumber.toLowerCase() || bulkRefreshing}
                      title={apiBackendAvailable ? undefined : 'API backend must be running to refresh cache entries.'}
                    >
                      {refreshingPart === entry.partNumber.toLowerCase() ? 'Refreshing…' : 'Refresh now'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </main>

      <footer className="footer glass">
        <div>
          <strong>PartsKing</strong>
          <p className="muted">Multi-marketplace parts intelligence</p>
        </div>
        <p className="muted">Powered by the Scrapling crawler + Supabase caching. Configure Python + env in .env.local.</p>
      </footer>
    </div>
  )
}

export default App
