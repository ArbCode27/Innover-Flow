-- ------------------------------------------------------------
-- Migration: update client_onus for SmartOLT real-time monitoring
-- ------------------------------------------------------------

-- Agregar columnas necesarias para SmartOLT si no existen
ALTER TABLE public.client_onus
  ADD COLUMN IF NOT EXISTS olt_id TEXT,
  ADD COLUMN IF NOT EXISTS onu_number INTEGER,
  ADD COLUMN IF NOT EXISTS zone TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS signal_changed_at TIMESTAMPTZ DEFAULT now();

-- Índices para optimizar consultas de monitoreo por puerto y estado
CREATE INDEX IF NOT EXISTS client_onus_board_port_idx ON public.client_onus (board, port);
CREATE INDEX IF NOT EXISTS client_onus_status_idx ON public.client_onus (status);
CREATE INDEX IF NOT EXISTS client_onus_rx_signal_idx ON public.client_onus (rx_signal);

-- Habilitar Supabase Realtime para la tabla client_onus
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_onus;
  EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
  END;
END $$;
