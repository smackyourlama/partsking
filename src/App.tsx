import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SearchResult } from './types'
import './App.css'

const confidenceBands = [
  { label: 'Lenient (0.4+)', value: 0.4 },
  { label: 'Balanced (0.6+)', value: 0.6 },
  { label: 'Strict (0.8+)', value: 0.8 },
]

type ResultOrigin = 'live' | 'cache' | null

type ApiResponse = {
  results: SearchResult[]
  source?: ResultOrigin
  cachedAt?: string
}

type CachedResult = {
  results: SearchResult[]
  cachedAt?: string
}

function App() {
  const [partNumber, setPartNumber] = useState('')
  const [minConfidence, setMinConfidence] = useState(0.6)
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin>(null)
  const [cachedParts, setCachedParts] = useState<string[]>([])
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const loadCacheList = async () => {
      try {
        const response = await fetch('/api/cache')
        if (!response.ok) return
        const data = (await response.json()) as { parts: string[] }
        if (isMounted) {
          setCachedParts(data.parts)
        }
      } catch (error) {
        console.warn('[cache-list] unable to load cached parts', error)
      }
    }

    loadCacheList()
    return () => {
      isMounted = false
    }
  }, [])

  const filteredResults = useMemo(
    () => results.filter((item) => item.confidence >= minConfidence),
    [results, minConfidence],
  )

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

      const params = new URLSearchParams({
        partNumber: trimmedPart,
        minConfidence: minConfidence.toString(),
      })
      const response = await fetch(`/api/parts?${params.toString()}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Search failed. Try again later.')
      }
      const data = (await response.json()) as ApiResponse
      setResults(data.results)
      setResultOrigin(data.source ?? 'live')
      setCachedAt(data.cachedAt ?? null)
    } catch (err) {
      const friendly = err instanceof Error ? err.message : 'Unexpected error occurred.'
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

  const loadCachedResults = async (value: string): Promise<CachedResult | null> => {
    try {
      const response = await fetch(`/api/cache/${encodeURIComponent(value)}`)
      if (!response.ok) return null
      const data = (await response.json()) as CachedResult
      return data
    } catch (error) {
      console.warn('[cache-fallback] unable to load cached results', error)
      return null
    }
  }

  const handleCachedSelect = async (value: string) => {
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
        <span className="pill">Scrapling + local cache</span>
      </header>

      <main className="container">
        <section className="hero glass" id="overview">
          <div className="hero-main">
            <p className="eyebrow">Supplier search • Cache-first responses • Export-friendly</p>
            <h1>Turn a single part number into cross-marketplace intel.</h1>
            <p className="lede">
              PartsKing pulls Amazon, eBay, Digi-Key, Mouser, and the supplier domains you asked for via a Scrapling crawler, then stores the matches locally so you never repeat the same lookup twice.
            </p>
            <div className="hero-stats">
              <div className="stat">
                <strong>11 sources</strong>
                <span>Jack&apos;s, Pro Auto Parts Direct, Exmark, BMI, Safford, and more.</span>
              </div>
              <div className="stat">
                <strong>Cache w/ TTL</strong>
                <span>Uses SQLite + API TTL so previously sourced SKUs respond instantly.</span>
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
                      <button key={cachedPart} type="button" className="chip" onClick={() => handleCachedSelect(cachedPart)}>
                        {cachedPart}
                      </button>
                    ))}
                  </div>
                </div>
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
            <div className="result-count">
              <strong>{filteredResults.length}</strong>
              <span>results ≥ {minConfidence.toFixed(1)}</span>
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

        <section className="section glass" id="workflow">
          <h2>How the PartsKing workflow runs</h2>
          <p className="lead">
            Built with the same design language as the Hack&Haul project—hero layout, glass panels, gradients—so it
            feels like a polished 21st-inspired property tech site instead of a raw admin page.
          </p>
          <div className="grid-3">
            <div className="card">
              <div className="feature-icon">01</div>
              <h3>Search + cache</h3>
              <p className="muted">The Scrapling runner fetches the dealers you listed, then results are cached in SQLite.</p>
            </div>
            <div className="card">
              <div className="feature-icon">02</div>
              <h3>Confidence gate</h3>
              <p className="muted">Use the chip selector to require 40/60/80% normalized similarity.</p>
            </div>
            <div className="card">
              <div className="feature-icon">03</div>
              <h3>Export-ready</h3>
              <p className="muted">Each card links to the supplier listing so you can verify and drop it into your pipeline.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer glass">
        <div>
          <strong>PartsKing</strong>
          <p className="muted">Multi-marketplace parts intelligence</p>
        </div>
        <p className="muted">Powered by the Scrapling crawler + local caching. Configure Python + env in .env.local.</p>
      </footer>
    </div>
  )
}

export default App
