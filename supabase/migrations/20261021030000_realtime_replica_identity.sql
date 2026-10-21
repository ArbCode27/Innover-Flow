-- postgres_changes con filtro por columna que no es PK (messages.conversation_id,
-- field_tickets.crm_client_id) necesita REPLICA IDENTITY FULL para INSERT/UPDATE/DELETE.
-- Sin esto, DELETE no llega a la app abierta.

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.field_tickets REPLICA IDENTITY FULL;
