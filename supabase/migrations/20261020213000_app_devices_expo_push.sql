-- Tokens Expo Push de Star Conectados.
-- Tabla real: public.app_devices
-- Columnas: id, organization_id, client_id, push_token, platform, created_at, updated_at
-- UPSERT de POST /api/app/devices: UNIQUE (organization_id, push_token)
-- Un cliente puede tener 1..N tokens (Android + iOS).

CREATE TABLE IF NOT EXISTS public.app_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  push_token text NOT NULL,
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, push_token)
);

CREATE INDEX IF NOT EXISTS app_devices_client_idx
  ON public.app_devices (organization_id, client_id);

CREATE UNIQUE INDEX IF NOT EXISTS app_devices_client_token_idx
  ON public.app_devices (client_id, push_token);
