-- Optimización de índices y agregaciones para la API de la aplicación móvil (Star Conectados / Innover App)

-- 1) Índices de alto rendimiento para consultas de campo, clientes y conversaciones
CREATE INDEX IF NOT EXISTS idx_field_tickets_client
  ON public.field_tickets (crm_client_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_field_tickets_employee_status
  ON public.field_tickets (employee_id, status)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_tickets_org_status
  ON public.field_tickets (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_org_client
  ON public.conversations (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_messages_conv_id_created
  ON public.messages (conversation_id, id DESC);

-- 2) Función RPC para cálculo de métricas de supervisión directamente en PostgreSQL
CREATE OR REPLACE FUNCTION public.get_supervisor_metrics(
  p_organization_id uuid,
  p_from_date timestamptz
)
RETURNS TABLE (
  employee_id text,
  assigned bigint,
  pending bigint,
  closed bigint,
  avg_close_seconds numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    employee_id,
    COUNT(*) FILTER (
      WHERE created_at >= p_from_date
         OR (closed_at IS NOT NULL AND closed_at >= p_from_date)
    ) AS assigned,
    COUNT(*) FILTER (
      WHERE status IN ('open', 'scheduled')
    ) AS pending,
    COUNT(*) FILTER (
      WHERE status = 'done'
        AND closed_at IS NOT NULL
        AND closed_at >= p_from_date
    ) AS closed,
    AVG(
      EXTRACT(EPOCH FROM (closed_at - created_at))
    ) FILTER (
      WHERE status = 'done'
        AND closed_at IS NOT NULL
        AND closed_at >= p_from_date
        AND closed_at >= created_at
    ) AS avg_close_seconds
  FROM public.field_tickets
  WHERE organization_id = p_organization_id
    AND employee_id IS NOT NULL
  GROUP BY employee_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_supervisor_metrics(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supervisor_metrics(uuid, timestamptz) TO service_role;
