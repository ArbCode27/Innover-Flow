-- Optimización de Rendimiento para el Endpoint de Métricas de Supervisor

-- 1) Índices de soporte en field_tickets para consultas de agregación por técnico y estado
CREATE INDEX IF NOT EXISTS idx_field_tickets_employee_status
  ON public.field_tickets (employee_id, status)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_tickets_org_status
  ON public.field_tickets (organization_id, status, created_at DESC);

-- 2) Función RPC en PostgreSQL para agregación de métricas de supervisión
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
    ft.employee_id,
    COUNT(*) FILTER (
      WHERE ft.created_at >= p_from_date
         OR (ft.closed_at IS NOT NULL AND ft.closed_at >= p_from_date)
    ) AS assigned,
    COUNT(*) FILTER (
      WHERE ft.status IN ('open', 'scheduled')
    ) AS pending,
    COUNT(*) FILTER (
      WHERE ft.status = 'done'
        AND ft.closed_at IS NOT NULL
        AND ft.closed_at >= p_from_date
    ) AS closed,
    AVG(
      EXTRACT(EPOCH FROM (ft.closed_at - ft.created_at))
    ) FILTER (
      WHERE ft.status = 'done'
        AND ft.closed_at IS NOT NULL
        AND ft.closed_at >= p_from_date
        AND ft.closed_at >= ft.created_at
    ) AS avg_close_seconds
  FROM public.field_tickets ft
  WHERE ft.organization_id = p_organization_id
    AND ft.employee_id IS NOT NULL
  GROUP BY ft.employee_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_supervisor_metrics(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supervisor_metrics(uuid, timestamptz) TO service_role;
