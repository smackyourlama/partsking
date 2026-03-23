import { listPartNumbers, readListings, writeListings } from './db.js'
import type { CachedListingResponse, CachedPartSummary } from './db.js'
import type { SearchResult } from './searchService.js'

export async function readCachedResults(partNumber: string, maxAgeHours = 24): Promise<CachedListingResponse | null> {
  return readListings(partNumber, maxAgeHours)
}

export async function writeCachedResults(partNumber: string, results: SearchResult[]) {
  await writeListings(partNumber, results)
}

export async function listCachedParts(): Promise<CachedPartSummary[]> {
  return listPartNumbers()
}
