-- ----------------------------------------------------------------------------
-- Migration: Soporte de notificaciones push para gerentes/supervisores
-- e historial de alertas de incidencias masivas en puertos PON
-- ----------------------------------------------------------------------------

-- 1. Modificar app_devices para permitir tokens de supervisores, técnicos y gerentes
ALTER TABLE public.app_devices
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.app_devices
  ADD COLUMN IF NOT EXISTS technician_id UUID REFERENCES public.technicians(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agent_id BIGINT REFERENCES public.agents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';

-- Índices para búsqueda de dispositivos según rol
CREATE INDEX IF NOT EXISTS app_devices_role_idx
  ON public.app_devices (organization_id, role);

CREATE INDEX IF NOT EXISTS app_devices_technician_idx
  ON public.app_devices (organization_id, technician_id);

CREATE INDEX IF NOT EXISTS app_devices_agent_idx
  ON public.app_devices (organization_id, agent_id);

-- 2. Tabla para registrar y controlar la frecuencia de alertas masivas por puerto PON
CREATE TABLE IF NOT EXISTS public.pon_incident_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board INTEGER NOT NULL,
  port INTEGER NOT NULL,
  incident_type TEXT NOT NULL, -- 'massive_outage' | 'altered_power' | 'mixed'
  affected_count INTEGER NOT NULL DEFAULT 0,
  los_count INTEGER NOT NULL DEFAULT 0,
  altered_power_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'resolved'
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_alert_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de consulta de alertas activas
CREATE INDEX IF NOT EXISTS pon_incident_alerts_active_idx
  ON public.pon_incident_alerts (organization_id, board, port, status);
