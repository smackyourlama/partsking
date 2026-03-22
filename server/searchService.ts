import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type SearchResult = {
  id: string
  source: string
  title: string
  url: string
  price?: string
  description?: string
  inStock?: boolean
  confidence: number
}

const PYTHON_BIN = process.env.PARTSKING_PYTHON_BIN || 'python3'
const SCRAPER_MODULE = process.env.PARTSKING_SCRAPER_MODULE || 'scraper.runner'
const SCRAPER_LIMIT = process.env.PARTSKING_SCRAPER_LIMIT

type RawScrapedListing = {
  part_number: string
  source: string
  title: string
  url: string
  price?: string | null
  description?: string | null
  in_stock?: boolean | null
  confidence: number
}

function mapListings(partNumber: string, rows: RawScrapedListing[]): SearchResult[] {
  return rows.map((row, index) => {
    const resolvedPartNumber = row.part_number || partNumber
    const identifier = resolvedPartNumber
      ? `${resolvedPartNumber}-${row.source}-${index}-${Date.now()}`
      : randomUUID()

    return {
      id: identifier,
      source: row.source,
      title: row.title,
      url: row.url,
      price: row.price ?? undefined,
      description: row.description ?? undefined,
      inStock: row.in_stock ?? undefined,
      confidence: row.confidence,
    }
  })
}

export async function runScraper(partNumber: string): Promise<SearchResult[]> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'partsking-'))
  const jsonPath = path.join(tmpDir, `scrape-${randomUUID()}.json`)
  await writeFile(jsonPath, '[]', 'utf8')

  const args = ['-m', SCRAPER_MODULE, '--part', partNumber, '--json-out', jsonPath]
  if (SCRAPER_LIMIT) {
    args.push('--limit', SCRAPER_LIMIT)
  }

  return new Promise<SearchResult[]>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    child.on('error', async (error) => {
      await rm(tmpDir, { recursive: true, force: true })
      reject(error)
    })

    child.on('exit', async (code) => {
      try {
        if (code !== 0) {
          throw new Error(`Scraper exited with code ${code}`)
        }
        const raw = await readFile(jsonPath, 'utf8')
        const payload = JSON.parse(raw) as RawScrapedListing[]
        const mapped = mapListings(partNumber, payload)
        await rm(tmpDir, { recursive: true, force: true })
        resolve(mapped)
      } catch (error) {
        await rm(tmpDir, { recursive: true, force: true })
        reject(error)
      }
    })
  })
}
