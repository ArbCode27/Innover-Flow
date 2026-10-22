-- Destinos de pago configurables por organización (app cliente + CRM Ajustes).

CREATE TABLE IF NOT EXISTS public.organization_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  method_key text NOT NULL
    CHECK (method_key IN ('pago_movil', 'transferencia', 'deposito', 'deposito_usd')),
  title text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'VES'
    CHECK (currency IN ('VES', 'USD')),
  bank_name text,
  phone text,
  document text,
  account_number text,
  account_type text
    CHECK (account_type IS NULL OR account_type IN ('corriente', 'ahorro')),
  holder_name text,
  notes text,
  updated_by integer REFERENCES public.agents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, method_key)
);

CREATE INDEX IF NOT EXISTS organization_payment_methods_org_enabled_idx
  ON public.organization_payment_methods (organization_id, is_enabled, sort_order);

ALTER TABLE public.organization_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.organization_payment_methods;
CREATE POLICY service_role_all ON public.organization_payment_methods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_users_all ON public.organization_payment_methods;
CREATE POLICY auth_users_all ON public.organization_payment_methods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.organization_payment_methods IS
  'Cuentas / datos de destino de pago que el admin configura en CRM y la app muestra al cliente.';
