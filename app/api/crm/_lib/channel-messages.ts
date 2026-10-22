import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findClientByPhone,
  insertClientRow,
  normalizeClientPhone,
} from "@/app/crm/_lib/client-identity";
import { enqueueAppPush, notifyAppChatPush } from "@/lib/app-push";
import { logMessageEvent, previewMessage } from "@/lib/message-event-log";

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
  /** Default client. Use technician for canal de campo. */
  senderType?: "client" | "technician";
  sentBy?: string | null;
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

  enqueueAppPush(() =>
    notifyAppChatPush(supabase, {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      messageId: Number(saved.id),
      type: saved.type || "out",
      senderType: saved.sender_type || input.senderType,
      channel: "app",
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
  const senderType = input.senderType === "technician" ? "technician" : "client";
  const sentBy =
    input.sentBy?.trim() ||
    (senderType === "technician" ? "Técnico" : "Cliente");
  const { data: saved, error } = await supabase
    .from("messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      type: "in",
      content: input.content,
      sender_type: senderType,
      sent_by: sentBy,
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
    senderType,
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

  const existing = await findClientByPhone(supabase, {
    organizationId,
    phone: normalized,
  });
  if (existing) return existing;

  const displayName = name?.trim() || `Cliente ${normalized.slice(-4)}`;
  return insertClientRow(supabase, {
    organizationId,
    name: displayName,
    phone: normalized,
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
      channel: "client_app",
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

export const findOrCreateTechnicianConversation = async (
  supabase: SupabaseClient,
  organizationId: string,
  technician: {
    id: string;
    name: string;
    phone?: string | null;
  },
) => {
  const { data: existing, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("channel", "technician_app")
    .eq("technician_id", technician.id)
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
      client_id: null,
      technician_id: technician.id,
      channel: "technician_app",
      status: "abierto",
      human_mode: true,
      unread: 0,
      preview: null,
      label_ids: [],
      agent_id: null,
      customer_phone: technician.phone || technician.name,
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
      .eq("channel", "technician_app")
      .eq("technician_id", technician.id)
      .in("status", ["abierto", "proceso"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (raced) return raced;
    throw createError || new Error("No se pudo abrir el chat de campo");
  }
  return created;
};
