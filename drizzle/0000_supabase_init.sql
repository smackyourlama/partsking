CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number text UNIQUE NOT NULL,
  last_cached_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  website text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.part_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  part_number text NOT NULL,
  source text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  price text,
  stock_status text,
  confidence double precision NOT NULL,
  payload jsonb NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS part_listings_part_source_url_unique
  ON public.part_listings(part_number, source, url);
CREATE INDEX IF NOT EXISTS part_listings_part_idx
  ON public.part_listings(part_number, scraped_at DESC);

CREATE TABLE IF NOT EXISTS public.refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number text NOT NULL,
  run_type text NOT NULL DEFAULT 'incremental',
  status text NOT NULL DEFAULT 'pending',
  notes text,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  finished_at timestamptz
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_parts_updated_at ON public.parts;
CREATE TRIGGER set_parts_updated_at
BEFORE UPDATE ON public.parts
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER set_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE VIEW public.part_latest AS
SELECT DISTINCT ON (pl.part_number, pl.source)
  pl.id,
  pl.part_id,
  pl.part_number,
  pl.source,
  pl.title,
  pl.url,
  pl.price,
  pl.stock_status,
  pl.confidence,
  pl.payload,
  pl.scraped_at,
  s.slug AS supplier_slug,
  s.name AS supplier_name,
  p.last_cached_at
FROM public.part_listings pl
LEFT JOIN public.parts p ON p.id = pl.part_id
LEFT JOIN public.suppliers s ON s.id = pl.supplier_id
ORDER BY pl.part_number, pl.source, pl.scraped_at DESC;

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_read_parts ON public.parts;
CREATE POLICY anon_read_parts
  ON public.parts
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS service_rw_parts ON public.parts;
CREATE POLICY service_rw_parts
  ON public.parts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS anon_read_suppliers ON public.suppliers;
CREATE POLICY anon_read_suppliers
  ON public.suppliers
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS service_rw_suppliers ON public.suppliers;
CREATE POLICY service_rw_suppliers
  ON public.suppliers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS anon_read_part_listings ON public.part_listings;
CREATE POLICY anon_read_part_listings
  ON public.part_listings
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS service_rw_part_listings ON public.part_listings;
CREATE POLICY service_rw_part_listings
  ON public.part_listings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_view_refresh_runs ON public.refresh_runs;
CREATE POLICY service_view_refresh_runs
  ON public.refresh_runs
  FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_manage_refresh_runs ON public.refresh_runs;
CREATE POLICY service_manage_refresh_runs
  ON public.refresh_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.suppliers (slug, name, website, notes)
VALUES
  ('jackssmallengines', 'Jack''s Small Engines', 'https://www.jackssmallengines.com', 'Requires stealth fetcher for Cloudflare'),
  ('proautopartsdirect', 'Pro Auto Parts Direct', 'https://proautopartsdirect.com', 'Shopify storefront'),
  ('exmark-shop', 'Exmark Shop', 'https://shop.exmark.com', 'React storefront; pre-rendered HTML'),
  ('menominee-industrial', 'Menominee Industrial Supply', 'https://www.menindsup.com', 'BigCommerce storefront'),
  ('partstree', 'PartsTree', 'https://www.partstree.com', 'OEM catalog storefront'),
  ('bmi-karts', 'BMI Karts', 'https://www.bmikarts.com', 'Shift4Shop storefront'),
  ('safford-equipment', 'Safford Equipment', 'https://saffordequipment.com', 'WooCommerce storefront'),
  ('chicago-engines', 'Chicago Engines', 'https://chicagoengines.com', 'WooCommerce storefront'),
  ('mowpart', 'MowPart', 'https://www.mowpart.com', 'Shopify storefront'),
  ('repairclinic', 'RepairClinic', 'https://www.repairclinic.com', 'Cloudflare protected; needs stealth'),
  ('sterns', 'Sterns', 'https://www.sterns.com', 'Shopify storefront')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website = EXCLUDED.website,
  notes = EXCLUDED.notes,
  updated_at = timezone('utc', now());
