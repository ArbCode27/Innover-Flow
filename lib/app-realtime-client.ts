import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { logMessageEvent, previewMessage } from "@/lib/message-event-log";

export type AppRealtimeConfig = {
  url: string;
  anon_key: string;
  access_token: string;
  expires_at: number;
  conversation_id: number | null;
};

type MessageHandler = (row: Record<string, unknown>, event: "INSERT" | "UPDATE") => void;
type ConversationHandler = (row: Record<string, unknown>) => void;
type TicketHandler = (
  row: Record<string, unknown>,
  event: "INSERT" | "UPDATE" | "DELETE",
) => void;

const emitAppRealtimeMessage = (
  conversationId: number,
  event: "INSERT" | "UPDATE",
  row: Record<string, unknown>,
) => {
  logMessageEvent("app_realtime_message", {
    event,
    conversationId,
    messageId: row.id ?? null,
    type: row.type ?? null,
    senderType: row.sender_type ?? null,
    preview: previewMessage(row.content),
  });
};

export const createAppRealtimeClient = (config: AppRealtimeConfig): SupabaseClient => {
  const client = createClient(config.url, config.anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  client.realtime.setAuth(config.access_token);
  return client;
};

export const subscribeAppRealtime = (input: {
  supabase: SupabaseClient;
  conversationId: number;
  clientId: number;
  onMessage: MessageHandler;
  onConversation?: ConversationHandler;
  onTicket?: TicketHandler;
  onStatus?: (status: string) => void;
}): (() => void) => {
  const channel: RealtimeChannel = input.supabase
    .channel(`app:${input.conversationId}:${input.clientId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${input.conversationId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        emitAppRealtimeMessage(input.conversationId, "INSERT", row);
        input.onMessage(row, "INSERT");
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${input.conversationId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        emitAppRealtimeMessage(input.conversationId, "UPDATE", row);
        input.onMessage(row, "UPDATE");
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "conversations",
        filter: `id=eq.${input.conversationId}`,
      },
      (payload) => input.onConversation?.(payload.new as Record<string, unknown>),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "field_tickets",
        filter: `crm_client_id=eq.${input.clientId}`,
      },
      (payload) => {
        const event = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        const row = (event === "DELETE" ? payload.old : payload.new) as Record<
          string,
          unknown
        >;
        input.onTicket?.(row, event);
      },
    )
    .subscribe((status, err) => {
      logMessageEvent(
        "app_realtime_status",
        {
          conversationId: input.conversationId,
          clientId: input.clientId,
          status,
          error: err?.message ?? null,
        },
        status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "warn" : "info",
      );
      input.onStatus?.(status);
    });

  return () => {
    void input.supabase.removeChannel(channel);
  };
};
