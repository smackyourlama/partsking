const SERPAPI_KEY = process.env.SERPAPI_KEY || ''

if (!SERPAPI_KEY) {
  console.warn('[searchService] SERPAPI_KEY is not set. Marketplace queries will fail until it is configured.')
}

const MAX_RESULTS_PER_SOURCE = 5

const SITE_SCOPED_SOURCES = [
  { domain: 'jackssmallengines.com', label: "Jack's Small Engines" },
  { domain: 'proautopartsdirect.com', label: 'Pro Auto Parts Direct' },
  { domain: 'shop.exmark.com', label: 'Exmark Shop' },
  { domain: 'menindsup.com', label: 'Menominee Industrial Supply' },
  { domain: 'porchtree.com', label: 'PorchTree' },
  { domain: 'bmikarts.com', label: 'BMI Karts' },
  { domain: 'saffordequipment.com', label: 'Safford Equipment' },
  { domain: 'chicagoengines.com', label: 'Chicago Engines' },
  { domain: 'mowpart.com', label: 'MowPart' },
  { domain: 'repairclinic.com', label: 'RepairClinic' },
  { domain: 'stems.com', label: 'Stems' },
]


export type RawResult = {
  title?: string
  name?: string
  link?: string
  url?: string
  price?: string
  price_symbol?: string
  price_upper?: string
  delivery?: string
  availability?: string
  body?: string
  description?: string
  snippet?: string
}

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

export async function runMarketplaceSearches(partNumber: string) {
  const siteSearches = SITE_SCOPED_SOURCES.map((config) =>
    searchGoogleSite(partNumber, config.domain, config.label),
  )

  const settled = await Promise.allSettled([
    searchAmazon(partNumber),
    searchEbay(partNumber),
    searchGoogleSite(partNumber, 'digikey.com', 'Digi-Key'),
    searchGoogleSite(partNumber, 'mouser.com', 'Mouser'),
    ...siteSearches,
  ])

  return settled
    .flatMap((entry) => (entry.status === 'fulfilled' ? entry.value : []))
    .sort((a, b) => b.confidence - a.confidence)
}

async function searchAmazon(partNumber: string): Promise<SearchResult[]> {
  const endpoint = new URL('https://serpapi.com/search.json')
  endpoint.searchParams.set('api_key', SERPAPI_KEY)
  endpoint.searchParams.set('engine', 'amazon')
  endpoint.searchParams.set('amazon_domain', 'amazon.com')
  endpoint.searchParams.set('type', 'search')
  endpoint.searchParams.set('keyword', partNumber)

  const response = await fetch(endpoint.toString())
  const json: any = await response.json()
  const items: RawResult[] = json.search_results ?? json.organic_results ?? []

  return items.slice(0, MAX_RESULTS_PER_SOURCE).map((item, index) => ({
    id: `amazon-${index}`,
    source: 'Amazon',
    title: item.title || item.name || 'Unknown listing',
    url: item.link || item.url || '#',
    price: extractPrice(item),
    description: item.description || item.body || undefined,
    inStock: inferStock(item),
    confidence: computeConfidence(partNumber, `${item.title ?? ''} ${item.description ?? ''}`),
  }))
}

async function searchEbay(partNumber: string): Promise<SearchResult[]> {
  const endpoint = new URL('https://serpapi.com/search.json')
  endpoint.searchParams.set('api_key', SERPAPI_KEY)
  endpoint.searchParams.set('engine', 'ebay')
  endpoint.searchParams.set('ebay_domain', 'ebay.com')
  endpoint.searchParams.set('type', 'search')
  endpoint.searchParams.set('keyword', partNumber)

  const response = await fetch(endpoint.toString())
  const json: any = await response.json()
  const items: RawResult[] = json.organic_results ?? []

  return items.slice(0, MAX_RESULTS_PER_SOURCE).map((item, index) => ({
    id: `ebay-${index}`,
    source: 'eBay',
    title: item.title || 'Unknown listing',
    url: item.link || '#',
    price: extractPrice(item),
    description: item.body || item.description || undefined,
    inStock: inferStock(item),
    confidence: computeConfidence(partNumber, `${item.title ?? ''} ${item.body ?? ''}`),
  }))
}

async function searchGoogleSite(partNumber: string, site: string, label: string): Promise<SearchResult[]> {
  const endpoint = new URL('https://serpapi.com/search.json')
  endpoint.searchParams.set('api_key', SERPAPI_KEY)
  endpoint.searchParams.set('engine', 'google')
  endpoint.searchParams.set('q', `${partNumber} site:${site}`)
  endpoint.searchParams.set('num', '5')

  const response = await fetch(endpoint.toString())
  const json: any = await response.json()
  const items: RawResult[] = json.organic_results ?? []

  return items.slice(0, MAX_RESULTS_PER_SOURCE).map((item, index) => ({
    id: `${label.toLowerCase()}-${index}`,
    source: label,
    title: item.title || 'Unknown listing',
    url: item.link || '#',
    price: extractPrice(item),
    description: item.snippet || undefined,
    inStock: undefined,
    confidence: computeConfidence(partNumber, `${item.title ?? ''} ${item.snippet ?? ''}`),
  }))
}

function extractPrice(item: RawResult): string | undefined {
  if (item.price) return item.price
  if (item.price_symbol && item.price_upper) {
    return `${item.price_symbol}${item.price_upper}`
  }
  return undefined
}

function inferStock(item: RawResult): boolean | undefined {
  const haystack = `${item.availability ?? ''} ${item.delivery ?? ''} ${item.body ?? ''}`.toLowerCase()
  if (!haystack.trim()) return undefined
  if (haystack.includes('in stock')) return true
  if (haystack.includes('out of stock')) return false
  return undefined
}

function normalize(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function computeConfidence(partNumber: string, candidate: string): number {
  const target = normalize(partNumber)
  const sample = normalize(candidate)
  if (!target || !sample) return 0
  if (sample.includes(target)) return 0.95
  const distance = levenshtein(target, sample)
  const maxLen = Math.max(target.length, sample.length)
  if (maxLen === 0) return 0
  const similarity = 1 - distance / maxLen
  return Number(similarity.toFixed(2))
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[a.length][b.length]
}
