import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import {
  findClientByWhatsappOrPhone,
  insertClientRow,
  normalizeClientPhone,
} from "@/app/crm/_lib/client-identity";
import { buildChatPushPreview } from "@/lib/chat-push-preview";
import {
  buildExpoChatPushMessage,
  collectUnregisteredExpoTokens,
  sendExpoPushMessages,
} from "@/lib/expo-push";
import { logMessageEvent, previewMessage } from "@/lib/message-event-log";

const LOG_PREFIX = "[APP_CHANNEL]";

export const normalizeChannelPhone = (phone: string) =>
  normalizeClientPhone(phone) || phone.replace(/\D/g, "");

export type ChannelMediaType = "audio" | "image" | "video" | "document" | "location";

export type PersistOutboundInput = {
  organizationId: string;
  conversationId: number;
  content: string;
  senderType: "agent" | "bot";
  sentBy: string;
  mediaUrl?: string | null;
  mediaType?: ChannelMediaType | null;
  mimeType?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  locationAddress?: string | null;
};

export type PersistInboundInput = {
  organizationId: string;
  conversationId: number;
  content: string;
  mediaUrl?: string | null;
  mediaType?: ChannelMediaType | null;
  mimeType?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  locationAddress?: string | null;
};

export const persistOutboundMessage = async (
  supabase: SupabaseClient,
  input: PersistOutboundInput,
) => {
  const now = new Date().toISOString();
  const { data: saved, error } = await supabase
    .from("messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      type: "out",
      content: input.content,
      sender_type: input.senderType,
      sent_by: input.sentBy,
      status: "sent",
      created_at: now,
      media_url: input.mediaUrl || null,
      media_type: input.mediaType || null,
      mime_type: input.mimeType || null,
      caption: input.caption || null,
      metadata: {
        channel: "app",
        ...(input.metadata || {}),
      },
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      location_name: input.locationName || null,
      location_address: input.locationAddress || null,
    })
    .select()
    .single();

  if (error) {
    logMessageEvent(
      "db_insert_failed",
      {
        direction: "out",
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        senderType: input.senderType,
        error: error.message,
      },
      "error",
    );
    throw error;
  }

  logMessageEvent("db_insert", {
    direction: "out",
    conversationId: input.conversationId,
    messageId: saved.id,
    senderType: input.senderType,
    action:
      typeof input.metadata?.action === "string" ? input.metadata.action : null,
    mediaType: input.mediaType ?? null,
    preview: previewMessage(input.content),
  });

  await supabase
    .from("conversations")
    .update({
      preview: input.content.slice(0, 180),
      updated_at: now,
      last_message_at: now,
    })
    .eq("id", input.conversationId)
    .eq("organization_id", input.organizationId);

  enqueueAppChatPush(() =>
    notifyAppDevices(supabase, {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      messageId: Number(saved.id),
      type: saved.type || "out",
      senderType: saved.sender_type || input.senderType,
      channel: readMessageChannel(saved.metadata),
      content: input.content,
      mediaType: input.mediaType ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    }),
  );

  return saved;
};

export const persistInboundMessage = async (
  supabase: SupabaseClient,
  input: PersistInboundInput,
) => {
  const now = new Date().toISOString();
  const { data: saved, error } = await supabase
    .from("messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      type: "in",
      content: input.content,
      sender_type: "client",
      sent_by: "Cliente",
      status: "delivered",
      created_at: now,
      media_url: input.mediaUrl || null,
      media_type: input.mediaType || null,
      mime_type: input.mimeType || null,
      caption: input.caption || null,
      metadata: {
        channel: "app",
        ...(input.metadata || {}),
      },
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      location_name: input.locationName || null,
      location_address: input.locationAddress || null,
    })
    .select()
    .single();

  if (error) {
    logMessageEvent(
      "db_insert_failed",
      {
        direction: "in",
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        error: error.message,
      },
      "error",
    );
    throw error;
  }

  logMessageEvent("db_insert", {
    direction: "in",
    conversationId: input.conversationId,
    messageId: saved.id,
    senderType: "client",
    mediaType: input.mediaType ?? null,
    preview: previewMessage(input.content),
  });

  const { data: conversation } = await supabase
    .from("conversations")
    .select("unread")
    .eq("id", input.conversationId)
    .maybeSingle();

  await supabase
    .from("conversations")
    .update({
      preview: input.content.slice(0, 180),
      updated_at: now,
      last_message_at: now,
      unread: Number(conversation?.unread || 0) + 1,
      status: "abierto",
    })
    .eq("id", input.conversationId)
    .eq("organization_id", input.organizationId);

  return saved;
};

export const findOrCreateClientByPhone = async (
  supabase: SupabaseClient,
  organizationId: string,
  phone: string,
  name?: string | null,
) => {
  const normalized = normalizeClientPhone(phone);
  if (!normalized) {
    throw new Error("El teléfono no es válido");
  }

  const existing = await findClientByWhatsappOrPhone(supabase, {
    organizationId,
    whatsappId: normalized,
    phone: normalized,
  });
  if (existing) return existing;

  const displayName = name?.trim() || `Cliente ${normalized.slice(-4)}`;
  return insertClientRow(supabase, {
    organizationId,
    name: displayName,
    phone: normalized,
    whatsappId: normalized,
    waName: name?.trim() || null,
    account: "Prospecto",
    plan: null,
    zone: null,
  });
};

export const findOrCreateOpenConversation = async (
  supabase: SupabaseClient,
  organizationId: string,
  clientId: number,
  customerPhone: string,
) => {
  const { data: existing, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .in("status", ["abierto", "proceso"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      status: "abierto",
      human_mode: false,
      unread: 0,
      preview: null,
      label_ids: [],
      agent_id: null,
      customer_phone: customerPhone,
      last_message_at: now,
      updated_at: now,
      created_at: now,
    })
    .select("*")
    .single();

  if (createError || !created) {
    const { data: raced } = await supabase
      .from("conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .in("status", ["abierto", "proceso"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (raced) return raced;
    throw createError || new Error("No se pudo abrir la conversación");
  }
  return created;
};

const enqueueAppChatPush = (task: () => Promise<void>) => {
  const run = () => {
    void task().catch((error) => {
      console.warn(`${LOG_PREFIX} push_unhandled`, {
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

const readMessageChannel = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object") return "app";
  const channel = (metadata as Record<string, unknown>).channel;
  return typeof channel === "string" && channel.trim() ? channel.trim() : "app";
};

export const notifyAppDevices = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: number;
    messageId: number;
    type: string;
    senderType: string;
    channel?: string | null;
    content: string;
    mediaType?: ChannelMediaType | null;
    latitude?: number | null;
    longitude?: number | null;
  },
) => {
  try {
    if (input.type !== "out") return;
    if (input.senderType !== "agent" && input.senderType !== "bot") return;
    const channel = readMessageChannel({ channel: input.channel });
    if (channel !== "app") return;

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("client_id")
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (conversationError) {
      console.warn(`${LOG_PREFIX} push_conversation_lookup_failed`, {
        conversationId: input.conversationId,
        error: conversationError.message,
      });
      return;
    }

    const clientId = conversation?.client_id;
    if (!clientId) return;

    const { data: devices, error } = await supabase
      .from("app_devices")
      .select("id, push_token, platform")
      .eq("organization_id", input.organizationId)
      .eq("client_id", clientId);

    if (error) {
      if (error.code !== "PGRST205" && error.code !== "42P01") {
        console.warn(`${LOG_PREFIX} devices_lookup_failed`, error.message);
      }
      return;
    }

    const tokens = [
      ...new Set(
        (devices || [])
          .map((row) => String(row.push_token || "").trim())
          .filter(Boolean),
      ),
    ];
    if (!tokens.length) return;

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

    const { tickets } = await sendExpoPushMessages(messages);
    const staleTokens = collectUnregisteredExpoTokens(tokens, tickets);
    if (staleTokens.length) {
      const { error: deleteError } = await supabase
        .from("app_devices")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("push_token", staleTokens);
      if (deleteError) {
        console.warn(`${LOG_PREFIX} stale_token_delete_failed`, deleteError.message);
      } else {
        console.log(`${LOG_PREFIX} stale_tokens_deleted`, {
          conversationId: input.conversationId,
          count: staleTokens.length,
        });
      }
    }

    console.log(`${LOG_PREFIX} push_sent`, {
      conversationId: input.conversationId,
      messageId: input.messageId,
      devices: tokens.length,
      stale: staleTokens.length,
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} push_failed`, {
      conversationId: input.conversationId,
      messageId: input.messageId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
};
