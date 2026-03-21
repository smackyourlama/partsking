import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { SearchResult } from './types'
import './App.css'

const confidenceBands = [
  { label: 'Lenient (0.4+)', value: 0.4 },
  { label: 'Balanced (0.6+)', value: 0.6 },
  { label: 'Strict (0.8+)', value: 0.8 },
]

type ResultOrigin = 'live' | 'cache' | null

function App() {
  const [partNumber, setPartNumber] = useState('')
  const [minConfidence, setMinConfidence] = useState(0.6)
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin>(null)
  const [cachedParts, setCachedParts] = useState<string[]>([])

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

      const params = new URLSearchParams({
        partNumber: trimmedPart,
        minConfidence: minConfidence.toString(),
      })
      const response = await fetch(`/api/parts?${params.toString()}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Search failed. Try again later.')
      }
      const data = (await response.json()) as { results: SearchResult[]; source?: ResultOrigin }
      setResults(data.results)
      setResultOrigin(data.source ?? 'live')
    } catch (err) {
      const friendly = err instanceof Error ? err.message : 'Unexpected error occurred.'
      const cachedResults = await loadCachedResults(trimmedPart)

      if (cachedResults) {
        setResults(cachedResults)
        setResultOrigin('cache')
        setError(`${friendly} Showing cached snapshot instead.`)
      } else {
        setError(friendly)
        setResultOrigin(null)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const loadCachedResults = async (value: string): Promise<SearchResult[] | null> => {
    try {
      const response = await fetch(`/api/cache/${encodeURIComponent(value)}`)
      if (!response.ok) return null
      const data = (await response.json()) as { results: SearchResult[] }
      return data.results
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

    const cachedResults = await loadCachedResults(value)
    if (cachedResults) {
      setResults(cachedResults)
      setResultOrigin('cache')
    } else {
      setResults([])
      setError('No cached snapshot for that part yet. Run a live search to populate it.')
    }

    setIsLoading(false)
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Partaking</p>
          <h1>Cross-marketplace part intelligence</h1>
          <p className="lede">
            Enter any OEM or supplier part number and we&apos;ll query Amazon, eBay, Digi-Key, and Mouser via
            SerpAPI. Matches are scored with a lightweight fuzzy AI check so you only act on confident hits.
          </p>
        </div>
      </header>

      <main>
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
              <span>Cached parts ready for offline lookup:</span>
              <div className="chip-group">
                {cachedParts.map((cachedPart) => (
                  <button
                    key={cachedPart}
                    type="button"
                    className="chip"
                    onClick={() => handleCachedSelect(cachedPart)}
                  >
                    {cachedPart}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Searching…' : 'Search marketplaces'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>

        <section className="results">
          <div className="results-header">
            <h2>
              Matches
              {resultOrigin === 'cache' && <span className="result-origin"> (cached)</span>}
            </h2>
            <p>
              {filteredResults.length} results ≥ {minConfidence.toFixed(1)} confidence
            </p>
          </div>

          {filteredResults.length === 0 && !isLoading ? (
            <div className="empty-state">
              <p>No matches yet. Run a search or loosen the confidence threshold.</p>
            </div>
          ) : (
            <ul>
              {filteredResults.map((result) => (
                <li key={result.id} className="result-card">
                  <div className="result-meta">
                    <span className="source-pill">{result.source}</span>
                    <span className="confidence">{Math.round(result.confidence * 100)}% match</span>
                  </div>
                  <a href={result.url} target="_blank" rel="noreferrer">
                    <h3>{result.title}</h3>
                  </a>
                  {result.description && <p className="result-description">{result.description}</p>}
                  <div className="result-details">
                    {result.price && <span className="price">{result.price}</span>}
                    {result.inStock !== undefined && (
                      <span className={result.inStock ? 'stock in' : 'stock out'}>
                        {result.inStock ? 'In stock' : 'Out of stock'}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer>
        <p>
          Tip: add your SerpAPI key to <code>.env.local</code>, run <code>pnpm dev:full</code>, and keep this repo private if
          you don&apos;t want to expose the key in the browser.
        </p>
      </footer>
    </div>
  )
}

export default App
