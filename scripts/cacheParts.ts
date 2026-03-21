import { runMarketplaceSearches } from '../server/searchService'
import { writeCachedResults } from '../server/cacheStore'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const seedPath = path.resolve(process.cwd(), 'data/seed_parts.json')
  const raw = await readFile(seedPath, 'utf-8').catch((error) => {
    throw new Error(`Unable to read seed file at ${seedPath}: ${error.message}`)
  })

  const partNumbers: string[] = JSON.parse(raw)
  if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
    throw new Error('Seed file must be a non-empty JSON array of part numbers.')
  }

  const summary: { partNumber: string; count: number }[] = []

  for (const partNumber of partNumbers) {
    const trimmed = partNumber.trim()
    if (!trimmed) continue

    console.log(`→ Fetching listings for ${trimmed}...`)
    const results = await runMarketplaceSearches(trimmed)
    summary.push({ partNumber: trimmed, count: results.length })
    await writeCachedResults(trimmed, results)
    console.log(`   Saved ${results.length} rows to the local database.`)
  }

  console.log('\nScrape complete:')
  summary.forEach((entry) => {
    console.log(` - ${entry.partNumber}: ${entry.count} cached results`)
  })
}

main().catch((error) => {
  console.error('[cacheParts] failed:', error)
  process.exit(1)
})
