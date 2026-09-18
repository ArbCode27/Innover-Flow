import { NextRequest, NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getInitials, toJsonSafeText } from "@/app/crm/_lib/formatters";
import { normalizeStorageMimeType } from "../_lib/media-mime";
import { replyToConversationWithAi } from "@/app/api/crm/ai/_lib/reply-to-conversation";
import { refreshClientBillingFromWispro } from "@/app/api/crm/_lib/wispro-billing-refresh";
import { findOrganizationByWhatsappPhoneId } from "@/app/api/crm/_lib/organization-integrations";
import {
  withOptionalOrganizationWispro,
  withOrganizationWispro,
} from "@/app/api/crm/_lib/wispro-api";
import { withOrganizationWhatsapp } from "@/app/api/crm/_lib/whatsapp-runtime";

// Fuerza runtime Node.js explícitamente: el handler usa Buffer y fetch a Graph API.
export const runtime = "nodejs";
/** Media download + AI reply via after() (no queue/worker). */
export const maxDuration = 60;

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;
const GRAPH_API_VERSION = "v19.0";
const DEFAULT_STORAGE_BUCKET = "whatsapp-media";

const DEFAULT_CLIENT_COLOR = "#4f8ef7";
const DEFAULT_CLIENT_BG = "rgba(79,142,247,.15)";
const WEBHOOK_LOG_PREFIX = "[WHATSAPP_WEBHOOK]";

type SupportedIncomingMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location";

type IncomingPayload = {
  organizationId: string;
  accessToken: string;
  messageId: string;
  messageType: SupportedIncomingMessageType;
  from: string;
  content: string;
  preview: string;
  waName: string | null;
  mediaId: string | null;
  mediaType: "audio" | "image" | "video" | "document" | "location" | null;
  mimeType: string | null;
  caption: string | null;
  metadata: Record<string, unknown> | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  locationAddress: string | null;
  timestamp: string;
  phoneNumberId: string | null;
};

const normalizePhone = (value: string) => value.replace(/\D/g, "");

const maskPhone = (value: string) => {
  if (value.length <= 4) return value;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const parseWhatsappTimestamp = (value: unknown) => {
  const parsedTimestamp = Number(value);
  return Number.isFinite(parsedTimestamp)
    ? new Date(parsedTimestamp * 1000).toISOString()
    : new Date().toISOString();
};

const getSupabaseServerClient = () =>
  createClient(
    getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

const isUniqueViolation = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      String((error as { code?: string }).code) === "23505",
  );

const resolveClientDisplayName = (waName: string | null) => {
  const safe = toJsonSafeText(waName)?.trim() || "";
  return safe || "Número desconocido";
};

const sanitizePathSegment = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const inferExtensionFromMime = (mimeType: string | null, fallback = "bin") => {
  const normalizedMimeType = (mimeType || "").toLowerCase();
  if (!normalizedMimeType.includes("/")) return fallback;
  const [, subtype] = normalizedMimeType.split("/");
  if (!subtype) return fallback;
  return subtype.split(";")[0].replace(/[^a-z0-9]/g, "") || fallback;
};

const resolveMediaBucket = (messageType: SupportedIncomingMessageType) => {
  const legacy = process.env.SUPABASE_WHATSAPP_MEDIA_BUCKET;
  switch (messageType) {
    case "audio":
      return (
        process.env.SUPABASE_WHATSAPP_AUDIO_BUCKET ||
        legacy ||
        DEFAULT_STORAGE_BUCKET
      );
    case "image":
      return (
        process.env.SUPABASE_WHATSAPP_IMAGE_BUCKET ||
        legacy ||
        DEFAULT_STORAGE_BUCKET
      );
    case "video":
      return (
        process.env.SUPABASE_WHATSAPP_VIDEO_BUCKET ||
        legacy ||
        DEFAULT_STORAGE_BUCKET
      );
    case "document":
      return (
        process.env.SUPABASE_WHATSAPP_DOCUMENT_BUCKET ||
        legacy ||
        DEFAULT_STORAGE_BUCKET
      );
    default:
      return legacy || DEFAULT_STORAGE_BUCKET;
  }
};

const fetchWhatsappMediaDownloadUrl = async (
  mediaId: string,
  accessToken: string,
) => {
  const mediaResponse = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const mediaData = await mediaResponse.json();
  if (!mediaResponse.ok || mediaData.error || !mediaData.url) {
    throw new Error(
      mediaData.error?.message ||
        "No se pudo obtener la URL de descarga del archivo",
    );
  }

  return {
    downloadUrl: mediaData.url as string,
    mimeType: (mediaData.mime_type as string | undefined) || null,
  };
};

const downloadWhatsappMedia = async (
  downloadUrl: string,
  accessToken: string,
) => {
  const fileResponse = await fetch(downloadUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!fileResponse.ok) {
    throw new Error(
      "No se pudo descargar el archivo multimedia desde WhatsApp",
    );
  }

  const contentType = fileResponse.headers.get("content-type");
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  return { buffer, contentType };
};

const storeIncomingMedia = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  input: {
    organizationId: string;
    conversationId: number;
    messageType: SupportedIncomingMessageType;
    mediaId: string;
    mimeType: string | null;
    originalFilename?: string | null;
    accessToken: string;
  },
) => {
  const mediaInfo = await fetchWhatsappMediaDownloadUrl(
    input.mediaId,
    input.accessToken,
  );
  const { buffer, contentType } = await downloadWhatsappMedia(
    mediaInfo.downloadUrl,
    input.accessToken,
  );
  const rawMimeType =
    input.mimeType ||
    mediaInfo.mimeType ||
    contentType ||
    "application/octet-stream";
  const resolvedMimeType = normalizeStorageMimeType(rawMimeType);
  const extension = inferExtensionFromMime(resolvedMimeType, "bin");
  const mediaFolder =
    input.messageType === "image"
      ? "images"
      : input.messageType === "audio"
        ? "audio"
        : input.messageType === "video"
          ? "videos"
          : "documents";

  const safeOriginalFilename = sanitizePathSegment(
    input.originalFilename || "",
  );
  const filename = safeOriginalFilename
    ? `${Date.now()}-${safeOriginalFilename}`
    : `${Date.now()}-${input.mediaId}.${extension}`;
  const storagePath = `${input.organizationId}/${mediaFolder}/${input.conversationId}/${filename}`;

  const bucket = resolveMediaBucket(input.messageType);
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: resolvedMimeType,
      upsert: false,
    });

  if (storageError) throw storageError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return {
    publicUrl,
    mimeType: resolvedMimeType,
    storagePath,
    bucket,
    sizeBytes: buffer.byteLength,
  };
};

const findOrCreateClient = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  organizationId: string,
  from: string,
  waName: string | null,
) => {
  const profileWaName = toJsonSafeText(waName)?.trim() || null;
  const displayName = resolveClientDisplayName(waName);

  const { data: byWhatsappId, error: byWhatsappIdError } = await supabase
    .from("clients")
    .select("*")
    .eq("whatsapp_id", from)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();

  if (byWhatsappIdError) throw byWhatsappIdError;
  if (byWhatsappId) {
    console.log(`${WEBHOOK_LOG_PREFIX} client_found_by_whatsapp_id`, {
      clientId: byWhatsappId.id,
      from: maskPhone(from),
    });
    return byWhatsappId;
  }

  const { data: byPhone, error: byPhoneError } = await supabase
    .from("clients")
    .select("*")
    .eq("phone", from)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();

  if (byPhoneError) throw byPhoneError;
  if (byPhone) {
    const { data: updatedClient, error: updateClientError } = await supabase
      .from("clients")
      .update({
        whatsapp_id: byPhone.whatsapp_id || from,
        wa_name: byPhone.wa_name || profileWaName,
      })
      .eq("id", byPhone.id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (updateClientError) throw updateClientError;
    console.log(`${WEBHOOK_LOG_PREFIX} client_found_by_phone_and_updated`, {
      clientId: updatedClient.id,
      from: maskPhone(from),
    });
    return updatedClient;
  }

  // Prefer the active conversation's linked client (may have wispro_id but missing whatsapp_id).
  const { data: activeByPhone, error: activeByPhoneError } = await supabase
    .from("conversations")
    .select("id, client_id")
    .eq("customer_phone", from)
    .eq("organization_id", organizationId)
    .in("status", ["abierto", "proceso"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeByPhoneError) {
    console.warn(`${WEBHOOK_LOG_PREFIX} active_conversation_phone_lookup_failed`, {
      from: maskPhone(from),
      error: activeByPhoneError.message,
    });
  } else if (activeByPhone?.client_id) {
    const { data: linkedClient, error: linkedClientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", activeByPhone.client_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (linkedClientError) throw linkedClientError;

    if (linkedClient) {
      const { data: patchedClient, error: patchError } = await supabase
        .from("clients")
        .update({
          whatsapp_id: linkedClient.whatsapp_id || from,
          phone: linkedClient.phone || from,
          wa_name: linkedClient.wa_name || profileWaName,
        })
        .eq("id", linkedClient.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (patchError) throw patchError;

      console.log(`${WEBHOOK_LOG_PREFIX} client_recovered_from_active_conversation`, {
        clientId: patchedClient.id,
        conversationId: activeByPhone.id,
        from: maskPhone(from),
        hasWispro: Boolean(patchedClient.wispro_id),
      });
      return patchedClient;
    }
  }

  const buildClientRow = (name: string, storedWaName: string | null) => ({
    organization_id: organizationId,
    name,
    phone: from,
    whatsapp_id: from,
    wa_name: storedWaName,
    account: "Prospecto",
    plan: null,
    zone: null,
    color: DEFAULT_CLIENT_COLOR,
    bg: DEFAULT_CLIENT_BG,
    initials: getInitials(name),
    created_at: new Date().toISOString(),
  });

  const { data: createdClient, error: createClientError } = await supabase
    .from("clients")
    .insert(buildClientRow(displayName, profileWaName))
    .select("*")
    .single();

  if (!createClientError && createdClient) {
    console.log(`${WEBHOOK_LOG_PREFIX} client_created`, {
      clientId: createdClient.id,
      from: maskPhone(from),
      initials: createdClient.initials,
    });
    return createdClient;
  }

  const findExistingClientAfterRace = async () => {
    const { data: byId, error: byIdError } = await supabase
      .from("clients")
      .select("*")
      .eq("whatsapp_id", from)
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();
    if (byIdError) throw byIdError;
    if (byId) return byId;

    const { data: byPhoneAgain, error: byPhoneAgainError } = await supabase
      .from("clients")
      .select("*")
      .eq("phone", from)
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();
    if (byPhoneAgainError) throw byPhoneAgainError;
    return byPhoneAgain;
  };

  // Race: another webhook created the same phone/whatsapp_id first.
  if (isUniqueViolation(createClientError)) {
    const racedClient = await findExistingClientAfterRace();
    if (racedClient) {
      console.log(`${WEBHOOK_LOG_PREFIX} client_create_race_recovered`, {
        clientId: racedClient.id,
        from: maskPhone(from),
      });
      return racedClient;
    }
  }

  // Degraded retry: drop profile fields so a bad name never blocks inbound messages.
  console.warn(`${WEBHOOK_LOG_PREFIX} client_create_retry_degraded`, {
    from: maskPhone(from),
    error:
      createClientError &&
      typeof createClientError === "object" &&
      "message" in createClientError
        ? String((createClientError as { message?: string }).message)
        : "unknown_create_error",
  });

  const { data: degradedClient, error: degradedError } = await supabase
    .from("clients")
    .insert(buildClientRow("Número desconocido", null))
    .select("*")
    .single();

  if (!degradedError && degradedClient) {
    console.log(`${WEBHOOK_LOG_PREFIX} client_created_degraded`, {
      clientId: degradedClient.id,
      from: maskPhone(from),
    });
    return degradedClient;
  }

  if (isUniqueViolation(degradedError)) {
    const racedClient = await findExistingClientAfterRace();
    if (racedClient) return racedClient;
  }

  throw degradedError || createClientError;
};

const patchConversationPhoneIfNeeded = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  conversation: Record<string, unknown>,
  customerPhone: string,
  organizationId: string,
) => {
  const needsPhoneUpdate =
    !String(conversation.customer_phone || "").trim() && Boolean(customerPhone);

  if (!needsPhoneUpdate) return conversation;

  const { data: patchedConversation, error: patchError } = await supabase
    .from("conversations")
    .update({ customer_phone: customerPhone })
    .eq("id", conversation.id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (patchError) throw patchError;
  return patchedConversation as Record<string, unknown>;
};

const findActiveConversation = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  clientId: number,
  organizationId: string,
) => {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("client_id", clientId)
    .eq("organization_id", organizationId)
    .in("status", ["abierto", "proceso"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Returns the single active conversation for a client.
 * `created` is true only when this call inserted a brand-new row (for rollback).
 */
const findOrCreateActiveConversation = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  clientId: number,
  organizationId: string,
  messageTimestamp: string,
  phoneNumberId: string | null,
  customerPhone: string,
): Promise<{ conversation: Record<string, unknown>; created: boolean }> => {
  const existing = await findActiveConversation(
    supabase,
    clientId,
    organizationId,
  );
  if (existing) {
    const patched = await patchConversationPhoneIfNeeded(
      supabase,
      existing as Record<string, unknown>,
      customerPhone,
      organizationId,
    );
    console.log(`${WEBHOOK_LOG_PREFIX} active_conversation_found`, {
      conversationId: patched.id,
      clientId,
      status: patched.status,
    });
    return { conversation: patched, created: false };
  }

  const { data: createdConversation, error: createConversationError } =
    await supabase
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
        agent_control: null,
        customer_phone: customerPhone,
        wa_phone_number_id: phoneNumberId,
        last_message_at: messageTimestamp,
        updated_at: messageTimestamp,
        created_at: messageTimestamp,
      })
      .select("*")
      .single();

  if (!createConversationError && createdConversation) {
    console.log(`${WEBHOOK_LOG_PREFIX} active_conversation_created`, {
      conversationId: createdConversation.id,
      clientId,
      status: createdConversation.status,
    });
    return {
      conversation: createdConversation as Record<string, unknown>,
      created: true,
    };
  }

  // Race: another webhook created the active conversation first.
  if (isUniqueViolation(createConversationError)) {
    const raced = await findActiveConversation(
      supabase,
      clientId,
      organizationId,
    );
    if (raced) {
      const patched = await patchConversationPhoneIfNeeded(
        supabase,
        raced as Record<string, unknown>,
        customerPhone,
        organizationId,
      );
      console.log(`${WEBHOOK_LOG_PREFIX} active_conversation_race_recovered`, {
        conversationId: patched.id,
        clientId,
      });
      return { conversation: patched, created: false };
    }
  }

  throw createConversationError;
};

const deleteEmptyConversationIfNew = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  conversationId: number,
  created: boolean,
  organizationId: string,
) => {
  if (!created) return;

  const { count, error: countError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId);

  if (countError) {
    console.warn(`${WEBHOOK_LOG_PREFIX} orphan_count_failed`, {
      conversationId,
      error: countError.message,
    });
    return;
  }

  if ((count ?? 0) > 0) return;

  const { error: deleteError } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("organization_id", organizationId);

  if (deleteError) {
    console.warn(`${WEBHOOK_LOG_PREFIX} orphan_delete_failed`, {
      conversationId,
      error: deleteError.message,
    });
    return;
  }

  console.warn(`${WEBHOOK_LOG_PREFIX} orphan_conversation_deleted`, {
    conversationId,
  });
};

const upsertIncomingMessage = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  payload: IncomingPayload,
) => {
  const {
    organizationId,
    accessToken,
    messageId,
    messageType,
    from,
    content,
    preview,
    waName,
    mediaId,
    mediaType,
    mimeType,
    caption,
    metadata,
    latitude,
    longitude,
    locationName,
    locationAddress,
    timestamp,
    phoneNumberId,
  } = payload;

  const { data: existingMessage, error: existingMessageError } = await supabase
    .from("messages")
    .select("id")
    .eq("wa_message_id", messageId)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();

  if (existingMessageError) throw existingMessageError;
  if (existingMessage) {
    console.log(`${WEBHOOK_LOG_PREFIX} duplicate_message_ignored`, {
      messageId,
      messageType,
    });
    return {
      ignored: true as const,
      reason: "duplicate_before_processing",
      messageType,
      messageId,
      clientId: null as number | null,
      conversationId: null as number | null,
      dbMessageId: null as number | null,
      humanMode: null as boolean | null,
      botEngine: null as string | null,
      mediaUrl: null as string | null,
    };
  }

  const client = await findOrCreateClient(
    supabase,
    organizationId,
    from,
    waName,
  );
  const { conversation, created: conversationCreated } =
    await findOrCreateActiveConversation(
      supabase,
      client.id,
      organizationId,
      timestamp,
      phoneNumberId,
      from,
    );

  const conversationId = Number(conversation.id);
  const conversationHumanMode = Boolean(conversation.human_mode);
  const conversationBotEngine =
    typeof conversation.bot_engine === "string"
      ? conversation.bot_engine
      : null;
  const conversationUnread = Number(conversation.unread ?? 0);

  try {
    let persistedMediaUrl: string | null = null;
    let persistedMimeType: string | null = mimeType;
    let mergedMetadata: Record<string, unknown> | null = metadata
      ? { ...metadata }
      : null;

    if (
      mediaId &&
      mediaType &&
      ["audio", "image", "video", "document"].includes(mediaType)
    ) {
      const originalFilename =
        typeof metadata?.filename === "string"
          ? String(metadata.filename)
          : null;

      try {
        const storedMedia = await storeIncomingMedia(supabase, {
          organizationId,
          conversationId,
          messageType,
          mediaId,
          mimeType,
          originalFilename,
          accessToken,
        });

        persistedMediaUrl = storedMedia.publicUrl;
        persistedMimeType = storedMedia.mimeType;
        mergedMetadata = {
          ...(mergedMetadata || {}),
          media_id: mediaId,
          storage_path: storedMedia.storagePath,
          storage_bucket: storedMedia.bucket,
          size_bytes: storedMedia.sizeBytes,
        };
      } catch (mediaError) {
        // Soft-fail media: still persist the inbound message so we never leave
        // an empty conversation after create.
        console.warn(`${WEBHOOK_LOG_PREFIX} media_store_soft_failed`, {
          conversationId,
          messageId,
          mediaType,
          error:
            mediaError instanceof Error
              ? mediaError.message
              : "unknown_media_error",
        });
        mergedMetadata = {
          ...(mergedMetadata || {}),
          media_id: mediaId,
          media_store_failed: true,
          media_store_error:
            mediaError instanceof Error
              ? mediaError.message
              : "unknown_media_error",
        };
      }
    }

    const { data: insertedMessage, error: insertMessageError } = await supabase
      .from("messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        wa_message_id: messageId,
        type: "in",
        content,
        sender_type: "client",
        sent_by: waName,
        status: "delivered",
        media_url: persistedMediaUrl,
        media_type: mediaType,
        mime_type: persistedMimeType,
        caption,
        metadata: mergedMetadata,
        latitude,
        longitude,
        location_name: locationName,
        location_address: locationAddress,
        created_at: timestamp,
      })
      .select("id, conversation_id, wa_message_id")
      .single();

    if (insertMessageError) {
      if (isUniqueViolation(insertMessageError)) {
        // Another webhook won the insert; drop our empty row if we just created it.
        await deleteEmptyConversationIfNew(
          supabase,
          conversationId,
          conversationCreated,
          organizationId,
        );
        return {
          ignored: true as const,
          reason: "duplicate_on_insert",
          messageType,
          messageId,
          clientId: client.id,
          conversationId,
          dbMessageId: null as number | null,
          humanMode: conversationHumanMode,
          botEngine: conversationBotEngine,
          mediaUrl: persistedMediaUrl,
        };
      }

      throw insertMessageError;
    }

    console.log(`${WEBHOOK_LOG_PREFIX} message_inserted`, {
      messageId: insertedMessage?.id,
      waMessageId: insertedMessage?.wa_message_id,
      conversationId: insertedMessage?.conversation_id,
      messageType,
    });

    const expectedUnread = conversationUnread + 1;
    const { data: updatedConversation, error: updateConversationError } =
      await supabase
        .from("conversations")
        .update({
          preview,
          unread: expectedUnread,
          updated_at: timestamp,
          last_message_at: timestamp,
          wa_phone_number_id: phoneNumberId,
          customer_phone: from,
        })
        .eq("id", conversationId)
        .eq("organization_id", organizationId)
        .select(
          "id, unread, preview, updated_at, last_message_at, customer_phone",
        )
        .single();

    if (updateConversationError) throw updateConversationError;
    console.log(`${WEBHOOK_LOG_PREFIX} conversation_updated_after_message`, {
      conversationId: updatedConversation?.id,
      unread: updatedConversation?.unread,
      expectedUnread,
      preview: updatedConversation?.preview,
      updatedAt: updatedConversation?.updated_at,
      lastMessageAt: updatedConversation?.last_message_at,
    });

    console.log(`${WEBHOOK_LOG_PREFIX} message_saved`, {
      messageId,
      messageType,
      clientId: client.id,
      conversationId,
      mediaType,
      hasMediaUrl: Boolean(persistedMediaUrl),
      preview,
    });

    // Re-evaluate debt + service before AI / CRM agents read the client.
    // Soft-fail + TTL: never blocks inbound message persistence.
    const wisproId = String(client.wispro_id || "").trim();
    if (wisproId) {
      const billingRefresh = await withOrganizationWispro(
        organizationId,
        () =>
          refreshClientBillingFromWispro({
            supabase,
            clientId: Number(client.id),
            wisproId,
            envoicing:
              typeof client.envoicing === "string" ? client.envoicing : null,
            clientName: typeof client.name === "string" ? client.name : null,
            conversationId,
            conversationCreated,
          }),
      ).catch((error) => ({
        refreshed: false,
        reason: error instanceof Error ? error.message : "wispro_not_available",
      }));

      console.log(`${WEBHOOK_LOG_PREFIX} billing_refresh_result`, {
        messageId,
        conversationId,
        clientId: client.id,
        conversationCreated,
        ...billingRefresh,
      });
    }

    return {
      ignored: false as const,
      reason: "saved",
      messageType,
      messageId,
      clientId: client.id,
      conversationId,
      dbMessageId: insertedMessage?.id ?? null,
      humanMode: conversationHumanMode,
      botEngine: conversationBotEngine,
      mediaUrl: persistedMediaUrl,
    };
  } catch (error) {
    await deleteEmptyConversationIfNew(
      supabase,
      conversationId,
      conversationCreated,
      organizationId,
    );
    throw error;
  }
};

const verifyTokenSafe = (token: string | null): boolean => {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "";
  if (!token || !expected) return false;
  const tokenBuf = Buffer.from(token, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (tokenBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
};

const verifyMetaSignature = (
  rawBodyText: string,
  signatureHeader: string | null,
): boolean => {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `${WEBHOOK_LOG_PREFIX} signature_skipped: WHATSAPP_APP_SECRET is not configured in environment`,
      );
    }
    return true;
  }

  if (!signatureHeader) {
    console.error(`${WEBHOOK_LOG_PREFIX} missing_signature_header`);
    return false;
  }

  const [algo, signature] = signatureHeader.split("=");
  if (algo !== "sha256" || !signature) {
    console.error(`${WEBHOOK_LOG_PREFIX} invalid_signature_format`, { algo });
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(rawBodyText, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expectedSignature, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
};

const OPT_OUT_PATTERNS =
  /^(stop|baja|cancelar|detener|alto|no mas|no más|desuscribir)$/i;

const handleCoexistenceMessageEcho = async (
  supabase: ReturnType<typeof getSupabaseServerClient>,
  organizationConnection: {
    organizationId: string;
    config: Record<string, unknown>;
  },
  echo: Record<string, unknown>,
) => {
  const echoId = String(echo.id || "").trim();
  const rawRecipient = String(echo.to || echo.recipient_id || "").trim();
  const normalizedTo = normalizePhone(rawRecipient);
  const echoTimestamp = parseWhatsappTimestamp(String(echo.timestamp || ""));

  if (!echoId || !normalizedTo) {
    console.warn(`${WEBHOOK_LOG_PREFIX} coexistence_echo_missing_id_or_to`, {
      echoId,
      rawRecipient,
    });
    return null;
  }

  let content = "";
  const echoType = String(echo.type || "text");
  if (echoType === "text") {
    const textObj = echo.text as { body?: string } | undefined;
    content = String(textObj?.body || "").trim();
  } else if (echoType === "image") {
    const imgObj = echo.image as { caption?: string } | undefined;
    content = imgObj?.caption || "[Imagen enviada desde WhatsApp Móvil]";
  } else if (echoType === "audio") {
    content = "[Audio enviado desde WhatsApp Móvil]";
  } else if (echoType === "video") {
    const vidObj = echo.video as { caption?: string } | undefined;
    content = vidObj?.caption || "[Video enviado desde WhatsApp Móvil]";
  } else if (echoType === "document") {
    const docObj = echo.document as { filename?: string; caption?: string } | undefined;
    content =
      docObj?.filename || docObj?.caption || "[Documento enviado desde WhatsApp Móvil]";
  } else {
    content = `[Mensaje ${echoType} enviado desde WhatsApp Móvil]`;
  }

  const client = await findOrCreateClient(
    supabase,
    organizationConnection.organizationId,
    normalizedTo,
    null,
  );

  const { conversation } = await findOrCreateActiveConversation(
    supabase,
    Number(client.id),
    organizationConnection.organizationId,
    echoTimestamp,
    String(organizationConnection.config.phone_number_id || "") || null,
    normalizedTo,
  );

  const syncEchoes =
    organizationConnection.config.coexistence_sync_echoes !== false;
  if (syncEchoes) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("wa_message_id", echoId)
      .eq("organization_id", organizationConnection.organizationId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("messages").insert({
        organization_id: organizationConnection.organizationId,
        conversation_id: conversation.id,
        wa_message_id: echoId,
        type: "out",
        sender_type: "agent",
        sent_by: "WhatsApp Business App (Móvil)",
        content,
        status: "delivered",
        created_at: echoTimestamp,
      });
    }
  }

  const autoHuman =
    organizationConnection.config.coexistence_auto_human !== false;
  await supabase
    .from("conversations")
    .update({
      ...(autoHuman ? { human_mode: true } : {}),
      preview: content,
      last_message_at: echoTimestamp,
      updated_at: echoTimestamp,
    })
    .eq("id", conversation.id)
    .eq("organization_id", organizationConnection.organizationId);

  console.log(`${WEBHOOK_LOG_PREFIX} coexistence_echo_processed`, {
    echoId,
    conversationId: conversation.id,
    customerPhone: maskPhone(normalizedTo),
    autoHuman,
  });

  return { conversationId: Number(conversation.id), echoId };
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyTokenSafe(token)) {
    console.log("✅ Webhook verificado por Meta");
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const requestSummary: {
    eventType:
      | "message"
      | "status_update"
      | "message_echo"
      | "unrecognized"
      | "invalid";
    messageType: string | null;
    messageId: string | null;
    saved: boolean;
    ignored: boolean;
    reason: string | null;
    clientId: number | null;
    conversationId: number | null;
    dbMessageId: number | null;
    humanMode: boolean | null;
    status: string | null;
  } = {
    eventType: "invalid",
    messageType: null,
    messageId: null,
    saved: false,
    ignored: false,
    reason: null,
    clientId: null,
    conversationId: null,
    dbMessageId: null,
    humanMode: null,
    status: null,
  };

  try {
    console.log(`${WEBHOOK_LOG_PREFIX} request_received`, {
      method: req.method,
      url: req.url,
    });

    const rawBodyText = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    if (!verifyMetaSignature(rawBodyText, signature)) {
      console.error(`${WEBHOOK_LOG_PREFIX} signature_verification_failed`);
      return new NextResponse("Invalid Signature", { status: 401 });
    }

    let rawBody: Record<string, any>;
    try {
      rawBody = JSON.parse(rawBodyText);
    } catch {
      console.error(`${WEBHOOK_LOG_PREFIX} invalid_json_payload`);
      return new NextResponse("Invalid JSON", { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // Extraer el valor principal
    const entry = rawBody?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      requestSummary.eventType = "invalid";
      requestSummary.ignored = true;
      requestSummary.reason = "payload_without_value";
      console.log(`${WEBHOOK_LOG_PREFIX} payload_without_value_ignored`, {
        hasEntry: Boolean(entry),
        hasChanges: Boolean(changes),
      });
      return new NextResponse("OK", { status: 200 });
    }

    console.log(`${WEBHOOK_LOG_PREFIX} payload_received`, {
      hasMessages: Boolean(value.messages?.length),
      hasStatuses: Boolean(value.statuses?.length),
      phoneNumberId: value.metadata?.phone_number_id || null,
    });

    const incomingPhoneNumberId = String(
      value.metadata?.phone_number_id || "",
    ).trim();
    const organizationConnection = incomingPhoneNumberId
      ? await findOrganizationByWhatsappPhoneId(incomingPhoneNumberId)
      : null;
    if (!organizationConnection) {
      requestSummary.ignored = true;
      requestSummary.reason = "unknown_phone_number_id";
      console.warn(`${WEBHOOK_LOG_PREFIX} unknown_phone_number_id`, {
        phoneNumberId: incomingPhoneNumberId || null,
      });
      return new NextResponse("OK", { status: 200 });
    }

    // ── CASO 1: Mensaje entrante ──────────────────────────
    if (value.messages && value.messages.length > 0) {
      requestSummary.eventType = "message";
      const message = value.messages[0];
      const contact = value.contacts?.[0];
      const metadata = value.metadata;
      const normalizedFrom = normalizePhone(message.from || "");
      const messageId = String(message.id || "").trim();
      const messageType = String(
        message.type || "",
      ).trim() as SupportedIncomingMessageType;
      requestSummary.messageType = messageType || null;
      requestSummary.messageId = messageId || null;
      const waName = contact?.profile?.name || null;
      const timestamp = parseWhatsappTimestamp(message.timestamp);

      console.log(`${WEBHOOK_LOG_PREFIX} incoming_message_received`, {
        messageId,
        messageType,
        from: maskPhone(normalizedFrom),
        waName,
        timestamp,
        phoneNumberId: metadata?.phone_number_id || null,
      });

      // Detección de mensajes salientes enviados desde la app móvil (Coexistencia en messages)
      const isOutboundEcho = Boolean(
        (message as { recipient_id?: string }).recipient_id ||
          (value.metadata?.display_phone_number &&
            normalizedFrom ===
              normalizePhone(value.metadata.display_phone_number)),
      );

      if (isOutboundEcho) {
        requestSummary.eventType = "message_echo";
        const echoResult = await handleCoexistenceMessageEcho(
          supabase,
          organizationConnection,
          message as Record<string, unknown>,
        );
        if (echoResult) {
          requestSummary.saved = true;
          requestSummary.conversationId = echoResult.conversationId;
          requestSummary.reason = "coexistence_echo_saved";
        }
        console.log(`${WEBHOOK_LOG_PREFIX} request_completed`, requestSummary);
        return new NextResponse("OK", { status: 200 });
      }

      if (!normalizedFrom || !messageId) {
        requestSummary.ignored = true;
        requestSummary.reason = "invalid_message_payload";
        console.log(`${WEBHOOK_LOG_PREFIX} invalid_message_ignored`, {
          hasFrom: Boolean(normalizedFrom),
          hasMessageId: Boolean(messageId),
          rawType: message.type,
        });
        return new NextResponse("OK", { status: 200 });
      }

      const isSupportedType = [
        "text",
        "image",
        "audio",
        "video",
        "document",
        "location",
      ].includes(messageType);
      if (!isSupportedType) {
        requestSummary.ignored = true;
        requestSummary.reason = "unsupported_type";
        console.log(`${WEBHOOK_LOG_PREFIX} unsupported_type_ignored`, {
          messageId,
          messageType,
        });
        return new NextResponse("OK", { status: 200 });
      }

      let content = "";
      let preview = "";
      let mediaId: string | null = null;
      let mediaType: IncomingPayload["mediaType"] = null;
      let mimeType: string | null = null;
      let caption: string | null = null;
      let incomingMetadata: Record<string, unknown> | null = null;
      let latitude: number | null = null;
      let longitude: number | null = null;
      let locationName: string | null = null;
      let locationAddress: string | null = null;

      if (messageType === "text") {
        const body = String(message.text?.body || "").trim();
        content = body;
        preview = body;
      } else if (messageType === "image") {
        mediaId = String(message.image?.id || "").trim() || null;
        caption = String(message.image?.caption || "").trim() || null;
        mimeType = String(message.image?.mime_type || "").trim() || null;
        mediaType = "image";
        content = caption || "Imagen";
        preview = content;
      } else if (messageType === "audio") {
        mediaId = String(message.audio?.id || "").trim() || null;
        mimeType = String(message.audio?.mime_type || "").trim() || null;
        mediaType = "audio";
        content = "Audio";
        preview = "Audio";
      } else if (messageType === "video") {
        mediaId = String(message.video?.id || "").trim() || null;
        caption = String(message.video?.caption || "").trim() || null;
        mimeType = String(message.video?.mime_type || "").trim() || null;
        mediaType = "video";
        content = caption || "Video";
        preview = content;
      } else if (messageType === "document") {
        mediaId = String(message.document?.id || "").trim() || null;
        caption = String(message.document?.caption || "").trim() || null;
        const filename =
          String(message.document?.filename || "").trim() || null;
        mimeType = String(message.document?.mime_type || "").trim() || null;
        mediaType = "document";
        incomingMetadata = filename ? { filename } : null;
        content = caption || filename || "Documento";
        preview = content;
      } else if (messageType === "location") {
        mediaType = "location";
        latitude =
          typeof message.location?.latitude === "number"
            ? message.location.latitude
            : null;
        longitude =
          typeof message.location?.longitude === "number"
            ? message.location.longitude
            : null;
        locationName = String(message.location?.name || "").trim() || null;
        locationAddress =
          String(message.location?.address || "").trim() || null;
        content = locationName || locationAddress || "Ubicación compartida";
        preview = "Ubicación compartida";
      }

      if (!content.trim()) {
        requestSummary.ignored = true;
        requestSummary.reason = "empty_content";
        console.log(`${WEBHOOK_LOG_PREFIX} empty_content_ignored`, {
          messageId,
          messageType,
        });
        return new NextResponse("OK", { status: 200 });
      }

      if (
        ["image", "audio", "video", "document"].includes(messageType) &&
        !mediaId
      ) {
        requestSummary.ignored = true;
        requestSummary.reason = "missing_media_id";
        console.log(`${WEBHOOK_LOG_PREFIX} missing_media_id_ignored`, {
          messageId,
          messageType,
        });
        return new NextResponse("OK", { status: 200 });
      }

      const messageResult = await upsertIncomingMessage(supabase, {
        organizationId: organizationConnection.organizationId,
        accessToken: organizationConnection.accessToken,
        messageId,
        messageType,
        from: normalizedFrom,
        content: content.trim(),
        preview: (preview || content).trim(),
        waName,
        mediaId,
        mediaType,
        mimeType,
        caption,
        metadata: incomingMetadata,
        latitude,
        longitude,
        locationName,
        locationAddress,
        timestamp,
        phoneNumberId: metadata?.phone_number_id || null,
      });

      requestSummary.messageType = messageResult.messageType;
      requestSummary.messageId = messageResult.messageId;
      requestSummary.reason = messageResult.reason;
      requestSummary.clientId = messageResult.clientId;
      requestSummary.conversationId = messageResult.conversationId;
      requestSummary.dbMessageId = messageResult.dbMessageId;
      requestSummary.humanMode = messageResult.humanMode;
      requestSummary.ignored = messageResult.ignored;
      requestSummary.saved = !messageResult.ignored;

      const isOptOut =
        messageType === "text" && OPT_OUT_PATTERNS.test(content.trim());

      if (isOptOut && messageResult.conversationId) {
        console.log(`${WEBHOOK_LOG_PREFIX} opt_out_detected`, {
          conversationId: messageResult.conversationId,
          from: maskPhone(normalizedFrom),
        });
        await supabase
          .from("conversations")
          .update({ human_mode: true })
          .eq("id", messageResult.conversationId)
          .eq("organization_id", organizationConnection.organizationId);
      }

      // AI is the sole bot engine (Make removed).
      // Reply runs after the webhook responds so Meta gets 200 quickly.
      // human_mode never auto-replies; replyToConversationWithAi re-checks
      // before send in case an advisor takes the chat mid-run.
      if (!messageResult.ignored && messageResult.conversationId) {
        // Text + image/audio (multimodal). Video/document remain deferred.
        const aiEligible =
          !isOptOut &&
          (messageType === "text" ||
            messageType === "image" ||
            messageType === "audio");

        if (aiEligible && Boolean(messageResult.humanMode)) {
          console.log(`${WEBHOOK_LOG_PREFIX} ai_reply_skipped_human_mode`, {
            messageId,
            conversationId: messageResult.conversationId,
            messageType,
          });
        } else if (aiEligible) {
          const conversationIdForAi = messageResult.conversationId;
          const dbMessageIdForAi = messageResult.dbMessageId;

          console.log(`${WEBHOOK_LOG_PREFIX} ai_reply_scheduled`, {
            messageId,
            conversationId: conversationIdForAi,
            messageType,
            humanMode: messageResult.humanMode,
          });

          after(async () => {
            try {
              const result = await withOrganizationWhatsapp(
                organizationConnection.organizationId,
                () =>
                  withOptionalOrganizationWispro(
                    organizationConnection.organizationId,
                    () =>
                      replyToConversationWithAi(supabase, {
                        conversationId: conversationIdForAi,
                        triggerMessageId: dbMessageIdForAi,
                      }),
                  ),
              );

              console.log(`${WEBHOOK_LOG_PREFIX} ai_reply_finished`, {
                messageId,
                conversationId: conversationIdForAi,
                ok: result.ok,
                skipped: Boolean(result.skipped),
                reason: result.reason,
              });
            } catch (error) {
              console.error(`${WEBHOOK_LOG_PREFIX} ai_reply_failed`, {
                messageId,
                conversationId: conversationIdForAi,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          });
        } else {
          console.warn(`${WEBHOOK_LOG_PREFIX} ai_media_deferred`, {
            messageId,
            conversationId: messageResult.conversationId,
            messageType,
            reason: "ai_multimodal_v1_image_audio_only",
            willReplyToClient: false,
          });
        }
      }
    }

    // ── CASO 2: Status update (delivered/read/failed) ─────
    else if (value.statuses && value.statuses.length > 0) {
      requestSummary.eventType = "status_update";
      const status = value.statuses[0];

      const waMessageId = String(status.id || "").trim();
      const nextStatus = String(status.status || "").trim();
      requestSummary.messageId = waMessageId || null;
      requestSummary.status = nextStatus || null;
      requestSummary.messageType = "status_update";

      console.log(`${WEBHOOK_LOG_PREFIX} status_update_received`, {
        waMessageId,
        nextStatus,
        recipientId: status.recipient_id || null,
      });

      if (
        waMessageId &&
        ["sent", "delivered", "read", "failed"].includes(nextStatus)
      ) {
        const { error: statusUpdateError } = await supabase
          .from("messages")
          .update({ status: nextStatus })
          .eq("wa_message_id", waMessageId)
          .eq("organization_id", organizationConnection.organizationId);

        if (statusUpdateError) {
          console.error(
            `${WEBHOOK_LOG_PREFIX} status_update_failed`,
            statusUpdateError,
          );
          requestSummary.saved = false;
          requestSummary.reason = "status_update_failed";
        } else {
          console.log(`${WEBHOOK_LOG_PREFIX} status_update_saved`, {
            waMessageId,
            nextStatus,
          });
          requestSummary.saved = true;
          requestSummary.reason = "status_update_saved";
        }
      }

    // ── CASO 3: Message Echoes (Coexistencia con WhatsApp Business App) ───
    } else if (value.message_echoes && value.message_echoes.length > 0) {
      requestSummary.eventType = "message_echo";
      const echo = value.message_echoes[0];
      const echoId = String(echo.id || "").trim();
      requestSummary.messageId = echoId || null;
      requestSummary.messageType = String(echo.type || "text");

      console.log(`${WEBHOOK_LOG_PREFIX} coexistence_message_echo_received`, {
        echoId,
        type: echo.type,
        to: echo.to || echo.recipient_id,
        from: echo.from,
      });

      const echoResult = await handleCoexistenceMessageEcho(
        supabase,
        organizationConnection,
        echo as Record<string, unknown>,
      );

      if (echoResult) {
        requestSummary.saved = true;
        requestSummary.conversationId = echoResult.conversationId;
        requestSummary.reason = "coexistence_echo_saved";
      }

    } else {
      requestSummary.eventType = "unrecognized";
      requestSummary.ignored = true;
      requestSummary.reason = "unrecognized_event";
      console.log(`${WEBHOOK_LOG_PREFIX} unrecognized_event_ignored`);
    }

    console.log(`${WEBHOOK_LOG_PREFIX} request_completed`, requestSummary);
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error(
      `${WEBHOOK_LOG_PREFIX} request_summary_on_error`,
      requestSummary,
    );
    console.error(`${WEBHOOK_LOG_PREFIX} request_failed`, error);
    return new NextResponse("Error", { status: 500 });
  }
}
