import '../server/loadEnv.js'
import { writeCachedResults } from '../server/cacheStore.js'
import { runScraper } from '../server/searchService.js'

async function main() {
  const [, , partNumber] = process.argv
  if (!partNumber) {
    console.error('Usage: pnpm scrape:part <part-number>')
    process.exit(1)
  }

  const trimmed = partNumber.trim()
  if (!trimmed) {
    console.error('Part number cannot be empty')
    process.exit(1)
  }

  console.log(`→ Scraping ${trimmed}`)
  const results = await runScraper(trimmed)
  await writeCachedResults(trimmed, results)
  console.log(`✓ Stored ${results.length} listing(s) for ${trimmed}`)
}

main().catch((error) => {
  console.error('Failed to scrape part', error)
  process.exit(1)
})
