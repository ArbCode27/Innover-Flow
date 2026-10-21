-- Realtime seguro para app móvil (cliente) y CRM (agente).
-- Ejecutar en el SQL Editor de Supabase.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.field_tickets;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DROP POLICY IF EXISTS auth_users_all ON public.messages;
DROP POLICY IF EXISTS auth_users_all ON public.conversations;
DROP POLICY IF EXISTS auth_users_all ON public.clients;
DROP POLICY IF EXISTS auth_users_all ON public.field_tickets;

DROP POLICY IF EXISTS realtime_select_messages ON public.messages;
CREATE POLICY realtime_select_messages ON public.messages
FOR SELECT TO authenticated
USING (
  CASE
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'agent'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'client'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
       AND (
         conversation_id::text = auth.jwt() ->> 'conversation_id'
         OR EXISTS (
           SELECT 1
           FROM public.conversations c
           WHERE c.id = messages.conversation_id
             AND c.organization_id = messages.organization_id
             AND c.client_id = (auth.jwt() ->> 'client_id')::bigint
         )
       )
    ELSE false
  END
);

DROP POLICY IF EXISTS realtime_select_conversations ON public.conversations;
CREATE POLICY realtime_select_conversations ON public.conversations
FOR SELECT TO authenticated
USING (
  CASE
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'agent'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'client'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
       AND (
         id::text = auth.jwt() ->> 'conversation_id'
         OR client_id = (auth.jwt() ->> 'client_id')::bigint
       )
    ELSE false
  END
);

DROP POLICY IF EXISTS realtime_select_clients ON public.clients;
CREATE POLICY realtime_select_clients ON public.clients
FOR SELECT TO authenticated
USING (
  CASE
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'agent'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'client'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
       AND id = (auth.jwt() ->> 'client_id')::bigint
    ELSE false
  END
);

DROP POLICY IF EXISTS realtime_select_field_tickets ON public.field_tickets;
CREATE POLICY realtime_select_field_tickets ON public.field_tickets
FOR SELECT TO authenticated
USING (
  CASE
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'agent'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
    WHEN coalesce(auth.jwt() ->> 'app_role', '') = 'client'
      THEN organization_id::text = auth.jwt() ->> 'organization_id'
       AND (
         crm_client_id = (auth.jwt() ->> 'client_id')::bigint
         OR conversation_id::text = auth.jwt() ->> 'conversation_id'
       )
    ELSE false
  END
);
