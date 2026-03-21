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
