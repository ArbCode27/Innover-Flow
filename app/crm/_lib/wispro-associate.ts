import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findClientByWhatsappOrPhone,
  insertClientRow,
  normalizeClientPhone,
  releaseWhatsappIdFromOthers,
} from "./client-identity";
import { getInitials } from "./formatters";
import { serializeWisproLinkForDb } from "./wispro-webhook";
import type { AssociateWisproInput, Client } from "./types";

const LOG_PREFIX = "[WISPRO_ASSOCIATE]";
const DEFAULT_PLAN = "Sin asignar";
const DEFAULT_ZONE = "Sin asignar";

const maskPhone = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 6) return digits ? "***" : null;
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
};

const createLinkId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `link_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const describeDbError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return { message: String(error || "unknown_error") };
  }

  const record = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };

  return {
    message: record.message || "unknown_error",
    code: record.code || null,
    details: record.details || null,
    hint: record.hint || null,
  };
};

const throwDbError = (
  error: { message: string } | null,
  fallback: string,
  context?: Record<string, unknown>,
) => {
  if (!error) return;

  console.error(`${LOG_PREFIX} db_error`, {
    ...context,
    fallback,
    ...describeDbError(error),
  });
  throw new Error(error.message || fallback);
};

const ensureClient = (data: Client | null, fallback: string): Client => {
  if (!data) {
    throw new Error(fallback);
  }
  return data;
};

const createAnchorClient = async (
  supabase: SupabaseClient,
  input: {
    name: string;
    phone: string;
    whatsappId?: string | null;
    waName?: string | null;
    existingClientsCount?: number;
    linkId: string;
    organizationId: string;
  },
) => {
  try {
    const created = await insertClientRow(supabase, {
      organizationId: input.organizationId,
      name: input.name,
      phone: input.phone,
      whatsappId: input.whatsappId,
      waName: input.waName,
      account: "Prospecto",
      plan: DEFAULT_PLAN,
      zone: DEFAULT_ZONE,
      existingClientsCount: input.existingClientsCount,
    });

    console.log(`${LOG_PREFIX} anchor_created`, {
      linkId: input.linkId,
      clientId: created.id,
      phone: maskPhone(input.phone),
    });
    return created;
  } catch (error) {
    throwDbError(
      error && typeof error === "object" && "message" in error
        ? (error as { message: string })
        : { message: "No se pudo crear el cliente del chat" },
      "No se pudo crear el cliente del chat",
      {
        linkId: input.linkId,
        step: "create_anchor",
        phone: maskPhone(input.phone),
      },
    );
    throw error;
  }
};

/**
 * Links Wispro to the WhatsApp chat client (single identity).
 * Never moves the conversation to a Wispro-only row without WA identity.
 */
export const associateWisproClient = async (
  supabase: SupabaseClient,
  input: AssociateWisproInput,
) => {
  const linkId = input.linkId?.trim() || createLinkId();
  const {
    organizationId,
    conversationId,
    customer,
    invoicing,
    existingClientId,
    conversationPhone,
    existingClientsCount,
    whatsappId,
    waName,
  } = input;

  const zone = customer.zone_name?.trim() || DEFAULT_ZONE;
  // CRM "plan" column stores Wispro PPP profile only (commercial name stays in envoicing).
  const plan = invoicing.pppProfile?.trim() || DEFAULT_PLAN;
  const envoicingPayload = serializeWisproLinkForDb(invoicing, customer);
  const waIdentity =
    normalizeClientPhone(whatsappId) ||
    normalizeClientPhone(conversationPhone) ||
    normalizeClientPhone(customer.phone_mobile);
  const displayWaName = waName?.trim() || null;

  console.log(`${LOG_PREFIX} started`, {
    linkId,
    conversationId,
    wisproId: customer.id,
    cedula: customer.national_identification_number,
    existingClientId: existingClientId ?? null,
    accountStatus: invoicing.accountStatus,
    serviceSuspended: Boolean(invoicing.serviceSuspended),
    hasDebt: invoicing.hasDebt,
    debt: invoicing.debt,
    conversationPhone: maskPhone(conversationPhone),
    whatsappId: maskPhone(whatsappId),
    wisproPhone: maskPhone(customer.phone_mobile),
    waIdentity: maskPhone(waIdentity),
  });

  if (!waIdentity) {
    console.warn(`${LOG_PREFIX} warn_missing_wa_identity`, {
      linkId,
      conversationId,
      risk: "webhook_may_create_new_unlinked_client",
    });
  }

  const { data: existingByWispro, error: lookupError } = await supabase
    .from("clients")
    .select("*")
    .eq("wispro_id", customer.id)
    .eq("organization_id", organizationId)
    .maybeSingle<Client>();

  throwDbError(lookupError, "No se pudo buscar el cliente en Wispro", {
    linkId,
    step: "lookup_by_wispro_id",
    wisproId: customer.id,
  });

  // 1) Resolve chat anchor: conversation client → WA/phone match → create.
  let anchor: Client | null = null;
  let anchorSource:
    | "conversation_client"
    | "whatsapp_lookup"
    | "phone_lookup"
    | "created" = "created";

  if (existingClientId) {
    const { data: currentClient, error: currentError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", existingClientId)
      .eq("organization_id", organizationId)
      .maybeSingle<Client>();

    throwDbError(currentError, "No se pudo cargar el cliente de la conversación", {
      linkId,
      step: "load_conversation_client",
      existingClientId,
    });
    if (!currentClient) {
      console.error(`${LOG_PREFIX} conversation_client_missing`, {
        linkId,
        conversationId,
        existingClientId,
      });
      throw new Error("El cliente de la conversación no existe");
    }
    anchor = currentClient;
    anchorSource = "conversation_client";
  } else {
    let found: Client | null = null;
    try {
      found = await findClientByWhatsappOrPhone(supabase, {
        organizationId,
        whatsappId,
        phone: conversationPhone,
      });
    } catch (error) {
      throwDbError(
        error && typeof error === "object" && "message" in error
          ? (error as { message: string })
          : { message: "No se pudo buscar el cliente" },
        "No se pudo buscar el cliente por WhatsApp",
        {
          linkId,
          step: "lookup_by_whatsapp_or_phone",
          phone: maskPhone(whatsappId || conversationPhone),
        },
      );
    }
    if (found) {
      anchor = found;
      anchorSource = found.whatsapp_id ? "whatsapp_lookup" : "phone_lookup";
    }
  }

  if (!anchor) {
    if (!waIdentity) {
      console.error(`${LOG_PREFIX} cannot_create_anchor_without_phone`, {
        linkId,
        conversationId,
      });
      throw new Error(
        "No hay teléfono/WhatsApp en la conversación para vincular el cliente",
      );
    }

    const anchorName =
      displayWaName ||
      customer.name.trim() ||
      "Número desconocido";

    anchor = await createAnchorClient(supabase, {
      name: anchorName,
      phone: waIdentity,
      whatsappId: waIdentity,
      waName: displayWaName,
      existingClientsCount,
      linkId,
      organizationId,
    });
    anchorSource = "created";
  }

  console.log(`${LOG_PREFIX} anchor_resolved`, {
    linkId,
    conversationId,
    anchorClientId: anchor.id,
    source: anchorSource,
    hadWispro: Boolean(anchor.wispro_id),
    priorWisproId: anchor.wispro_id || null,
    hadWhatsappId: Boolean(anchor.whatsapp_id),
    hadPhone: Boolean(anchor.phone),
    phone: maskPhone(anchor.phone),
    whatsappId: maskPhone(anchor.whatsapp_id),
  });

  if (existingByWispro && existingByWispro.id !== anchor.id) {
    console.log(`${LOG_PREFIX} wispro_shared_with_other_chat`, {
      linkId,
      otherClientId: existingByWispro.id,
      anchorClientId: anchor.id,
      wisproId: customer.id,
    });
  } else if (existingByWispro) {
    console.log(`${LOG_PREFIX} wispro_already_on_anchor`, {
      linkId,
      anchorClientId: anchor.id,
      wisproId: customer.id,
    });
  }

  // Merge Wispro + ensure WhatsApp identity on THIS row only.
  const updatePayload: Record<string, string | null> = {
    wispro_id: customer.id,
    name: customer.name,
    zone,
    plan,
    account: invoicing.accountStatus,
    envoicing: envoicingPayload,
    initials: getInitials(customer.name),
  };

  if (waIdentity) {
    if (!anchor.phone?.trim()) {
      updatePayload.phone = waIdentity;
    }
    if (!anchor.whatsapp_id?.trim()) {
      try {
        await releaseWhatsappIdFromOthers(supabase, {
          whatsappId: waIdentity,
          keepClientId: anchor.id,
        });
      } catch (error) {
        throwDbError(
          error && typeof error === "object" && "message" in error
            ? (error as { message: string })
            : { message: "No se pudo liberar el WhatsApp de stubs" },
          "No se pudo reclamar el WhatsApp del chat",
          {
            linkId,
            step: "claim_whatsapp_id",
            phone: maskPhone(waIdentity),
          },
        );
      }
      updatePayload.whatsapp_id = waIdentity;
    }
  } else if (!anchor.phone?.trim() && customer.phone_mobile?.trim()) {
    updatePayload.phone = customer.phone_mobile.trim();
  }

  if (displayWaName && !anchor.wa_name?.trim()) {
    updatePayload.wa_name = displayWaName;
  }

  console.log(`${LOG_PREFIX} client_update_payload`, {
    linkId,
    anchorClientId: anchor.id,
    keys: Object.keys(updatePayload),
    account: updatePayload.account,
    zone: updatePayload.zone,
    willSetPhone: Boolean(updatePayload.phone),
    willSetWhatsappId: Boolean(updatePayload.whatsapp_id),
    envoicingBytes: envoicingPayload.length,
  });

  const { data: updated, error: updateError } = await supabase
    .from("clients")
    .update(updatePayload)
    .eq("id", anchor.id)
    .eq("organization_id", organizationId)
    .select()
    .single<Client>();

  if (updateError) {
    console.error(`${LOG_PREFIX} client_update_failed`, {
      linkId,
      anchorClientId: anchor.id,
      wisproId: customer.id,
      account: invoicing.accountStatus,
      ...describeDbError(updateError),
    });
    throw new Error(updateError.message || "No se pudo actualizar el cliente");
  }

  const client = ensureClient(updated, "No se pudo actualizar el cliente");

  console.log(`${LOG_PREFIX} client_update_ok`, {
    linkId,
    clientId: client.id,
    wisproId: client.wispro_id || null,
    account: client.account,
    whatsappId: maskPhone(client.whatsapp_id),
    phone: maskPhone(client.phone),
    hasEnvoicing: Boolean(client.envoicing),
  });

  if (!client.wispro_id) {
    console.error(`${LOG_PREFIX} verify_failed_wispro_id_null`, {
      linkId,
      clientId: client.id,
      expectedWisproId: customer.id,
    });
    throw new Error("La vinculación no persistió el wispro_id del cliente");
  }

  // 4) Keep conversation on the chat anchor (never switch to a Wispro-only row).
  const customerPhoneForConversation =
    conversationPhone?.trim() ||
    whatsappId?.trim() ||
    client.whatsapp_id?.trim() ||
    client.phone?.trim() ||
    null;

  const { error: conversationError } = await supabase
    .from("conversations")
    .update({
      client_id: client.id,
      ...(customerPhoneForConversation
        ? { customer_phone: customerPhoneForConversation }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);

  if (conversationError) {
    console.error(`${LOG_PREFIX} conversation_update_failed`, {
      linkId,
      conversationId,
      clientId: client.id,
      customerPhone: maskPhone(customerPhoneForConversation),
      ...describeDbError(conversationError),
    });
    throw new Error(
      conversationError.message ||
        "No se pudo vincular el cliente a la conversación",
    );
  }

  console.log(`${LOG_PREFIX} conversation_update_ok`, {
    linkId,
    conversationId,
    clientId: client.id,
    customerPhone: maskPhone(customerPhoneForConversation),
  });

  console.log(`${LOG_PREFIX} completed`, {
    linkId,
    conversationId,
    clientId: client.id,
    wisproId: client.wispro_id,
    whatsappId: maskPhone(client.whatsapp_id),
    phone: maskPhone(client.phone),
    account: client.account,
    hasEnvoicing: Boolean(client.envoicing),
    anchorSource,
  });

  return client;
};

/**
 * Removes Wispro linkage from a CRM client without deleting the WhatsApp identity.
 */
export const unlinkWisproClient = async (
  supabase: SupabaseClient,
  clientId: number,
  organizationId: string,
) => {
  const linkId = createLinkId();
  console.log(`${LOG_PREFIX} unlink_started`, { linkId, clientId });

  const { data: currentClient, error: lookupError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle<Client>();

  throwDbError(lookupError, "No se pudo cargar el cliente", {
    linkId,
    clientId,
    step: "unlink_load",
  });
  if (!currentClient) {
    throw new Error("El cliente no existe");
  }

  if (!currentClient.wispro_id) {
    console.log(`${LOG_PREFIX} unlink_noop`, { linkId, clientId });
    return currentClient;
  }

  const displayName =
    currentClient.wa_name?.trim() ||
    currentClient.name?.trim() ||
    "Número desconocido";

  const { data, error } = await supabase
    .from("clients")
    .update({
      wispro_id: null,
      envoicing: null,
      account: "Prospecto",
      zone: DEFAULT_ZONE,
      name: displayName,
      initials: getInitials(displayName),
    })
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .select()
    .single<Client>();

  throwDbError(error, "No se pudo desvincular Wispro", {
    linkId,
    clientId,
    step: "unlink_update",
  });

  const unlinked = ensureClient(data, "No se pudo desvincular Wispro");
  console.log(`${LOG_PREFIX} unlink_completed`, {
    linkId,
    clientId: unlinked.id,
    priorWisproId: currentClient.wispro_id,
  });
  return unlinked;
};
