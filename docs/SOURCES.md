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
| Menominee Industrial Supply | `menindsup.com` | `https://menindsup.com/catalogsearch/result/?q={part}` | Magento storefront currently redirects catalogsearch queries to the login page unless a customer session/cookie is present. Requires authenticated or stealth session before listings become visible. |
| PartsTree | `partstree.com` | `https://www.partstree.com/search/?type=part&term={part}` | Custom OEM catalog. Cards rendered under `.pt-product.catalog.part`; extract `.description a`, `.short-description`, `.price .price`. Shipping badge shows stock status. |
| BMI Karts | `bmikarts.com` | `https://www.bmikarts.com/search.asp?keyword={part}` | Shift4Shop (ex-3DCart). Result rows under `.product-item`. Price inside `.ProductPrice`. |
| Safford Equipment | `saffordequipment.com` | `https://saffordequipment.com/?s={part}&post_type=product` | WooCommerce. Parse `.products .product` with `.woocommerce-loop-product__title` and `.price`. |
| Chicago Engines | `chicagoengines.com` | `https://chicagoengines.com/?s={part}&post_type=product` | WooCommerce same as Safford. |
| MowPart | `mowpart.com` | `https://www.mowpart.com/search.php?search_query={part}` | BigCommerce storefront. Parse `.productGrid li.product` with `.card-title`, `.price-section--withoutTax .price`. |
| RepairClinic | `repairclinic.com` | `https://www.repairclinic.com/Search?query={part}` | Cloudflare-protected. Requires stealth fetch. Product tiles rendered under `[data-entity-type="Product"]`. |
| Sterns | `sterns.com` | `https://www.sterns.com/search?q={part}` | Shopify storefront; parser identical to other Shopify implementations. |

## Implementation status

- **Direct scrapers (live path):** Python modules under `scraper/` use Scrapling’s parser + fetchers to gather
  pricing, availability, and breadcrumb metadata for each supplier. Stealth-only sites (Jack’s, RepairClinic) stay
  disabled until the curl_cffi-based fetcher lands.
- **Data retention:** normalized listings write into Supabase (`parts`, `part_listings`) in production; the SQLite fallback
  (`data/parts.db`) mirrors the same schema for local dev. Fields: `{part_number, source, title, url, price, in_stock, confidence, scraped_at}`.

Add additional suppliers by appending to this table **and** registering the domain in
`scraper/source_registry.py` so the runner picks up the new source automatically.
