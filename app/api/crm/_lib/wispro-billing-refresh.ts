import type { SupabaseClient } from "@supabase/supabase-js";
import { parseClientEnvoicing } from "@/app/crm/_lib/client-profile-utils";
import { parseWisproCustomerFromEnvoicing } from "@/app/crm/_lib/wispro-webhook";
import type {
  ClientAccountStatus,
  WisproCustomer,
  WisproInvoicingSummary,
} from "@/app/crm/_lib/types";
import {
  fetchInvoicingForWisproClientId,
  WisproApiError,
} from "./wispro-api";

const LOG_PREFIX = "[WISPRO_BILLING_REFRESH]";

/** Skip Wispro when snapshot is fresher than this (except new conversations). */
export const BILLING_REFRESH_TTL_MS = 15 * 60 * 1000;

/** Soft-fail budget so the WhatsApp webhook / AI path is never blocked long. */
export const BILLING_REFRESH_TIMEOUT_MS = 8_000;

export type BillingRefreshSkipReason =
  | "no_wispro_id"
  | "fresh_within_ttl"
  | "timeout"
  | "upstream"
  | "persist_failed"
  | "invalid_client";

export type BillingRefreshResult = {
  ok: boolean;
  refreshed: boolean;
  skipped: boolean;
  reason: string;
  accountStatus?: ClientAccountStatus;
  debt?: number;
  serviceSuspended?: boolean;
  contractState?: string | null;
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("billing_refresh_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const shouldRefreshClientBilling = (input: {
  wisproId: string | null | undefined;
  envoicing?: string | null;
  conversationCreated?: boolean;
  force?: boolean;
  ttlMs?: number;
}): { refresh: boolean; reason: string } => {
  const wisproId = String(input.wisproId || "").trim();
  if (!wisproId) {
    return { refresh: false, reason: "no_wispro_id" };
  }

  if (input.force || input.conversationCreated) {
    return {
      refresh: true,
      reason: input.force ? "forced" : "conversation_created",
    };
  }

  const ttlMs =
    typeof input.ttlMs === "number" && input.ttlMs > 0
      ? input.ttlMs
      : BILLING_REFRESH_TTL_MS;

  const calculatedAt = parseClientEnvoicing(input.envoicing)?.calculatedAt;
  if (calculatedAt) {
    const ageMs = Date.now() - Date.parse(calculatedAt);
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < ttlMs) {
      return { refresh: false, reason: "fresh_within_ttl" };
    }
  }

  return { refresh: true, reason: "ttl_expired_or_missing" };
};

const buildCustomerForSerialize = (input: {
  wisproId: string;
  envoicing?: string | null;
  clientName?: string | null;
}): WisproCustomer => {
  const fromSnapshot = parseWisproCustomerFromEnvoicing(input.envoicing);
  if (fromSnapshot) return fromSnapshot;

  const cedula = parseClientEnvoicing(input.envoicing)?.cedula?.trim() || "";
  const name = String(input.clientName || "").trim() || "Cliente";

  return {
    id: input.wisproId,
    name,
    national_identification_number: cedula || "N/D",
    phone_mobile: null,
    zone_name: null,
    city: null,
    state: null,
  };
};

/** Merge live billing into envoicing JSON without dropping wisproCustomer / cedula. */
export const serializeBillingRefreshForDb = (
  invoicing: WisproInvoicingSummary,
  input: {
    wisproId: string;
    envoicing?: string | null;
    clientName?: string | null;
  },
): string => {
  let existing: Record<string, unknown> = {};
  if (input.envoicing?.trim()) {
    try {
      const parsed = JSON.parse(input.envoicing) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      existing = {};
    }
  }

  const customer = buildCustomerForSerialize(input);
  const cedula =
    customer.national_identification_number !== "N/D"
      ? customer.national_identification_number
      : typeof existing.cedula === "string"
        ? existing.cedula
        : null;

  return JSON.stringify({
    ...existing,
    debt: invoicing.debt,
    hasDebt: invoicing.hasDebt,
    serviceSuspended: Boolean(invoicing.serviceSuspended),
    contractState: invoicing.contractState ?? null,
    contractId: invoicing.contractId ?? null,
    planName: invoicing.planName ?? null,
    pppProfile: invoicing.pppProfile ?? null,
    calculatedAt: new Date().toISOString(),
    source: invoicing.snapshot,
    cedula,
    wisproCustomer: {
      id: customer.id,
      name: customer.name,
      national_identification_number:
        cedula || customer.national_identification_number,
      phone_mobile: customer.phone_mobile ?? null,
      zone_name: customer.zone_name ?? null,
      city: customer.city ?? null,
      state: customer.state ?? null,
    },
  });
};

/**
 * Re-evaluate debt + service state from Wispro and persist on the CRM client.
 * Never throws: soft-fails so webhooks / AI are not blocked.
 */
export const refreshClientBillingFromWispro = async (input: {
  supabase: SupabaseClient;
  clientId: number;
  wisproId?: string | null;
  envoicing?: string | null;
  clientName?: string | null;
  conversationId?: number | null;
  conversationCreated?: boolean;
  force?: boolean;
  ttlMs?: number;
  timeoutMs?: number;
}): Promise<BillingRefreshResult> => {
  const wisproId = String(input.wisproId || "").trim();
  const decision = shouldRefreshClientBilling({
    wisproId,
    envoicing: input.envoicing,
    conversationCreated: input.conversationCreated,
    force: input.force,
    ttlMs: input.ttlMs,
  });

  if (!decision.refresh) {
    console.log(`${LOG_PREFIX} skipped`, {
      clientId: input.clientId,
      conversationId: input.conversationId ?? null,
      conversationCreated: Boolean(input.conversationCreated),
      reason: decision.reason,
      wisproId: wisproId || null,
    });
    return {
      ok: true,
      refreshed: false,
      skipped: true,
      reason: decision.reason,
    };
  }

  if (!wisproId) {
    return {
      ok: true,
      refreshed: false,
      skipped: true,
      reason: "no_wispro_id",
    };
  }

  const timeoutMs =
    typeof input.timeoutMs === "number" && input.timeoutMs > 0
      ? input.timeoutMs
      : BILLING_REFRESH_TIMEOUT_MS;

  console.log(`${LOG_PREFIX} started`, {
    clientId: input.clientId,
    conversationId: input.conversationId ?? null,
    conversationCreated: Boolean(input.conversationCreated),
    reason: decision.reason,
    wisproId,
    timeoutMs,
  });

  try {
    const { invoicing } = await withTimeout(
      fetchInvoicingForWisproClientId(wisproId),
      timeoutMs,
    );

    const envoicingPayload = serializeBillingRefreshForDb(invoicing, {
      wisproId,
      envoicing: input.envoicing,
      clientName: input.clientName,
    });

    const planLabel =
      invoicing.pppProfile?.trim() || invoicing.planName?.trim() || "";
    const updatePayload: Record<string, string | null> = {
      account: invoicing.accountStatus,
      envoicing: envoicingPayload,
    };
    if (planLabel) {
      updatePayload.plan = planLabel;
    }

    const { data: updated, error: updateError } = await input.supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", input.clientId)
      .select("id, account, wispro_id, plan")
      .maybeSingle();

    if (updateError) {
      console.error(`${LOG_PREFIX} persist_failed`, {
        clientId: input.clientId,
        conversationId: input.conversationId ?? null,
        wisproId,
        account: invoicing.accountStatus,
        code: updateError.code ?? null,
        message: updateError.message,
      });
      return {
        ok: false,
        refreshed: false,
        skipped: false,
        reason: "persist_failed",
        accountStatus: invoicing.accountStatus,
        debt: invoicing.debt,
        serviceSuspended: invoicing.serviceSuspended,
        contractState: invoicing.contractState,
      };
    }

    if (!updated) {
      console.error(`${LOG_PREFIX} persist_missing_row`, {
        clientId: input.clientId,
        wisproId,
      });
      return {
        ok: false,
        refreshed: false,
        skipped: false,
        reason: "invalid_client",
      };
    }

    console.log(`${LOG_PREFIX} completed`, {
      clientId: input.clientId,
      conversationId: input.conversationId ?? null,
      wisproId,
      trigger: decision.reason,
      accountStatus: invoicing.accountStatus,
      debt: invoicing.debt,
      serviceSuspended: invoicing.serviceSuspended,
      contractState: invoicing.contractState,
      planName: invoicing.planName ?? null,
      pppProfile: invoicing.pppProfile ?? null,
      persistedAccount: updated.account,
    });

    return {
      ok: true,
      refreshed: true,
      skipped: false,
      reason: decision.reason,
      accountStatus: invoicing.accountStatus,
      debt: invoicing.debt,
      serviceSuspended: invoicing.serviceSuspended,
      contractState: invoicing.contractState,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "billing_refresh_failed";
    const isTimeout = message === "billing_refresh_timeout";
    const reason = isTimeout
      ? "timeout"
      : error instanceof WisproApiError
        ? "upstream"
        : "upstream";

    console.warn(`${LOG_PREFIX} soft_failed`, {
      clientId: input.clientId,
      conversationId: input.conversationId ?? null,
      wisproId,
      reason,
      error: message,
    });

    return {
      ok: false,
      refreshed: false,
      skipped: false,
      reason,
    };
  }
};
