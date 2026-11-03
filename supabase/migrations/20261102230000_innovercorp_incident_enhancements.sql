-- ----------------------------------------------------------------------------
-- Migration: Mejoras para Centro de Incidencias Gerencial e InnoverCorp Push
-- Soporte para reconocimiento de alertas, optimización de consultas por puerto
-- y filtros en tiempo real para gerentes/supervisores.
-- ----------------------------------------------------------------------------

-- 1. Agregar campos de reconocimiento (acknowledgement) en alertas de incidencias
ALTER TABLE public.pon_incident_alerts
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;

-- 2. Índices compuestos para consultas de alto rendimiento por tarjeta y puerto
CREATE INDEX IF NOT EXISTS client_onus_board_port_status_idx
  ON public.client_onus (board, port, status);

CREATE INDEX IF NOT EXISTS pon_incident_alerts_org_status_idx
  ON public.pon_incident_alerts (organization_id, status, created_at DESC);

-- 3. Asegurar publicación en Supabase Realtime para pon_incident_alerts
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pon_incident_alerts;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
