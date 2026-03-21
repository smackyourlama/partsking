import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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

const pythonBin = process.env.PARTSKING_PYTHON_BIN || 'python3'
const scraperModule = process.env.PARTSKING_SCRAPER_MODULE || 'scraper.runner'
const limit = process.env.PARTSKING_SCRAPER_LIMIT

parts.forEach((part) => {
  const trimmed = String(part).trim()
  if (!trimmed) return
  const args = ['-m', scraperModule, '--part', trimmed, '--write']
  if (limit) args.push('--limit', limit)
  console.log(`→ warming cache for ${trimmed}`)
  const result = spawnSync(pythonBin, args, { stdio: 'inherit', cwd: process.cwd() })
  if (result.status !== 0) {
    console.error(`  ! scraper failed for ${trimmed}`)
  }
})

console.log('Seed warm-up complete.')
