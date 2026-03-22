import fs from 'node:fs'
import path from 'node:path'
import { writeCachedResults } from '../server/cacheStore.js'
import { runScraper } from '../server/searchService.js'

const seedsPath = path.resolve(process.cwd(), 'data/seed_parts.json')
if (!fs.existsSync(seedsPath)) {
  console.error('Seed file not found at data/seed_parts.json')
  process.exit(1)
}

const raw = fs.readFileSync(seedsPath, 'utf8')
const parts = JSON.parse(raw) as string[]
if (!Array.isArray(parts) || parts.length === 0) {
  console.error('Seed file must be a non-empty JSON array')
  process.exit(1)
}

async function cachePart(partNumber: string) {
  const trimmed = partNumber.trim()
  if (!trimmed) return
  console.log(`→ warming cache for ${trimmed}`)
  try {
    const results = await runScraper(trimmed)
    await writeCachedResults(trimmed, results)
    console.log(`  ✓ stored ${results.length} listings`)
  } catch (error) {
    console.error(`  ! scraper failed for ${trimmed}:`, error)
  }
}

async function main() {
  for (const part of parts) {
    await cachePart(String(part))
  }
  console.log('Seed warm-up complete.')
}

void main()
