-- Ensure app Realtime postgres_changes can deliver chat events.
-- schema.sql already adds these tables; migrations historically only added
-- field_tickets / clients. Idempotent for projects that already have them.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Non-PK filters (messages.conversation_id) need FULL for reliable INSERT/UPDATE/DELETE.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
