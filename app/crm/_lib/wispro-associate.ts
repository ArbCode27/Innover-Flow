import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findClientByPhone,
  findClientByWisproId,
  insertClientRow,
  normalizeClientPhone,
} from "./client-identity";
import { getInitials } from "./formatters";
import type { AssociateWisproInput, Client } from "./types";
import { mapWisproToClientFields } from "./wispro-client-fields";

const LOG_PREFIX = "[WISPRO_ASSOCIATE]";

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

const loadClientById = async (
  supabase: SupabaseClient,
  organizationId: string,
  clientId: number,
  context: Record<string, unknown>,
) => {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle<Client>();

  throwDbError(error, "No se pudo cargar el cliente", context);
  return data;
};

/**
 * Links Wispro to the conversation client. One Wispro customer = one CRM row.
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
  } = input;

  const fields = mapWisproToClientFields(customer, invoicing);
  const phoneIdentity =
    normalizeClientPhone(conversationPhone) || fields.phone;

  console.log(`${LOG_PREFIX} started`, {
    linkId,
    conversationId,
    wisproId: fields.wisproId,
    cedula: fields.cedula,
    existingClientId: existingClientId ?? null,
    accountStatus: fields.account,
    conversationPhone: maskPhone(conversationPhone),
    wisproPhone: maskPhone(fields.phone),
  });

  let target: Client | null = null;
  let source: "wispro_lookup" | "conversation_client" | "phone_lookup" | "created" =
    "created";

  try {
    target = await findClientByWisproId(supabase, {
      organizationId,
      wisproId: fields.wisproId,
    });
    if (target) source = "wispro_lookup";
  } catch (error) {
    throwDbError(
      error && typeof error === "object" && "message" in error
        ? (error as { message: string })
        : { message: "No se pudo buscar el cliente en Wispro" },
      "No se pudo buscar el cliente en Wispro",
      { linkId, step: "lookup_by_wispro_id", wisproId: fields.wisproId },
    );
  }

  if (!target && existingClientId) {
    const currentClient = await loadClientById(
      supabase,
      organizationId,
      existingClientId,
      { linkId, step: "load_conversation_client", existingClientId },
    );
    if (!currentClient) {
      throw new Error("El cliente de la conversación no existe");
    }
    target = currentClient;
    source = "conversation_client";
  }

  if (!target && phoneIdentity) {
    try {
      target = await findClientByPhone(supabase, {
        organizationId,
        phone: phoneIdentity,
      });
      if (target) source = "phone_lookup";
    } catch (error) {
      throwDbError(
        error && typeof error === "object" && "message" in error
          ? (error as { message: string })
          : { message: "No se pudo buscar el cliente" },
        "No se pudo buscar el cliente por teléfono",
        { linkId, step: "lookup_by_phone", phone: maskPhone(phoneIdentity) },
      );
    }
  }

  if (!target) {
    if (!phoneIdentity) {
      throw new Error(
        "No hay teléfono en Wispro ni en la conversación para vincular el cliente",
      );
    }

    target = await insertClientRow(supabase, {
      organizationId,
      name: fields.name,
      phone: phoneIdentity,
      cedula: fields.cedula,
      account: fields.account,
      plan: fields.plan,
      zone: fields.zone,
      wisproId: fields.wisproId,
      envoicing: fields.envoicing,
      existingClientsCount,
    });
    source = "created";
  } else {
    const updatePayload = {
      wispro_id: fields.wisproId,
      name: fields.name,
      zone: fields.zone,
      plan: fields.plan,
      account: fields.account,
      envoicing: fields.envoicing,
      initials: getInitials(fields.name),
      cedula: fields.cedula || target.cedula || null,
      phone: target.phone?.trim() || phoneIdentity || fields.phone,
    };

    const { data: updated, error: updateError } = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", target.id)
      .eq("organization_id", organizationId)
      .select()
      .single<Client>();

    if (updateError) {
      console.error(`${LOG_PREFIX} client_update_failed`, {
        linkId,
        clientId: target.id,
        wisproId: fields.wisproId,
        ...describeDbError(updateError),
      });
      throw new Error(updateError.message || "No se pudo actualizar el cliente");
    }

    target = ensureClient(updated, "No se pudo actualizar el cliente");
  }

  if (!target.wispro_id) {
    throw new Error("La vinculación no persistió el wispro_id del cliente");
  }

  console.log(`${LOG_PREFIX} client_ready`, {
    linkId,
    clientId: target.id,
    source,
    wisproId: target.wispro_id,
    phone: maskPhone(target.phone),
    account: target.account,
  });

  const customerPhoneForConversation =
    conversationPhone?.trim() || target.phone?.trim() || null;

  const { error: conversationError } = await supabase
    .from("conversations")
    .update({
      client_id: target.id,
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
      clientId: target.id,
      ...describeDbError(conversationError),
    });
    throw new Error(
      conversationError.message ||
        "No se pudo vincular el cliente a la conversación",
    );
  }

  console.log(`${LOG_PREFIX} completed`, {
    linkId,
    conversationId,
    clientId: target.id,
    wisproId: target.wispro_id,
    source,
  });

  return target;
};

export const unlinkWisproClient = async (
  supabase: SupabaseClient,
  clientId: number,
  organizationId: string,
) => {
  const linkId = createLinkId();
  console.log(`${LOG_PREFIX} unlink_started`, { linkId, clientId });

  const currentClient = await loadClientById(supabase, organizationId, clientId, {
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

  const displayName = currentClient.name?.trim() || "Número desconocido";

  const { data, error } = await supabase
    .from("clients")
    .update({
      wispro_id: null,
      envoicing: null,
      account: "Prospecto",
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
