-- Canal de chat técnico ↔ oficina + columnas de conversación.

-- 1) Conversaciones: canal y vínculo a technician
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'client_app';

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('client_app', 'technician_app'));

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS technician_id uuid
    REFERENCES public.technicians(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.conversations.channel IS
  'client_app = abonado; technician_app = técnico/supervisor de campo';

CREATE INDEX IF NOT EXISTS conversations_org_channel_idx
  ON public.conversations (organization_id, channel, updated_at DESC);

CREATE INDEX IF NOT EXISTS conversations_technician_idx
  ON public.conversations (organization_id, technician_id)
  WHERE technician_id IS NOT NULL;

-- Un hilo abierto por técnico (evita duplicados)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_tech_open_uidx
  ON public.conversations (organization_id, technician_id)
  WHERE channel = 'technician_app'
    AND technician_id IS NOT NULL
    AND status IN ('abierto', 'proceso');

-- 2) Mensajes: permitir sender_type technician
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('client', 'agent', 'bot', 'technician'));

-- 3) Índices de soporte para métricas de field tickets
CREATE INDEX IF NOT EXISTS field_tickets_org_employee_status_idx
  ON public.field_tickets (organization_id, employee_id, status);

CREATE INDEX IF NOT EXISTS field_tickets_org_closed_at_idx
  ON public.field_tickets (organization_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;
