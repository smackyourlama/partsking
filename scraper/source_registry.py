from __future__ import annotations

from typing import List

from .models import SourceConfig

PLATFORM_SHOPIFY = "shopify"
PLATFORM_WOOCOMMERCE = "woocommerce"
PLATFORM_SHIFT4SHOP = "shift4shop"
PLATFORM_REPAIRCLINIC = "repairclinic"
PLATFORM_JACKS = "jacks"
PLATFORM_SERPAPI = "serpapi"

SOURCES: List[SourceConfig] = [
  SourceConfig(
    slug="jacks",
    label="Jack's Small Engines",
    domain="jackssmallengines.com",
    search_template="https://www.jackssmallengines.com/Search?keyword={query}",
    parser=PLATFORM_JACKS,
    requires_stealth=True,
    notes="Cloudflare-protected; run via StealthyFetcher once available.",
  ),
  SourceConfig(
    slug="proautoparts",
    label="Pro Auto Parts Direct",
    domain="proautopartsdirect.com",
    search_template="https://proautopartsdirect.com/search?type=product&q={query}",
    parser=PLATFORM_SHOPIFY,
  ),
  SourceConfig(
    slug="exmark",
    label="Exmark Shop",
    domain="shop.exmark.com",
    search_template="https://shop.exmark.com/search?q={query}",
    parser=PLATFORM_SHOPIFY,
  ),
  SourceConfig(
    slug="menindsup",
    label="Menominee Industrial Supply",
    domain="menindsup.com",
    search_template="https://www.menindsup.com/search?q={query}",
    parser=PLATFORM_WOOCOMMERCE,
  ),
  SourceConfig(
    slug="porchtree",
    label="PorchTree",
    domain="porchtree.com",
    search_template="https://porchtree.com/search?q={query}",
    parser=PLATFORM_SHOPIFY,
  ),
  SourceConfig(
    slug="bmikarts",
    label="BMI Karts",
    domain="bmikarts.com",
    search_template="https://www.bmikarts.com/search.asp?keyword={query}",
    parser=PLATFORM_SHIFT4SHOP,
  ),
  SourceConfig(
    slug="safford",
    label="Safford Equipment",
    domain="saffordequipment.com",
    search_template="https://saffordequipment.com/?s={query}&post_type=product",
    parser=PLATFORM_WOOCOMMERCE,
  ),
  SourceConfig(
    slug="chicagoengines",
    label="Chicago Engines",
    domain="chicagoengines.com",
    search_template="https://chicagoengines.com/?s={query}&post_type=product",
    parser=PLATFORM_WOOCOMMERCE,
  ),
  SourceConfig(
    slug="mowpart",
    label="MowPart",
    domain="mowpart.com",
    search_template="https://www.mowpart.com/search?q={query}",
    parser=PLATFORM_SHOPIFY,
  ),
  SourceConfig(
    slug="repairclinic",
    label="RepairClinic",
    domain="repairclinic.com",
    search_template="https://www.repairclinic.com/Search?query={query}",
    parser=PLATFORM_REPAIRCLINIC,
    requires_stealth=True,
    notes="Heavy Cloudflare; needs stealth fetchers",
  ),
  SourceConfig(
    slug="stems",
    label="Stems",
    domain="stems.com",
    search_template="https://www.stems.com/search?q={query}",
    parser=PLATFORM_SHOPIFY,
  ),
  SourceConfig(
    slug="arrow",
    label="Arrow Electronics",
    domain="arrow.com",
    search_template="https://www.arrow.com/en/products/search?q={query}",
    parser=PLATFORM_SERPAPI,
    notes="SerpAPI-backed search (Google organic results).",
  ),
  SourceConfig(
    slug="newark",
    label="Newark",
    domain="newark.com",
    search_template="https://www.newark.com/search?st={query}",
    parser=PLATFORM_SERPAPI,
    notes="SerpAPI-backed search (Google organic results).",
  ),
  SourceConfig(
    slug="octopart",
    label="Octopart",
    domain="octopart.com",
    search_template="https://octopart.com/search?q={query}",
    parser=PLATFORM_SERPAPI,
    notes="SerpAPI-backed search (Google organic results).",
  ),
]
