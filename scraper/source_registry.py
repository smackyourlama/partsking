from __future__ import annotations

from typing import List

from .models import SourceConfig

PLATFORM_SHOPIFY = "shopify"
PLATFORM_WOOCOMMERCE = "woocommerce"
PLATFORM_BIGCOMMERCE = "bigcommerce"
PLATFORM_SHIFT4SHOP = "shift4shop"
PLATFORM_REPAIRCLINIC = "repairclinic"
PLATFORM_JACKS = "jacks"
PLATFORM_PARTSTREE = "partstree"

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
    search_template="https://menindsup.com/catalogsearch/result/?q={query}",
    parser=PLATFORM_WOOCOMMERCE,
    notes="Magento storefront currently redirects catalogsearch queries to the login wall without an authenticated session.",
  ),
  SourceConfig(
    slug="partstree",
    label="PartsTree",
    domain="partstree.com",
    search_template="https://www.partstree.com/search/?type=part&term={query}",
    parser=PLATFORM_PARTSTREE,
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
    search_template="https://www.mowpart.com/search.php?search_query={query}",
    parser=PLATFORM_BIGCOMMERCE,
    notes="BigCommerce storefront; search.php is required for catalog queries.",
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
    slug="sterns",
    label="Sterns",
    domain="sterns.com",
    search_template="https://www.sterns.com/search?q={query}",
    parser=PLATFORM_SHOPIFY,
  ),
]
