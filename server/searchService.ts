import { spawn } from 'node:child_process'

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

export async function runScraper(partNumber: string) {
  const args = ['-m', SCRAPER_MODULE, '--part', partNumber, '--write']
  if (SCRAPER_LIMIT) {
    args.push('--limit', SCRAPER_LIMIT)
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    child.on('error', (error) => reject(error))
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Scraper exited with code ${code}`))
      }
    })
  })
}
