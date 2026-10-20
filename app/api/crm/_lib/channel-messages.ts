import type { SupabaseClient } from "@supabase/supabase-js";
import { CRM_COLORS } from "@/app/crm/_lib/constants";
import { getInitials } from "@/app/crm/_lib/formatters";

const LOG_PREFIX = "[APP_CHANNEL]";

export const normalizeChannelPhone = (phone: string) => phone.replace(/\D/g, "");

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

const defaultColor = CRM_COLORS[0];

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

  if (error) throw error;

  await supabase
    .from("conversations")
    .update({
      preview: input.content.slice(0, 180),
      updated_at: now,
      last_message_at: now,
    })
    .eq("id", input.conversationId)
    .eq("organization_id", input.organizationId);

  void notifyAppDevices(supabase, {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    preview: input.content.slice(0, 180),
    direction: "out",
  });

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

  if (error) throw error;

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
  const normalized = normalizeChannelPhone(phone);
  if (normalized.length < 8) {
    throw new Error("El teléfono no es válido");
  }

  const { data: byPhone, error: byPhoneError } = await supabase
    .from("clients")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", normalized)
    .limit(1)
    .maybeSingle();
  if (byPhoneError) throw byPhoneError;
  if (byPhone) return byPhone;

  const { data: byWhatsapp, error: byWhatsappError } = await supabase
    .from("clients")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("whatsapp_id", normalized)
    .limit(1)
    .maybeSingle();
  if (byWhatsappError) throw byWhatsappError;
  if (byWhatsapp) return byWhatsapp;

  const displayName = name?.trim() || `Cliente ${normalized.slice(-4)}`;
  const { data: created, error: createError } = await supabase
    .from("clients")
    .insert({
      organization_id: organizationId,
      name: displayName,
      phone: normalized,
      account: "Prospecto",
      color: defaultColor.color,
      bg: defaultColor.bg,
      initials: getInitials(displayName),
    })
    .select("*")
    .single();

  if (!createError && created) return created;

  const { data: raced } = await supabase
    .from("clients")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", normalized)
    .limit(1)
    .maybeSingle();
  if (raced) return raced;
  throw createError || new Error("No se pudo crear el cliente");
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

export const notifyAppDevices = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: number;
    preview: string;
    direction: "in" | "out";
  },
) => {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("client_id")
    .eq("id", input.conversationId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

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

  const tokens = (devices || [])
    .map((row) => String(row.push_token || "").trim())
    .filter(Boolean);
  if (!tokens.length) return;

  const serverKey = process.env.FCM_SERVER_KEY?.trim();
  if (!serverKey) {
    console.log(`${LOG_PREFIX} push_skipped_no_fcm`, {
      conversationId: input.conversationId,
      devices: tokens.length,
    });
    return;
  }

  await Promise.all(
    tokens.map(async (token) => {
      try {
        await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            Authorization: `key=${serverKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title: input.direction === "out" ? "Nuevo mensaje" : "Mensaje enviado",
              body: input.preview,
            },
            data: {
              conversation_id: String(input.conversationId),
              organization_id: input.organizationId,
            },
          }),
        });
      } catch (pushError) {
        console.warn(`${LOG_PREFIX} push_failed`, {
          error: pushError instanceof Error ? pushError.message : "unknown",
        });
      }
    }),
  );
};
