-- Migration: Habilitar Realtime para pon_incident_alerts
-- Permite que la pantalla de incidencias de gerentes reciba en tiempo real los eventos push
-- generados por cortes masivos y degradación óptica por tarjeta y puerto.

ALTER TABLE public.pon_incident_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'pon_incident_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pon_incident_alerts;
  END IF;
END $$;
