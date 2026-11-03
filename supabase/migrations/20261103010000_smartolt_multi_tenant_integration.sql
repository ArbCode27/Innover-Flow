-- =============================================================================
-- Migration: SmartOLT Multi-tenant Integration & client_onus isolation
-- Permite configurar una conexión única de SmartOLT por sucursal / organización
-- y aísla las ONUs por organización para evitar colisiones de IDs entre sucursales.
-- =============================================================================

-- 1. Actualizar check constraint de providers en organization_integrations
ALTER TABLE public.organization_integrations
  DROP CONSTRAINT IF EXISTS organization_integrations_provider_check;

ALTER TABLE public.organization_integrations
  ADD CONSTRAINT organization_integrations_provider_check
  CHECK (provider IN ('wispro', 'whatsapp', 'smartolt'));

-- 2. Añadir organization_id en client_onus si no existe
ALTER TABLE public.client_onus
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 3. Retrocompatibilidad: poblar organization_id a partir de los clientes asociados
UPDATE public.client_onus co
SET organization_id = c.organization_id
FROM public.clients c
WHERE co.client_id = c.id
  AND co.organization_id IS NULL;

-- 4. Índice para búsquedas rápidas de ONUs por organización
CREATE INDEX IF NOT EXISTS client_onus_organization_id_idx
  ON public.client_onus (organization_id);

CREATE INDEX IF NOT EXISTS client_onus_org_board_port_idx
  ON public.client_onus (organization_id, board, port);

-- 5. Ajustar unicidad de onu_external_id para que sea por sucursal (organización)
-- Esto permite que dos sucursales con SmartOLTs independientes puedan tener ONUs con el mismo ID local
ALTER TABLE public.client_onus
  DROP CONSTRAINT IF EXISTS client_onus_onu_external_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS client_onus_org_external_id_uidx
  ON public.client_onus (organization_id, onu_external_id);
