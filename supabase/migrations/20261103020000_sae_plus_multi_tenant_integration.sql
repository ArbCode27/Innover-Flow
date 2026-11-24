-- =============================================================================
-- Migration: SAE Plus Multi-tenant Integration Support
-- Permite configurar conexiones de SAE Plus (Abonados y Pagos) por sucursal / organización.
-- =============================================================================

-- 1. Actualizar check constraint de providers en organization_integrations para incluir 'sae'
ALTER TABLE public.organization_integrations
  DROP CONSTRAINT IF EXISTS organization_integrations_provider_check;

ALTER TABLE public.organization_integrations
  ADD CONSTRAINT organization_integrations_provider_check
  CHECK (provider IN ('wispro', 'whatsapp', 'smartolt', 'sae'));
