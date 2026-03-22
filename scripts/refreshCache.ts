import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { listCachedParts, readCachedResults, writeCachedResults } from '../server/cacheStore.js'
import { runScraper } from '../server/searchService.js'

const DEFAULT_INPUT = 'data/seed_parts.json'
const DEFAULT_TTL = Number(process.env.PARTSKING_REFRESH_TTL || 6)
const DEFAULT_LIMIT = process.env.PARTSKING_REFRESH_LIMIT
  ? Number(process.env.PARTSKING_REFRESH_LIMIT)
  : undefined

function parseArgs(argv: string[]) {
  const options: {
    input?: string
    ttl?: number
    limit?: number
    dryRun?: boolean
  } = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--input' || arg === '-i') {
      options.input = argv[i + 1]
      i += 1
    } else if (arg === '--ttl' || arg === '-t') {
      options.ttl = Number(argv[i + 1])
      i += 1
    } else if (arg === '--limit' || arg === '-l') {
      options.limit = Number(argv[i + 1])
      i += 1
    } else if (arg === '--dry-run') {
      options.dryRun = true
    }
  }

  return options
}

const cliOptions = parseArgs(process.argv.slice(2))
const ttlHours = cliOptions.ttl && !Number.isNaN(cliOptions.ttl) ? cliOptions.ttl : DEFAULT_TTL
const limit = cliOptions.limit && !Number.isNaN(cliOptions.limit) ? cliOptions.limit : DEFAULT_LIMIT
const inputPath = cliOptions.input || process.env.PARTSKING_REFRESH_LIST || DEFAULT_INPUT
const dryRun = Boolean(cliOptions.dryRun)

async function loadPartList(filePath: string) {
  const absolute = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolute)) {
    return null
  }
  const raw = fs.readFileSync(absolute, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`Seed file at ${filePath} must be a JSON array`)
  }
  return parsed.map((item) => String(item).trim()).filter(Boolean)
}

async function resolveParts(): Promise<string[]> {
  const seeds = await loadPartList(inputPath)
  if (seeds && seeds.length > 0) {
    return Array.from(new Set(seeds))
  }

  const cached = await listCachedParts()
  if (cached.length === 0) {
    return []
  }
  return cached.map((entry) => entry.partNumber)
}

async function refresh() {
  console.log('--- PartsKing cache refresh ---')
  console.log(`TTL window: ${ttlHours}h`)
  if (limit) {
    console.log(`Limit: ${limit} parts`)
  }
  const parts = await resolveParts()
  if (parts.length === 0) {
    console.log('No part numbers found in seeds or cache - nothing to refresh.')
    return
  }

  const queue = limit ? parts.slice(0, limit) : parts
  const toRefresh: string[] = []

  for (const part of queue) {
    const cached = await readCachedResults(part, ttlHours)
    if (!cached) {
      toRefresh.push(part)
    } else {
      console.log(`✓ ${part} is fresh (cached ${cached.scrapedAt})`)
    }
  }

  if (toRefresh.length === 0) {
    console.log('All tracked parts are within the freshness window - nothing to do.')
    return
  }

  console.log(`Refreshing ${toRefresh.length} part(s)...`)
  for (const part of toRefresh) {
    console.log(`→ running scraper for ${part}`)
    if (dryRun) {
      console.log('  (dry run) skip execution')
      continue
    }
    try {
      const results = await runScraper(part)
      await writeCachedResults(part, results)
      console.log(`  ✓ refreshed ${part} (${results.length} listings)`)
    } catch (error) {
      console.error(`  ! failed to refresh ${part}`, error)
    }
  }

  console.log('Cache refresh complete.')
}

refresh().catch((error) => {
  console.error('Cache refresh failed', error)
  process.exit(1)
})
