# Supplier Source Catalog

PartsKing prioritizes the following supplier storefronts when building the local database. Each entry lists the
base domain, the search endpoint we target for SKU lookups, and any scraper considerations. Items tagged as
“Stealth required” currently return Cloudflare/akamai challenges in plain HTTP clients and will need Scrapling’s
stealth fetcher (or the upcoming Docker build with `curl_cffi`) before we can run them headlessly.

| Supplier | Domain | Search entry point | Parser target / notes |
| --- | --- | --- | --- |
| Jack's Small Engines | `jackssmallengines.com` | `https://www.jackssmallengines.com/Search?keyword={part}` | Cloudflare blocks bare requests → run via Scrapling Stealth fetcher once `curl_cffi` is fixed. Product cards rendered server-side with `.product-list` markup. |
| Pro Auto Parts Direct | `proautopartsdirect.com` | `https://proautopartsdirect.com/search?type=product&q={part}` | Shopify storefront: results in `.productgrid--item`. Extract `.card__heading a`, `.price-item`. |
| Exmark Shop | `shop.exmark.com` | `https://shop.exmark.com/search?q={part}` | Custom React storefront but pre-renders HTML; look for `.search-result-card`. No anti-bot detected. |
| Menominee Industrial Supply | `menindsup.com` | `https://www.menindsup.com/search?q={part}` | BigCommerce store. Product grid uses `.productGrid .product`. Capture `.card-title`, `.price`, `.card-figure a`. |
| PorchTree | `porchtree.com` | `https://porchtree.com/search?q={part}` | Shopify. Same parser as Pro Auto Parts Direct (card-based). |
| BMI Karts | `bmikarts.com` | `https://www.bmikarts.com/search.asp?keyword={part}` | Shift4Shop (ex-3DCart). Result rows under `.product-item`. Price inside `.ProductPrice`. |
| Safford Equipment | `saffordequipment.com` | `https://saffordequipment.com/?s={part}&post_type=product` | WooCommerce. Parse `.products .product` with `.woocommerce-loop-product__title` and `.price`. |
| Chicago Engines | `chicagoengines.com` | `https://chicagoengines.com/?s={part}&post_type=product` | WooCommerce same as Safford. |
| MowPart | `mowpart.com` | `https://www.mowpart.com/search?q={part}` | Shopify. Use `.productgrid--item`. |
| RepairClinic | `repairclinic.com` | `https://www.repairclinic.com/Search?query={part}` | Cloudflare-protected. Requires stealth fetch. Product tiles rendered under `[data-entity-type="Product"]`. |
| Stems | `stems.com` | `https://www.stems.com/search?q={part}` | Shopify (gift boutique). Parser identical to other Shopify stores. |

## Implementation status

- **SerpAPI bridge (live today):** the Node API already queries Google via SerpAPI with `site:` filters for each
  domain, so cached results originate from these suppliers even while the direct scrapers are under construction.
- **Direct scrapers:** Python modules under `scraper/` will use Scrapling’s parser + fetchers to gather full
  pricing, availability, and breadcrumb metadata from each site. We’ll switch the ingestion pipeline over once
  the stealth fetcher dependency (`curl_cffi`) is resolved or Dockerized.
- **Data retention:** regardless of source, normalized listings are stored in `data/parts.db` with fields
  `{part_number, source, title, url, price, in_stock, confidence, fetched_at}` for fast recall.

Add additional suppliers by appending to this table **and** registering the domain in
`server/searchService.ts#SITE_SCOPED_SOURCES` so both SerpAPI and the future scrapers stay in sync.
