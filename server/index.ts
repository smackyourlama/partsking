import './loadEnv.js'
import express from 'express'
import type { Request, Response } from 'express'
import cors, { type CorsOptions } from 'cors'
import { z } from 'zod'
import { listCachedParts, readCachedResults, writeCachedResults } from './cacheStore.js'
import { runScraper } from './searchService.js'

const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000
const CACHE_TTL_HOURS = Number(process.env.PARTSKING_CACHE_TTL_HOURS || 24)
const allowedOrigins = (process.env.PARTSKING_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
const corsOptions: CorsOptions = allowedOrigins.length ? { origin: allowedOrigins } : { origin: true }

app.use(cors(corsOptions))
app.use(express.json())

const querySchema = z.object({
  partNumber: z.string().trim().min(3, 'Please enter at least 3 characters.'),
  minConfidence: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 0))
    .pipe(z.number().min(0).max(1)),
})

app.get('/api/parts', async (req: Request, res: Response) => {
  const parseResult = querySchema.safeParse(req.query)
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid query params.' })
  }

  const { partNumber, minConfidence } = parseResult.data

  try {
    const cached = await readCachedResults(partNumber, CACHE_TTL_HOURS)
    if (!cached) {
      return res.status(404).json({
        error: 'No cached data for that part number yet. Use the refresh endpoint or cache seeding workflow first.',
        partNumber,
        source: 'cache',
      })
    }

    const filteredCache = cached.results.filter((item) => item.confidence >= minConfidence)
    return res.json({
      partNumber,
      results: filteredCache,
      source: 'cache',
      cachedAt: cached.scrapedAt,
      isStale: cached.isStale,
    })
  } catch (error) {
    console.error('[part-search] error', error)
    res.status(500).json({ error: 'Unable to fetch part data right now.' })
  }
})

app.get('/api/cache', async (req: Request, res: Response) => {
  try {
    const rawLimit = req.query.limit
    const limitParam = Array.isArray(rawLimit) ? rawLimit[0] : typeof rawLimit === 'string' ? rawLimit : undefined
    const limitValue = limitParam ? Number(limitParam) : undefined
    const normalizedLimit =
      typeof limitValue === 'number' && Number.isFinite(limitValue) && limitValue > 0 ? limitValue : undefined

    const parts = await listCachedParts()
    const maxFreshMinutes = CACHE_TTL_HOURS * 60
    const withMeta = parts.map((entry) => {
      const timestamp = entry.cachedAt ? Date.parse(entry.cachedAt) : Number.NaN
      const ageMinutes = Number.isFinite(timestamp)
        ? Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
        : null
      const isStale = ageMinutes === null ? true : ageMinutes > maxFreshMinutes
      return {
        partNumber: entry.partNumber,
        cachedAt: entry.cachedAt,
        ageMinutes,
        isStale,
        status: isStale ? 'stale' : 'fresh',
      }
    })

    const payload = typeof normalizedLimit === 'number' ? withMeta.slice(0, normalizedLimit) : withMeta
    res.json({ parts: payload, ttlHours: CACHE_TTL_HOURS })
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
    res.json({ results: cached.results, cachedAt: cached.scrapedAt, isStale: cached.isStale })
  } catch (error) {
    console.error('[cache:fetch] error', error)
    res.status(500).json({ error: 'Unable to read cache entry right now.' })
  }
})

app.post('/api/cache/:partNumber/refresh', async (req: Request, res: Response) => {
  try {
    const partParam = req.params.partNumber
    const normalizedPart = Array.isArray(partParam) ? partParam[0] : partParam
    const trimmedPart = normalizedPart?.trim()
    if (!trimmedPart) {
      return res.status(400).json({ error: 'Missing part number in path.' })
    }

    const freshResults = await runScraper(trimmedPart)
    await writeCachedResults(trimmedPart, freshResults)
    const refreshed = await readCachedResults(trimmedPart, CACHE_TTL_HOURS)

    res.json({
      partNumber: trimmedPart,
      results: refreshed?.results ?? freshResults,
      cachedAt: refreshed?.scrapedAt ?? new Date().toISOString(),
      source: 'live',
      isStale: false,
    })
  } catch (error) {
    console.error('[cache:refresh] error', error)
    res.status(500).json({ error: 'Unable to refresh cache entry right now.' })
  }
})

app.get('/health', (_: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`PartsKing API listening on http://localhost:${PORT}`)
})
