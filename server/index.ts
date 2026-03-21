import 'dotenv/config'
import express from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { listCachedParts, readCachedResults, writeCachedResults } from './cacheStore.js'
import { runMarketplaceSearches } from './searchService.js'

const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000
const hasSerpApiKey = Boolean(process.env.SERPAPI_KEY)
const CACHE_TTL_HOURS = Number(process.env.PARTSKING_CACHE_TTL_HOURS || 24)

const querySchema = z.object({
  partNumber: z.string().trim().min(3, 'Please enter at least 3 characters.'),
  minConfidence: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 0))
    .pipe(z.number().min(0).max(1)),
})

if (!hasSerpApiKey) {
  console.warn('[server] SERPAPI_KEY is not set. Live marketplace queries will be unavailable until configured.')
}

app.get('/api/parts', async (req: Request, res: Response) => {
  const parseResult = querySchema.safeParse(req.query)
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid query params.' })
  }

  const { partNumber, minConfidence } = parseResult.data

  try {
    const cached = await readCachedResults(partNumber, CACHE_TTL_HOURS)
    if (cached) {
      const filteredCache = cached.results.filter((item) => item.confidence >= minConfidence)
      return res.json({
        partNumber,
        results: filteredCache,
        source: 'cache',
        cachedAt: cached.scrapedAt,
      })
    }

    if (!hasSerpApiKey) {
      return res.status(503).json({ error: 'No fresh data available (SERPAPI_KEY missing).' })
    }

    const liveResults = await runMarketplaceSearches(partNumber)
    await writeCachedResults(partNumber, liveResults)
    const filtered = liveResults.filter((item) => item.confidence >= minConfidence)
    res.json({ partNumber, results: filtered, source: 'live', cachedAt: new Date().toISOString() })
  } catch (error) {
    console.error('[part-search] error', error)
    res.status(500).json({ error: 'Unable to fetch part data right now.' })
  }
})

app.get('/api/cache', async (_: Request, res: Response) => {
  try {
    const parts = await listCachedParts()
    res.json({ parts })
  } catch (error) {
    console.error('[cache:list] error', error)
    res.status(500).json({ error: 'Unable to list cache entries right now.' })
  }
})

app.get('/api/cache/:partNumber', async (req: Request, res: Response) => {
  try {
    const rawTtl = req.query.ttlHours
    const ttlParam = Array.isArray(rawTtl) ? rawTtl[0] : typeof rawTtl === 'string' ? rawTtl : undefined
    const ttlHours = ttlParam ? Number(ttlParam) : CACHE_TTL_HOURS
    const partParam = req.params.partNumber
    const normalizedPart = Array.isArray(partParam) ? partParam[0] : partParam
    if (!normalizedPart) {
      return res.status(400).json({ error: 'Missing part number in path.' })
    }
    const cached = await readCachedResults(normalizedPart, ttlHours)
    if (!cached) {
      return res.status(404).json({ error: 'No cached data for that part number yet.' })
    }
    res.json({ results: cached.results, cachedAt: cached.scrapedAt })
  } catch (error) {
    console.error('[cache:fetch] error', error)
    res.status(500).json({ error: 'Unable to read cache entry right now.' })
  }
})

app.get('/health', (_: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`PartsKing API listening on http://localhost:${PORT}`)
})
