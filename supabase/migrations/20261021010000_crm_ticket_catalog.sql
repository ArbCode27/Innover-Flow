-- Catálogo interno de tickets + tablas de campo si aún no existen.
-- Wispro NO se usa para categorías. Solo técnicos (tabla technicians + fallback API).

-- Pagos Wispro
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS expected_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS plan_amount numeric(12,2);

-- Técnicos locales (catálogo preferido; Wispro /employees es fallback)
CREATE TABLE IF NOT EXISTS public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  document text,
  is_supervisor boolean NOT NULL DEFAULT false,
  source_employee_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS technicians_org_source_employee_idx
  ON public.technicians (organization_id, source_employee_id)
  WHERE source_employee_id IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.field_tickets_public_id_seq START WITH 2000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.field_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  public_id integer NOT NULL UNIQUE,
  conversation_id bigint REFERENCES public.conversations(id) ON DELETE SET NULL,
  crm_client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL,
  employee_id text,
  employee_name text,
  employee_phone text,
  employee_document text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'scheduled', 'done', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  kind text NOT NULL CHECK (kind IN ('technical', 'installation', 'resignation', 'feasibility')),
  title text NOT NULL CHECK (char_length(title) <= 80),
  cause text,
  description text,
  client_name text,
  client_phone text,
  maps_url text,
  latitude numeric,
  longitude numeric,
  address_text text,
  facade_media_url text,
  facade_message_id text,
  window_start timestamptz,
  window_end timestamptz,
  last_technician_report_at timestamptz,
  last_technician_report_key text,
  closed_at timestamptz,
  resolution_observation text,
  wispro_issue_id text,
  wispro_order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.field_tickets
  ADD COLUMN IF NOT EXISTS wispro_issue_id text,
  ADD COLUMN IF NOT EXISTS wispro_order_id text;

CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('technical', 'installation', 'resignation', 'feasibility')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

ALTER TABLE public.field_tickets
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.ticket_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS field_tickets_org_created_idx
  ON public.field_tickets (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS field_tickets_category_idx
  ON public.field_tickets (category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_categories_org_idx
  ON public.ticket_categories (organization_id, sort_order, name);

INSERT INTO public.ticket_categories (organization_id, name, slug, kind, sort_order)
SELECT o.id, seed.name, seed.slug, seed.kind, seed.sort_order
FROM public.organizations AS o
CROSS JOIN (
  VALUES
    ('Visita técnica por falla', 'technical', 'technical', 0),
    ('Instalación nueva', 'installation', 'installation', 1),
    ('Baja de servicio', 'resignation', 'resignation', 2),
    ('Estudio de factibilidad', 'feasibility', 'feasibility', 3)
) AS seed(name, slug, kind, sort_order)
ON CONFLICT (organization_id, slug) DO NOTHING;

UPDATE public.field_tickets
SET wispro_issue_id = issue_id::text
WHERE wispro_issue_id IS NULL;

UPDATE public.field_tickets
SET wispro_order_id = 'ord-' || id::text
WHERE wispro_order_id IS NULL;

CREATE OR REPLACE FUNCTION public.field_tickets_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.issue_id IS NULL THEN
    NEW.issue_id := gen_random_uuid();
  END IF;
  IF NEW.public_id IS NULL THEN
    NEW.public_id := nextval('public.field_tickets_public_id_seq');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS field_tickets_before_insert ON public.field_tickets;
CREATE TRIGGER field_tickets_before_insert
BEFORE INSERT ON public.field_tickets
FOR EACH ROW EXECUTE FUNCTION public.field_tickets_before_insert();

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.technicians;
CREATE POLICY service_role_all ON public.technicians FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.field_tickets;
CREATE POLICY service_role_all ON public.field_tickets FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.ticket_categories;
CREATE POLICY service_role_all ON public.ticket_categories FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.field_tickets;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
