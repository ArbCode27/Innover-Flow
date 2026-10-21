-- Wispro approve: persist expected vs plan amount.
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS expected_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS plan_amount numeric(12,2);

COMMENT ON COLUMN public.crm_payments.expected_amount IS
  'Balance de la factura pending (o precio del plan si no hay factura).';
COMMENT ON COLUMN public.crm_payments.plan_amount IS
  'Precio comercial GET /plans/{id} usado como fallback de expected.';

-- Local tickets: store Wispro legacy ids when they exist.
ALTER TABLE public.field_tickets
  ADD COLUMN IF NOT EXISTS wispro_issue_id text,
  ADD COLUMN IF NOT EXISTS wispro_order_id text;

UPDATE public.field_tickets
SET wispro_issue_id = issue_id::text
WHERE wispro_issue_id IS NULL;

UPDATE public.field_tickets
SET wispro_order_id = 'ord-' || id::text
WHERE wispro_order_id IS NULL;

COMMENT ON COLUMN public.field_tickets.wispro_issue_id IS
  'UUID local (con guiones) o id legacy Wispro (sin guiones).';
COMMENT ON COLUMN public.field_tickets.wispro_order_id IS
  'ord-{id} local, o id legacy de Wispro si no empieza por ord-.';
