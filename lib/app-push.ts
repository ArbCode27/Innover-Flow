import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { buildChatPushPreview } from "@/lib/chat-push-preview";
import {
  buildExpoChatPushMessage,
  buildExpoTicketPushMessage,
  collectUnregisteredExpoTokens,
  sendExpoPushMessages,
  type ExpoPushMessage,
} from "@/lib/expo-push";

const LOG_PREFIX = "[APP_PUSH]";

export const enqueueAppPush = (task: () => Promise<void>) => {
  const run = () => {
    void task().catch((error) => {
      console.warn(`${LOG_PREFIX} unhandled`, {
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  };

  try {
    after(run);
  } catch {
    run();
  }
};

const readMessageChannel = (channel?: string | null) =>
  typeof channel === "string" && channel.trim() ? channel.trim() : "app";

const loadAppDeviceTokens = async (
  supabase: SupabaseClient,
  organizationId: string,
  clientId: number,
) => {
  const { data: devices, error } = await supabase
    .from("app_devices")
    .select("id, push_token, platform")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId);

  if (error) {
    if (error.code !== "PGRST205" && error.code !== "42P01") {
      console.warn(`${LOG_PREFIX} devices_lookup_failed`, error.message);
    }
    return [];
  }

  return [
    ...new Set(
      (devices || [])
        .map((row) => String(row.push_token || "").trim())
        .filter(Boolean),
    ),
  ];
};

const pruneUnregisteredAppDevices = async (
  supabase: SupabaseClient,
  organizationId: string,
  tokens: string[],
  tickets: { status?: string; details?: { error?: string } }[],
) => {
  const staleTokens = collectUnregisteredExpoTokens(tokens, tickets);
  if (!staleTokens.length) return 0;

  const { error } = await supabase
    .from("app_devices")
    .delete()
    .eq("organization_id", organizationId)
    .in("push_token", staleTokens);

  if (error) {
    console.warn(`${LOG_PREFIX} stale_token_delete_failed`, error.message);
    return 0;
  }

  console.log(`${LOG_PREFIX} stale_tokens_deleted`, {
    count: staleTokens.length,
  });
  return staleTokens.length;
};

const sendToClientDevices = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    clientId: number;
    messages: ExpoPushMessage[];
    logContext: Record<string, unknown>;
  },
) => {
  if (!input.messages.length) {
    console.log(`${LOG_PREFIX} no_devices`, {
      clientId: input.clientId,
      ...input.logContext,
    });
    return;
  }

  const tokens = input.messages.map((message) => message.to);
  const { tickets } = await sendExpoPushMessages(input.messages);
  const stale = await pruneUnregisteredAppDevices(
    supabase,
    input.organizationId,
    tokens,
    tickets,
  );

  console.log(`${LOG_PREFIX} push_sent`, {
    clientId: input.clientId,
    devices: tokens.length,
    stale,
    expoTicketIds: tickets.map((ticket) => ticket.id ?? null),
    ...input.logContext,
  });
};

const resolveClientIdFromConversation = async (
  supabase: SupabaseClient,
  organizationId: string,
  conversationId: number,
) => {
  const { data, error } = await supabase
    .from("conversations")
    .select("client_id")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.warn(`${LOG_PREFIX} conversation_lookup_failed`, {
      conversationId,
      error: error.message,
    });
    return null;
  }

  return data?.client_id ? Number(data.client_id) : null;
};

const resolveConversationIdForClient = async (
  supabase: SupabaseClient,
  organizationId: string,
  clientId: number,
) => {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`${LOG_PREFIX} client_conversation_lookup_failed`, {
      clientId,
      error: error.message,
    });
    return null;
  }

  return data?.id ? Number(data.id) : null;
};

export const notifyAppChatPush = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: number;
    messageId: number;
    type: string;
    senderType: string;
    channel?: string | null;
    content: string;
    mediaType?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
) => {
  try {
    if (input.type !== "out") return;
    if (input.senderType !== "agent" && input.senderType !== "bot") return;
    if (readMessageChannel(input.channel) !== "app") return;

    const clientId = await resolveClientIdFromConversation(
      supabase,
      input.organizationId,
      input.conversationId,
    );
    if (!clientId) return;

    const tokens = await loadAppDeviceTokens(
      supabase,
      input.organizationId,
      clientId,
    );
    const body = buildChatPushPreview({
      content: input.content,
      mediaType: input.mediaType,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    const messages = tokens.map((token) =>
      buildExpoChatPushMessage({
        token,
        conversationId: input.conversationId,
        messageId: input.messageId,
        body,
      }),
    );

    await sendToClientDevices(supabase, {
      organizationId: input.organizationId,
      clientId,
      messages,
      logContext: {
        kind: "chat_message",
        conversationId: input.conversationId,
        messageId: input.messageId,
      },
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} chat_push_failed`, {
      conversationId: input.conversationId,
      messageId: input.messageId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
};

export const notifyAppFieldTicketPush = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    clientId?: number | null;
    conversationId?: number | null;
    ticketId: string;
    publicId: number | null;
    title: string | null;
  },
) => {
  try {
    let clientId = input.clientId ? Number(input.clientId) : null;
    if (!clientId && input.conversationId) {
      clientId = await resolveClientIdFromConversation(
        supabase,
        input.organizationId,
        Number(input.conversationId),
      );
    }
    if (!clientId) {
      console.log(`${LOG_PREFIX} ticket_push_skipped_no_client`, {
        ticketId: input.ticketId,
        conversationId: input.conversationId ?? null,
      });
      return;
    }

    let conversationId = input.conversationId
      ? Number(input.conversationId)
      : null;
    if (!conversationId) {
      conversationId = await resolveConversationIdForClient(
        supabase,
        input.organizationId,
        clientId,
      );
    }

    const tokens = await loadAppDeviceTokens(
      supabase,
      input.organizationId,
      clientId,
    );
    const messages = tokens.map((token) =>
      buildExpoTicketPushMessage({
        token,
        ticketId: input.ticketId,
        publicId: input.publicId,
        title: input.title,
        conversationId,
      }),
    );

    await sendToClientDevices(supabase, {
      organizationId: input.organizationId,
      clientId,
      messages,
      logContext: {
        kind: "field_ticket",
        ticketId: input.ticketId,
        conversationId,
      },
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} ticket_push_failed`, {
      ticketId: input.ticketId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
};
