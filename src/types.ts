export type SearchResult = {
  id: string
  source: string
  supplierSlug?: string
  supplierName?: string
  title: string
  url: string
  price?: string
  description?: string
  inStock?: boolean
  confidence: number
}
