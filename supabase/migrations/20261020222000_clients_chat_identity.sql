-- clients: ficha comercial + identidad de chat.
-- Un Wispro PUEDE tener varias filas. Un whatsapp_id NO.
-- ALTER sobre la tabla existente. Conserva organization_id, cedula y app_enabled.

-- Identidades vacías -> NULL (permite unique parcial y stubs)
UPDATE public.clients
SET
  phone = NULLIF(btrim(phone), ''),
  whatsapp_id = NULLIF(btrim(whatsapp_id), ''),
  wispro_id = NULLIF(btrim(wispro_id), ''),
  wa_name = NULLIF(btrim(wa_name), '');

-- account solo admite los 4 valores del CRM
UPDATE public.clients
SET account = 'Prospecto'
WHERE account IS NOT NULL
  AND account NOT IN ('Al día', 'Con deuda', 'Suspendido', 'Prospecto');

-- whatsapp_id exclusivo: conservar la fila más reciente, liberar el resto
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY whatsapp_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.clients
  WHERE whatsapp_id IS NOT NULL
)
UPDATE public.clients AS c
SET whatsapp_id = NULL
FROM ranked AS r
WHERE c.id = r.id
  AND r.rn > 1;

ALTER TABLE public.clients
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_account_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_account_check
  CHECK (
    account IS NULL
    OR account IN ('Al día', 'Con deuda', 'Suspendido', 'Prospecto')
  );

-- Varios chats pueden compartir la misma cédula / wispro_id
DROP INDEX IF EXISTS public.clients_unique_cedula_idx;

DROP INDEX IF EXISTS public.clients_wispro_id_idx;
CREATE INDEX IF NOT EXISTS clients_wispro_id_idx
  ON public.clients (wispro_id)
  WHERE wispro_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clients_whatsapp_id_unique
  ON public.clients (whatsapp_id)
  WHERE whatsapp_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_whatsapp_id_idx
  ON public.clients (whatsapp_id);

CREATE INDEX IF NOT EXISTS clients_created_at_idx
  ON public.clients (created_at);

CREATE INDEX IF NOT EXISTS clients_phone_idx
  ON public.clients (phone);

CREATE INDEX IF NOT EXISTS clients_phone_last10_idx
  ON public.clients (
    organization_id,
    right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)
  )
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_whatsapp_last10_idx
  ON public.clients (
    organization_id,
    right(regexp_replace(coalesce(whatsapp_id, ''), '[^0-9]', '', 'g'), 10)
  )
  WHERE whatsapp_id IS NOT NULL;

ALTER TABLE public.clients REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE public.clients IS
  'Ficha comercial + identidad de chat. 1 fila = 1 chat; varios chats pueden compartir wispro_id.';
COMMENT ON COLUMN public.clients.id IS 'PK. El CRM hace select(*) y tipa id:number.';
COMMENT ON COLUMN public.clients.organization_id IS 'Multi-tenant. El CRM filtra por organización.';
COMMENT ON COLUMN public.clients.name IS 'Nombre comercial Wispro si está vinculado; si no, wa_name o Número desconocido.';
COMMENT ON COLUMN public.clients.phone IS 'Contacto E.164 sin +. En chats nuevos suele coincidir con whatsapp_id. NULL permitido.';
COMMENT ON COLUMN public.clients.plan IS 'Perfil PPP del contrato Wispro. NO el nombre comercial. Fallback: Sin asignar.';
COMMENT ON COLUMN public.clients.zone IS 'zone_name Wispro. Fallback: Sin asignar.';
COMMENT ON COLUMN public.clients.account IS 'Al día | Con deuda | Suspendido | Prospecto.';
COMMENT ON COLUMN public.clients.wispro_id IS 'UUID Wispro. NO único: varios chats = mismo cliente comercial.';
COMMENT ON COLUMN public.clients.whatsapp_id IS 'Identidad del chat WhatsApp. ÚNICO cuando no es null.';
COMMENT ON COLUMN public.clients.wa_name IS 'Display name de WhatsApp. Solo se setea si está vacío.';
COMMENT ON COLUMN public.clients.color IS 'Hex UI, ej. #4f8ef7.';
COMMENT ON COLUMN public.clients.bg IS 'Hex de fondo del avatar.';
COMMENT ON COLUMN public.clients.initials IS '1-2 letras de name.';
COMMENT ON COLUMN public.clients.envoicing IS 'JSON stringificado (text). El CRM hace JSON.parse. No jsonb.';
COMMENT ON COLUMN public.clients.cedula IS 'Documento para la app móvil. La cédula Wispro también vive en envoicing.';
COMMENT ON COLUMN public.clients.app_enabled IS 'Acceso a la app del cliente.';
COMMENT ON COLUMN public.clients.created_at IS 'Alta de la fila.';

-- El CRM usa service_role. Anon no debe leer fichas comerciales.
DROP POLICY IF EXISTS anon_read_clients ON public.clients;
