-- clients deja de ser identidad de chat WhatsApp.
-- 1 cliente Wispro = 1 fila CRM por organización.

UPDATE public.clients
SET
  phone = NULLIF(btrim(phone), ''),
  wispro_id = NULLIF(btrim(wispro_id), ''),
  cedula = NULLIF(btrim(cedula), '');

-- Conservar la fila más reciente por wispro_id dentro de cada org
WITH ranked_wispro AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, wispro_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.clients
  WHERE wispro_id IS NOT NULL
)
UPDATE public.clients AS c
SET wispro_id = NULL
FROM ranked_wispro AS r
WHERE c.id = r.id
  AND r.rn > 1;

-- Conservar la fila más reciente por cédula dentro de cada org
WITH ranked_cedula AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, cedula
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.clients
  WHERE cedula IS NOT NULL
)
UPDATE public.clients AS c
SET cedula = NULL
FROM ranked_cedula AS r
WHERE c.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS public.clients_whatsapp_id_unique;
DROP INDEX IF EXISTS public.clients_whatsapp_id_idx;
DROP INDEX IF EXISTS public.clients_whatsapp_last10_idx;

ALTER TABLE public.clients
  DROP COLUMN IF EXISTS whatsapp_id,
  DROP COLUMN IF EXISTS wa_name;

CREATE UNIQUE INDEX IF NOT EXISTS clients_org_wispro_id_unique
  ON public.clients (organization_id, wispro_id)
  WHERE wispro_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clients_org_cedula_unique
  ON public.clients (organization_id, cedula)
  WHERE cedula IS NOT NULL;

COMMENT ON TABLE public.clients IS
  'Ficha comercial del suscriptor. 1 wispro_id = 1 fila por organización.';
COMMENT ON COLUMN public.clients.name IS 'Nombre comercial Wispro.';
COMMENT ON COLUMN public.clients.phone IS 'Teléfono móvil. Digitos, sin +. NULL solo si Wispro no lo trae y aún no se carga.';
COMMENT ON COLUMN public.clients.plan IS 'Perfil PPP del contrato Wispro. Fallback: Sin asignar.';
COMMENT ON COLUMN public.clients.zone IS 'zone_name Wispro. Fallback: Sin asignar.';
COMMENT ON COLUMN public.clients.wispro_id IS 'UUID Wispro. Único por organización.';
COMMENT ON COLUMN public.clients.cedula IS 'Documento para la app móvil. Único por organización.';
