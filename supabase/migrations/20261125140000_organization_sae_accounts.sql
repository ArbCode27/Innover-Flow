-- Cuentas bancarias que SAE devuelve al conectar o verificar la integración.

CREATE TABLE IF NOT EXISTS public.organization_sae_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  id_cuba text NOT NULL,
  banco text NOT NULL,
  numero_cuenta text NOT NULL DEFAULT '',
  receptor_bank text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id_cuba)
);

CREATE INDEX IF NOT EXISTS organization_sae_accounts_org_active_idx
  ON public.organization_sae_accounts (organization_id, is_active, sort_order);

COMMENT ON TABLE public.organization_sae_accounts IS
  'Catálogo de cuentas bancarias de SAE. Se reemplaza al conectar o verificar la integración.';

ALTER TABLE public.organization_sae_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.organization_sae_accounts;
CREATE POLICY service_role_all ON public.organization_sae_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
