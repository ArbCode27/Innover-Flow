import { normalizeWisproCustomer } from "@/app/crm/_lib/wispro-webhook";
import type {
  WisproCustomer,
  WisproInvoicingSummary,
  WisproSearchResult,
} from "@/app/crm/_lib/types";
import { AsyncLocalStorage } from "async_hooks";
import { getSupabaseAdmin } from "./supabase-admin";
import { decryptIntegrationSecret } from "./integration-secrets";

const LOG_PREFIX = "[WISPRO_API]";
const DEFAULT_BASE_URL = "https://www.cloud.wispro.co/api/v1";
const REQUEST_TIMEOUT_MS = 10_000;

type WisproConfig = { token: string; baseUrl: string };
const wisproConfigStorage = new AsyncLocalStorage<WisproConfig>();

export class WisproApiError extends Error {
  readonly status: number;
  readonly code: "config" | "upstream" | "unauthorized" | "invalid_response";

  constructor(
    message: string,
    options: {
      status: number;
      code: WisproApiError["code"];
      cause?: unknown;
    },
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "WisproApiError";
    this.status = options.status;
    this.code = options.code;
  }
}

const getWisproConfig = () => {
  const organizationConfig = wisproConfigStorage.getStore();
  if (organizationConfig) {
    if (!organizationConfig.token) {
      throw new WisproApiError(
        "Wispro no está conectado para esta organización",
        { status: 503, code: "config" },
      );
    }
    return organizationConfig;
  }

  const token = process.env.WISPRO_API_TOKEN?.trim();
  if (!token) {
    throw new WisproApiError(
      "WISPRO_API_TOKEN no está configurado en el servidor",
      { status: 503, code: "config" },
    );
  }

  const baseUrl = (
    process.env.WISPRO_API_BASE_URL?.trim() || DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  return { token, baseUrl };
};

export const withOrganizationWispro = async <T>(
  organizationId: string,
  callback: () => Promise<T>,
): Promise<T> => {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_integrations")
    .select("config, credentials_encrypted, status")
    .eq("organization_id", organizationId)
    .eq("provider", "wispro")
    .maybeSingle();

  if (error) throw error;
  if (!data?.credentials_encrypted || data.status !== "connected") {
    throw new WisproApiError(
      "Wispro no está conectado para esta organización",
      { status: 503, code: "config" },
    );
  }

  const config = (data.config || {}) as Record<string, unknown>;
  const baseUrl = String(config.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const token = decryptIntegrationSecret(data.credentials_encrypted);
  return wisproConfigStorage.run({ token, baseUrl }, callback);
};

export const withOptionalOrganizationWispro = async <T>(
  organizationId: string,
  callback: () => Promise<T>,
): Promise<T> => {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_integrations")
    .select("config, credentials_encrypted, status")
    .eq("organization_id", organizationId)
    .eq("provider", "wispro")
    .maybeSingle();
  if (error) throw error;
  if (!data?.credentials_encrypted || data.status !== "connected") {
    return wisproConfigStorage.run(
      { token: "", baseUrl: DEFAULT_BASE_URL },
      callback,
    );
  }
  const config = (data.config || {}) as Record<string, unknown>;
  return wisproConfigStorage.run(
    {
      token: decryptIntegrationSecret(data.credentials_encrypted),
      baseUrl: String(config.base_url || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    },
    callback,
  );
};

const parseAmount = (value: unknown): number => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const extractDataRecords = (payload: unknown): unknown[] => {
  if (!payload || typeof payload !== "object") return [];

  const root = payload as { data?: unknown; status?: number };
  if (Array.isArray(root.data)) return root.data;
  if (root.data && typeof root.data === "object") return [root.data];
  return [];
};

export type WisproCurrentAccount = {
  id: string;
  balance_amount: number;
  credit_amount: number;
  invoice_balance_amount: number;
  created_at: string | null;
  updated_at: string | null;
};

const extractDataObject = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { data?: unknown };
  if (!root.data || typeof root.data !== "object" || Array.isArray(root.data)) {
    return null;
  }
  return root.data as Record<string, unknown>;
};

const wisproGet = async (
  path: string,
  query: Record<string, string>,
): Promise<unknown> => {
  const { token, baseUrl } = getWisproConfig();
  const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: token,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} request_failed`, {
      path,
      error: error instanceof Error ? error.message : error,
    });
    throw new WisproApiError("No se pudo conectar con Wispro", {
      status: 502,
      code: "upstream",
      cause: error,
    });
  }

  const rawBody = await response.text();
  let payload: unknown = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error(`${LOG_PREFIX} invalid_json`, {
        path,
        status: response.status,
      });
      throw new WisproApiError("La respuesta de Wispro no es válida", {
        status: 502,
        code: "invalid_response",
      });
    }
  }

  if (response.status === 401 || response.status === 403) {
    console.error(`${LOG_PREFIX} unauthorized`, { path, status: response.status });
    throw new WisproApiError("Wispro rechazó las credenciales de API", {
      status: 502,
      code: "unauthorized",
    });
  }

  if (!response.ok) {
    console.error(`${LOG_PREFIX} upstream_error`, {
      path,
      status: response.status,
    });
    throw new WisproApiError("No se pudo consultar Wispro. Intenta de nuevo.", {
      status: 502,
      code: "upstream",
    });
  }

  return payload;
};

/**
 * Official Wispro source for pending client balance.
 * GET /clients/{uuid}/current_account
 * @see https://doc.cloud.wispro.co/reference/clientsidcurrent_account
 */
export const getClientCurrentAccount = async (
  wisproClientId: string,
): Promise<WisproCurrentAccount> => {
  const clientId = wisproClientId.trim();
  if (!clientId) {
    throw new WisproApiError(
      "wispro_id es requerido para consultar cuenta corriente",
      { status: 400, code: "invalid_response" },
    );
  }

  const payload = await wisproGet(
    `/clients/${encodeURIComponent(clientId)}/current_account`,
    {},
  );

  const row = extractDataObject(payload);
  if (!row) {
    throw new WisproApiError(
      "Wispro no devolvió la cuenta corriente del cliente",
      { status: 502, code: "invalid_response" },
    );
  }

  return {
    id: String(row.id || clientId),
    balance_amount: parseAmount(row.balance_amount),
    credit_amount: parseAmount(row.credit_amount),
    invoice_balance_amount: parseAmount(row.invoice_balance_amount),
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
};

const wisproPost = async (
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> => {
  const requestBodyLog = { ...body };
  const { token, baseUrl } = getWisproConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} post_failed`, {
      path,
      body: requestBodyLog,
      error: error instanceof Error ? error.message : error,
    });
    throw new WisproApiError("No se pudo conectar con Wispro", {
      status: 502,
      code: "upstream",
      cause: error,
    });
  }

  const rawBody = await response.text();
  let payload: unknown = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error(`${LOG_PREFIX} post_invalid_json`, {
        path,
        body: requestBodyLog,
        status: response.status,
      });
      throw new WisproApiError("La respuesta de Wispro no es válida", {
        status: 502,
        code: "invalid_response",
      });
    }
  }

  if (response.status === 401 || response.status === 403) {
    console.error(`${LOG_PREFIX} post_unauthorized`, {
      path,
      body: requestBodyLog,
      status: response.status,
    });
    throw new WisproApiError("Wispro rechazó las credenciales de API", {
      status: 502,
      code: "unauthorized",
    });
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? String((payload as { message: string }).message)
        : "No se pudo completar la operación en Wispro";

    console.error(`${LOG_PREFIX} post_upstream_error`, {
      path,
      body: requestBodyLog,
      status: response.status,
      message,
    });
    throw new WisproApiError(message, {
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: "upstream",
    });
  }

  if (payload && typeof payload === "object") {
    const status = Number((payload as { status?: unknown }).status);
    if (Number.isFinite(status) && status >= 400) {
      const message =
        "message" in payload &&
        typeof (payload as { message?: unknown }).message === "string"
          ? String((payload as { message: string }).message)
          : "Wispro no pudo completar la operación";

      console.error(`${LOG_PREFIX} post_body_error`, {
        path,
        body: requestBodyLog,
        status,
        message,
      });
      throw new WisproApiError(message, {
        status,
        code: status === 401 || status === 403 ? "unauthorized" : "upstream",
      });
    }
  }

  return payload;
};

export type WisproContract = {
  id: string;
  public_id: number | null;
  client_id: string | null;
  state: string | null;
  plan_id: string | null;
  /** Commercial plan name when Wispro embeds it or after enrichment. */
  plan_name: string | null;
  server_configuration_id: string | null;
  ppp_profile_id: string | null;
  /** PPP profile name when Wispro embeds it or after enrichment. */
  ppp_profile_name: string | null;
  pppoe_username: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WisproInvoice = {
  id: string;
  client_id: string | null;
  contract_id: string | null;
  client_national_identification_number: string | null;
  invoice_number: string | null;
  state: string | null;
  amount: number;
  balance: number;
  issued_at: string | null;
  first_due_date: string | null;
  /** Billing period end (`to`), useful when issued_at is missing. */
  period_to: string | null;
  concept: string | null;
};

export type WisproPaymentPromise = {
  id: string;
  valid_until: string;
  contract_id: string;
  created_at: string | null;
  updated_at: string | null;
};

export type WisproInvoicingPayment = {
  id: string;
  client_id: string;
  amount: number;
  payment_date: string;
  state: string | null;
  transaction_code: string | null;
  comment: string | null;
  raw: unknown;
};

export type CreateWisproInvoicingPaymentInput = {
  clientId: string;
  amount: number;
  paymentDate: string;
  transactionCode?: string | null;
  comment?: string | null;
  /** When set, Wispro applies the payment to these invoices. */
  invoiceIds?: string[] | null;
};

export type CreatePaymentPromiseResult =
  | {
      ok: true;
      created: true;
      promise: WisproPaymentPromise;
      contract: WisproContract;
      validUntil: string;
    }
  | {
      ok: false;
      created: false;
      reason:
        | "no_contract"
        | "service_active"
        | "payment_incomplete"
        | "upstream"
        | "config"
        | "invalid";
      error: string;
    };

const readNestedName = (
  value: unknown,
  keys: string[] = ["name"],
): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};

const normalizeContract = (record: unknown): WisproContract | null => {
  if (!record || typeof record !== "object") return null;
  const row = record as Record<string, unknown>;
  const id = String(row.id || "").trim();
  if (!id) return null;

  const planId = row.plan_id ? String(row.plan_id) : null;
  const pppProfileId = row.ppp_profile_id ? String(row.ppp_profile_id) : null;

  return {
    id,
    public_id:
      typeof row.public_id === "number"
        ? row.public_id
        : Number.isFinite(Number(row.public_id))
          ? Number(row.public_id)
          : null,
    client_id: row.client_id ? String(row.client_id) : null,
    state: row.state ? String(row.state) : null,
    plan_id: planId,
    plan_name:
      readNestedName(row.plan_name) ||
      readNestedName(row.plan) ||
      (typeof row.plan_name === "string" ? row.plan_name.trim() : null) ||
      null,
    server_configuration_id: row.server_configuration_id
      ? String(row.server_configuration_id)
      : null,
    ppp_profile_id: pppProfileId,
    ppp_profile_name:
      readNestedName(row.ppp_profile_name) ||
      readNestedName(row.ppp_profile) ||
      (typeof row.ppp_profile_name === "string"
        ? row.ppp_profile_name.trim()
        : null) ||
      null,
    pppoe_username: row.pppoe_username ? String(row.pppoe_username) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
};

const normalizeInvoice = (record: unknown): WisproInvoice | null => {
  if (!record || typeof record !== "object") return null;
  const row = record as Record<string, unknown>;
  const id = String(row.id || "").trim();
  if (!id) return null;

  const amount = parseAmount(row.amount);
  const balanceRaw = row.balance;
  const balance =
    balanceRaw === undefined || balanceRaw === null
      ? amount
      : parseAmount(balanceRaw);

  return {
    id,
    client_id: row.client_id ? String(row.client_id) : null,
    contract_id: row.contract_id ? String(row.contract_id) : null,
    client_national_identification_number: row.client_national_identification_number
      ? String(row.client_national_identification_number)
      : null,
    invoice_number: row.invoice_number ? String(row.invoice_number) : null,
    state: row.state ? String(row.state).trim().toLowerCase() : null,
    amount,
    balance,
    issued_at: row.issued_at ? String(row.issued_at) : null,
    first_due_date: row.first_due_date ? String(row.first_due_date) : null,
    period_to: row.to ? String(row.to) : null,
    concept: row.concept ? String(row.concept) : null,
  };
};

const normalizeContractState = (state: string | null | undefined) =>
  String(state || "")
    .trim()
    .toLowerCase();

/**
 * Wispro contract states that always qualify for payment promises (reactivation).
 * Active contracts may also qualify when the registered payment covers the full debt.
 * @see https://doc.cloud.wispro.co/reference/contracts
 */
export const PROMISE_ELIGIBLE_CONTRACT_STATES = new Set(["disabled"]);

/** USD slack for BCV conversion / rounding when deciding if a payment is complete. */
export const DEFAULT_FULL_PAYMENT_TOLERANCE_USD = 0.5;

export const isContractSuspendedForPromise = (
  state: string | null | undefined,
): boolean => PROMISE_ELIGIBLE_CONTRACT_STATES.has(normalizeContractState(state));

/**
 * True when amount covers debt within tolerance (or there is no debt to cover).
 */
export const isFullPayment = (
  amountUsd: number,
  debtUsd: number,
  toleranceUsd = DEFAULT_FULL_PAYMENT_TOLERANCE_USD,
): boolean => {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return false;
  const debt = Number.isFinite(debtUsd) ? Math.max(0, debtUsd) : 0;
  const tolerance =
    Number.isFinite(toleranceUsd) && toleranceUsd >= 0
      ? toleranceUsd
      : DEFAULT_FULL_PAYMENT_TOLERANCE_USD;
  return roundMoney(amountUsd) + roundMoney(tolerance) >= roundMoney(debt);
};

/**
 * Pick the contract for a payment promise:
 * 1) Prefer suspended (`disabled`) — always eligible.
 * 2) Else, if payment is complete, use preferred active contract.
 * 3) Else skip (caller maps to service_active / payment_incomplete).
 */
export const resolveContractForPaymentPromise = (
  contracts: WisproContract[],
  options?: {
    amountUsd?: number | null;
    debtUsd?: number | null;
    fullPaymentToleranceUsd?: number;
  },
): {
  contract: WisproContract | null;
  skipReason: "service_active" | "payment_incomplete" | null;
  fullPayment: boolean | null;
} => {
  const suspended = resolveSuspendedContractForPromise(contracts);
  if (suspended) {
    return { contract: suspended, skipReason: null, fullPayment: null };
  }

  const amountUsd = options?.amountUsd;
  const debtUsd = options?.debtUsd;
  const hasPaymentContext =
    typeof amountUsd === "number" &&
    Number.isFinite(amountUsd) &&
    typeof debtUsd === "number" &&
    Number.isFinite(debtUsd);

  if (!hasPaymentContext) {
    return { contract: null, skipReason: "service_active", fullPayment: null };
  }

  const fullPayment = isFullPayment(
    amountUsd,
    debtUsd,
    options?.fullPaymentToleranceUsd,
  );
  if (!fullPayment) {
    return {
      contract: null,
      skipReason: "payment_incomplete",
      fullPayment: false,
    };
  }

  // No outstanding debt on an active line — nothing to protect with a promise.
  if (roundMoney(Math.max(0, debtUsd)) <= 0) {
    return {
      contract: null,
      skipReason: "service_active",
      fullPayment: true,
    };
  }

  const preferred = resolvePreferredContract(contracts);
  if (!preferred) {
    return {
      contract: null,
      skipReason: "service_active",
      fullPayment: true,
    };
  }

  return { contract: preferred, skipReason: null, fullPayment: true };
};

const CONTRACT_STATE_PRIORITY: Record<string, number> = {
  enabled: 0,
  alerted: 1,
  degraded: 2,
  disabled: 3,
};

const contractRecency = (contract: WisproContract) =>
  Date.parse(contract.updated_at || contract.created_at || "") || 0;

/** Prefer active/healthier contracts (general CRM use). */
export const resolvePreferredContract = (
  contracts: WisproContract[],
): WisproContract | null => {
  if (!contracts.length) return null;

  return [...contracts].sort((left, right) => {
    const leftPriority =
      CONTRACT_STATE_PRIORITY[normalizeContractState(left.state)] ?? 99;
    const rightPriority =
      CONTRACT_STATE_PRIORITY[normalizeContractState(right.state)] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return contractRecency(right) - contractRecency(left);
  })[0];
};

/**
 * Pick a suspended contract for payment-promise creation.
 * Newest `disabled` contract wins when several exist.
 */
export const resolveSuspendedContractForPromise = (
  contracts: WisproContract[],
): WisproContract | null => {
  const suspended = contracts.filter((contract) =>
    isContractSuspendedForPromise(contract.state),
  );
  if (!suspended.length) return null;

  return [...suspended].sort(
    (left, right) => contractRecency(right) - contractRecency(left),
  )[0];
};

/** Suspended if any contract is Wispro `disabled`. */
export const resolveServiceSuspended = (contracts: WisproContract[]): boolean =>
  contracts.some((contract) => isContractSuspendedForPromise(contract.state));

/** Prefer suspended contract state for messaging; else preferred active contract. */
export const resolvePrimaryContractState = (
  contracts: WisproContract[],
): string | null => {
  const suspended = resolveSuspendedContractForPromise(contracts);
  if (suspended) {
    return normalizeContractState(suspended.state) || "disabled";
  }
  const preferred = resolvePreferredContract(contracts);
  return preferred ? normalizeContractState(preferred.state) || null : null;
};

export const buildAccountStatusFromService = (input: {
  hasDebt: boolean;
  serviceSuspended: boolean;
}): WisproInvoicingSummary["accountStatus"] => {
  if (input.serviceSuspended) return "Suspendido";
  if (input.hasDebt) return "Con deuda";
  return "Al día";
};

/**
 * Client-facing debt from current_account.balance_amount (Innover business rule).
 * Wispro typically stores a negative balance when the subscriber owes money;
 * a positive balance is credit (no debt to collect).
 */
export const resolveDebtFromCurrentAccount = (
  account: WisproCurrentAccount | null,
): number => {
  const balanceAmount = account?.balance_amount ?? 0;
  if (balanceAmount < 0) {
    return roundMoney(Math.abs(balanceAmount));
  }
  return 0;
};

/**
 * Map current_account.balance_amount → CRM invoicing summary.
 * Optional contracts enrich suspension detection (Wispro contract.state).
 */
export const buildInvoicingSummaryFromCurrentAccount = (
  account: WisproCurrentAccount | null,
  options?: {
    contracts?: WisproContract[] | null;
    preferredContract?: WisproContract | null;
  },
): WisproInvoicingSummary => {
  const debt = resolveDebtFromCurrentAccount(account);
  const hasDebt = debt > 0;
  const contracts = options?.contracts ?? [];
  const serviceSuspended = resolveServiceSuspended(contracts);
  const contractState = resolvePrimaryContractState(contracts);
  const preferred =
    options?.preferredContract ?? resolvePreferredContract(contracts);

  return {
    debt,
    hasDebt,
    serviceSuspended,
    contractState,
    contractId: preferred?.id ?? null,
    planName: preferred?.plan_name?.trim() || null,
    pppProfile: preferred?.ppp_profile_name?.trim() || null,
    accountStatus: buildAccountStatusFromService({ hasDebt, serviceSuspended }),
    snapshot: account
      ? {
          invoiceIndex: 0,
          itemIndex: 0,
          gross_amount: debt,
          amount: debt,
        }
      : null,
  };
};

/**
 * Resolve commercial plan name via GET /plans/{id}.
 * Soft-fails to null on upstream errors.
 */
export const getPlanNameById = async (
  planId: string,
): Promise<string | null> => {
  const id = planId.trim();
  if (!id) return null;

  try {
    const payload = await wisproGet(`/plans/${encodeURIComponent(id)}`, {});
    const row =
      extractDataObject(payload) ||
      (() => {
        const records = extractDataRecords(payload);
        return records[0] && typeof records[0] === "object"
          ? (records[0] as Record<string, unknown>)
          : null;
      })();
    const name = row?.name ? String(row.name).trim() : "";
    return name || null;
  } catch (error) {
    console.warn(`${LOG_PREFIX} plan_lookup_failed`, {
      planId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/**
 * Resolve PPP profile name from MikroTik-scoped list.
 * GET /mikrotiks/{server_configuration_id}/ppp_profiles
 * Falls back to GET /ppp_profiles/{id} when the scoped list fails.
 */
export const getPppProfileName = async (input: {
  mikrotikId?: string | null;
  pppProfileId: string;
}): Promise<string | null> => {
  const pppProfileId = input.pppProfileId.trim();
  const mikrotikId = input.mikrotikId?.trim() || "";
  if (!pppProfileId) return null;

  if (mikrotikId) {
    try {
      const payload = await wisproGet(
        `/mikrotiks/${encodeURIComponent(mikrotikId)}/ppp_profiles`,
        {},
      );
      const records = extractDataRecords(payload);
      for (const record of records) {
        if (!record || typeof record !== "object") continue;
        const row = record as Record<string, unknown>;
        if (String(row.id || "").trim() !== pppProfileId) continue;
        const name = row.name ? String(row.name).trim() : "";
        if (name) return name;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} ppp_profile_mikrotik_lookup_failed`, {
        mikrotikId,
        pppProfileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const payload = await wisproGet(
      `/ppp_profiles/${encodeURIComponent(pppProfileId)}`,
      {},
    );
    const row =
      extractDataObject(payload) ||
      (() => {
        const records = extractDataRecords(payload);
        return records[0] && typeof records[0] === "object"
          ? (records[0] as Record<string, unknown>)
          : null;
      })();
    const name = row?.name ? String(row.name).trim() : "";
    return name || null;
  } catch (error) {
    console.warn(`${LOG_PREFIX} ppp_profile_lookup_failed`, {
      mikrotikId: mikrotikId || null,
      pppProfileId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const getContractById = async (
  contractId: string,
): Promise<WisproContract | null> => {
  const id = contractId.trim();
  if (!id) return null;

  try {
    const payload = await wisproGet(`/contracts/${encodeURIComponent(id)}`, {});
    const row =
      extractDataObject(payload) ||
      (() => {
        const records = extractDataRecords(payload);
        return records[0] && typeof records[0] === "object"
          ? (records[0] as Record<string, unknown>)
          : null;
      })();
    return normalizeContract(row);
  } catch (error) {
    console.warn(`${LOG_PREFIX} contract_by_id_failed`, {
      contractId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/**
 * Fill plan_name / ppp_profile_name on the preferred contract.
 * Soft-fails individual lookups so billing never blocks on profile enrichment.
 */
export const enrichContractPlanAndPpp = async (
  contract: WisproContract | null,
): Promise<WisproContract | null> => {
  if (!contract) return null;

  // Prefer a fresh single-contract GET: list endpoints sometimes omit PPP fields.
  const detailed = (await getContractById(contract.id)) || contract;
  const next: WisproContract = { ...detailed };
  const tasks: Promise<void>[] = [];

  if (!next.plan_name && next.plan_id) {
    tasks.push(
      getPlanNameById(next.plan_id).then((name) => {
        if (name) next.plan_name = name;
      }),
    );
  }

  if (!next.ppp_profile_name && next.ppp_profile_id) {
    tasks.push(
      getPppProfileName({
        mikrotikId: next.server_configuration_id,
        pppProfileId: next.ppp_profile_id,
      }).then((name) => {
        if (name) next.ppp_profile_name = name;
      }),
    );
  }

  if (tasks.length) {
    await Promise.all(tasks);
  }

  return next;
};

export const listContractsByClientId = async (
  wisproClientId: string,
): Promise<WisproContract[]> => {
  const payload = await wisproGet("/contracts", {
    client_id_eq: wisproClientId.trim(),
  });
  return extractDataRecords(payload)
    .map(normalizeContract)
    .filter((contract): contract is WisproContract => contract !== null);
};

export const listContractsByCedula = async (
  cedula: string,
): Promise<WisproContract[]> => {
  const digits = normalizeDocumentDigits(cedula);
  const candidates = digits
    ? buildVeDocumentCandidates(digits)
    : [cedula.trim()].filter(Boolean);

  if (!candidates.length) return [];

  // Prefer exact input / digits first, then prefixed variants.
  for (const candidate of candidates) {
    const payload = await wisproGet("/contracts", {
      client_national_identification_number_eq: candidate,
    });
    const contracts = extractDataRecords(payload)
      .map(normalizeContract)
      .filter((contract): contract is WisproContract => contract !== null);
    if (contracts.length) return contracts;
  }

  return [];
};

/**
 * List pending (unpaid) invoices for a Wispro client.
 * Official filter: client_national_identification_number_eq + state_eq=pending.
 * Do NOT use client_id_eq — Wispro ignores it and returns unrelated invoices.
 * @see https://doc.cloud.wispro.co/reference/invoices
 * @example /invoicing/invoices?client_national_identification_number_eq=17927238&state_eq=pending
 */
export const listPendingInvoicesForClient = async (input: {
  wisproClientId?: string | null;
  cedula?: string | null;
}): Promise<WisproInvoice[]> => {
  const digits = normalizeDocumentDigits(input.cedula || "");
  if (!digits) {
    console.warn(`${LOG_PREFIX} invoices_skipped_missing_cedula`, {
      wisproClientId: input.wisproClientId?.trim() || null,
    });
    return [];
  }

  // Prefer bare digits (as in Wispro UI / docs), then V/E/J/G variants.
  const candidates = buildVeDocumentCandidates(digits);
  const invoicesById = new Map<string, WisproInvoice>();

  for (const candidate of candidates) {
    try {
      const payload = await wisproGet("/invoicing/invoices", {
        client_national_identification_number_eq: candidate,
        state_eq: "pending",
      });
      const rows = extractDataRecords(payload)
        .map(normalizeInvoice)
        .filter((invoice): invoice is WisproInvoice => invoice !== null);

      for (const invoice of rows) {
        if (invoice.balance <= 0) continue;
        // Safety: drop rows that clearly belong to another document.
        const invoiceDoc = normalizeDocumentDigits(
          invoice.client_national_identification_number || "",
        );
        if (invoiceDoc && invoiceDoc !== digits) continue;
        invoicesById.set(invoice.id, invoice);
      }

      if (invoicesById.size) {
        console.log(`${LOG_PREFIX} invoices_ok`, {
          cedula: candidate,
          count: invoicesById.size,
        });
        break;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} invoices_lookup_failed`, {
        candidate,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return [...invoicesById.values()];
};

/** Newest pending invoice date (issued_at → period_to → first_due_date). */
export const resolveLatestPendingInvoiceDate = (
  invoices: WisproInvoice[],
): string | null => {
  let bestIso: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;

  for (const invoice of invoices) {
    const raw = (
      invoice.issued_at ||
      invoice.period_to ||
      invoice.first_due_date ||
      ""
    ).trim();
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      bestIso = raw.slice(0, 10);
    }
  }

  return bestIso;
};

/**
 * Cache pending-invoice dates by cédula for CRM payment lists.
 * Soft-fails per client so one upstream error never blanks the table.
 */
export const resolveLatestPendingInvoiceDatesForClients = async (
  clients: Array<{
    wisproClientId?: string | null;
    cedula?: string | null;
  }>,
): Promise<Map<string, string | null>> => {
  const cache = new Map<string, string | null>();
  const jobs = new Map<string, string>();

  for (const client of clients) {
    const digits = normalizeDocumentDigits(client.cedula || "");
    if (!digits || jobs.has(digits)) continue;
    jobs.set(digits, digits);
  }

  await Promise.all(
    [...jobs.entries()].map(async ([digits]) => {
      const key = `c:${digits}`;
      try {
        const invoices = await listPendingInvoicesForClient({ cedula: digits });
        cache.set(key, resolveLatestPendingInvoiceDate(invoices));
      } catch (error) {
        console.warn(`${LOG_PREFIX} latest_invoice_date_failed`, {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
        cache.set(key, null);
      }
    }),
  );

  return cache;
};

/** Invoice lookups are keyed by cédula (Wispro invoice filter). */
export const latestInvoiceCacheKeyForPayment = (payment: {
  wispro_client_id?: string | null;
  cedula?: string | null;
}): string | null => {
  const digits = normalizeDocumentDigits(payment.cedula || "");
  return digits ? `c:${digits}` : null;
};

/** Default duration for Wispro payment promises (auto + CRM UI). */
export const DEFAULT_PAYMENT_PROMISE_HOURS = 48;

/** valid_until as YYYY-MM-DD, +hours from now in America/Caracas calendar day. */
export const buildPaymentPromiseValidUntil = (
  hours = DEFAULT_PAYMENT_PROMISE_HOURS,
): string => {
  const now = new Date();
  const target = new Date(now.getTime() + hours * 60 * 60 * 1000);
  // Format in America/Caracas to match ISP local day boundaries.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(target);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return target.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
};

export const createPaymentPromise = async (
  contractId: string,
  validUntil: string,
): Promise<WisproPaymentPromise> => {
  const payload = await wisproPost(
    `/contracts/${encodeURIComponent(contractId)}/payment_promises`,
    { valid_until: validUntil },
  );

  const records = extractDataRecords(payload);
  const row =
    records[0] && typeof records[0] === "object"
      ? (records[0] as Record<string, unknown>)
      : null;

  const id = String(row?.id || "").trim();
  if (!id) {
    throw new WisproApiError("Wispro no devolvió la promesa de pago", {
      status: 502,
      code: "invalid_response",
    });
  }

  return {
    id,
    valid_until: String(row?.valid_until || validUntil),
    contract_id: String(row?.contract_id || contractId),
    created_at: row?.created_at ? String(row.created_at) : null,
    updated_at: row?.updated_at ? String(row.updated_at) : null,
  };
};

const toWisproPaymentDate = (value: string) => {
  const dateOnly = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return `${dateOnly}T12:00:00-04:00`;
  }
  return new Date().toISOString();
};

/**
 * POST /invoicing/payments.
 * With `invoice_ids`, Wispro applies the payment to those invoices.
 * Without them, Wispro credits the amount to the client's current account.
 */
export const createWisproInvoicingPayment = async (
  input: CreateWisproInvoicingPaymentInput,
): Promise<WisproInvoicingPayment> => {
  const clientId = input.clientId.trim();
  if (!clientId) {
    throw new WisproApiError("El cliente Wispro es requerido", {
      status: 400,
      code: "invalid_response",
    });
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new WisproApiError("El monto del pago no es válido", {
      status: 400,
      code: "invalid_response",
    });
  }

  const invoiceIds = [
    ...new Set(
      (input.invoiceIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];

  const payload = await wisproPost("/invoicing/payments", {
    client_id: clientId,
    amount: roundMoney(input.amount),
    payment_date: toWisproPaymentDate(input.paymentDate),
    transaction_code: input.transactionCode?.trim() || undefined,
    comment: input.comment?.trim() || undefined,
    ...(invoiceIds.length ? { invoice_ids: invoiceIds } : {}),
  });

  const records = extractDataRecords(payload);
  const row =
    records[0] && typeof records[0] === "object"
      ? (records[0] as Record<string, unknown>)
      : null;

  const id = String(row?.id || "").trim();
  if (!id) {
    throw new WisproApiError("Wispro no devolvió el pago creado", {
      status: 502,
      code: "invalid_response",
    });
  }

  return {
    id,
    client_id: String(row?.client_id || clientId),
    amount: parseAmount(row?.amount ?? input.amount),
    payment_date: String(row?.payment_date || input.paymentDate),
    state: row?.state ? String(row.state) : null,
    transaction_code: row?.transaction_code
      ? String(row.transaction_code)
      : input.transactionCode?.trim() || null,
    comment: row?.comment ? String(row.comment) : input.comment?.trim() || null,
    raw: payload,
  };
};

/**
 * Resolve contract + create a payment promise. Never throws for business skips;
 * throws only unexpected programmer issues — callers should catch WisproApiError.
 *
 * Eligibility:
 * - Suspended (`disabled`): always create (reactivation).
 * - Active: create only when amountUsd covers debtUsd within tolerance.
 * - CRM UI (no amount/debt): suspended-only, same as before.
 */
export const createPaymentPromiseForClient = async (input: {
  wisproClientId?: string | null;
  cedula?: string | null;
  hours?: number;
  /** Payment amount in USD (AI auto-submit). Required with debtUsd for active contracts. */
  amountUsd?: number | null;
  /** Outstanding debt in USD from Wispro current_account. */
  debtUsd?: number | null;
  fullPaymentToleranceUsd?: number;
}): Promise<CreatePaymentPromiseResult> => {
  const hours =
    input.hours && input.hours > 0 ? input.hours : DEFAULT_PAYMENT_PROMISE_HOURS;
  const wisproClientId = input.wisproClientId?.trim() || "";
  const cedula = input.cedula?.trim() || "";

  if (!wisproClientId && !cedula) {
    return {
      ok: false,
      created: false,
      reason: "invalid",
      error: "Se requiere wispro_id o cédula",
    };
  }

  try {
    let contracts: WisproContract[] = [];
    if (wisproClientId) {
      contracts = await listContractsByClientId(wisproClientId);
    }
    if (!contracts.length && cedula) {
      contracts = await listContractsByCedula(cedula);
    }

    if (!contracts.length) {
      console.warn(`${LOG_PREFIX} promise_skipped_no_contract`, {
        wisproClientId: wisproClientId || null,
        cedula: cedula || null,
      });
      return {
        ok: false,
        created: false,
        reason: "no_contract",
        error: "No se encontró un contrato Wispro para este cliente",
      };
    }

    const resolved = resolveContractForPaymentPromise(contracts, {
      amountUsd: input.amountUsd,
      debtUsd: input.debtUsd,
      fullPaymentToleranceUsd: input.fullPaymentToleranceUsd,
    });
    const contract = resolved.contract;

    if (!contract) {
      const states = contracts.map(
        (item) => normalizeContractState(item.state) || "unknown",
      );
      const skipReason = resolved.skipReason || "service_active";
      console.warn(`${LOG_PREFIX} promise_skipped_${skipReason}`, {
        wisproClientId: wisproClientId || null,
        cedula: cedula || null,
        contractStates: states,
        preferredActiveId: resolvePreferredContract(contracts)?.id ?? null,
        amountUsd: input.amountUsd ?? null,
        debtUsd: input.debtUsd ?? null,
        fullPayment: resolved.fullPayment,
      });

      if (skipReason === "payment_incomplete") {
        return {
          ok: false,
          created: false,
          reason: "payment_incomplete",
          error:
            "No se creó la promesa: el servicio está activo y el pago no cubre la deuda completa.",
        };
      }

      return {
        ok: false,
        created: false,
        reason: "service_active",
        error:
          "No se creó la promesa: el servicio del cliente está activo (no suspendido).",
      };
    }

    const validUntil = buildPaymentPromiseValidUntil(hours);
    const promise = await createPaymentPromise(contract.id, validUntil);

    console.log(`${LOG_PREFIX} promise_created`, {
      promiseId: promise.id,
      contractId: contract.id,
      contractState: normalizeContractState(contract.state),
      validUntil,
      sourceClientId: wisproClientId || null,
      fullPayment: resolved.fullPayment,
      amountUsd: input.amountUsd ?? null,
      debtUsd: input.debtUsd ?? null,
    });

    return {
      ok: true,
      created: true,
      promise,
      contract,
      validUntil,
    };
  } catch (error) {
    const message =
      error instanceof WisproApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo crear la promesa de pago";

    console.error(`${LOG_PREFIX} promise_failed`, {
      wisproClientId: wisproClientId || null,
      cedula: cedula || null,
      error: message,
    });

    return {
      ok: false,
      created: false,
      reason:
        error instanceof WisproApiError && error.code === "config"
          ? "config"
          : "upstream",
      error: message,
    };
  }
};

/**
 * Live debt + suspension for a Wispro client UUID.
 * Debt from current_account; suspension from contracts (soft-fail).
 */
export const fetchInvoicingForWisproClientId = async (
  wisproClientId: string,
): Promise<{
  account: WisproCurrentAccount;
  contracts: WisproContract[];
  invoicing: WisproInvoicingSummary;
}> => {
  const wisproId = wisproClientId.trim();
  if (!wisproId) {
    throw new WisproApiError("wispro_id es requerido", {
      status: 400,
      code: "invalid_response",
    });
  }

  const [accountResult, contractsResult] = await Promise.allSettled([
    getClientCurrentAccount(wisproId),
    listContractsByClientId(wisproId),
  ]);

  if (accountResult.status === "rejected") {
    throw accountResult.reason;
  }

  const account = accountResult.value;
  let contracts: WisproContract[] = [];

  if (contractsResult.status === "fulfilled") {
    contracts = contractsResult.value;
  } else {
    // Soft-fail: never invent suspension when contracts lookup fails.
    console.warn(`${LOG_PREFIX} contracts_lookup_failed`, {
      wisproId,
      error:
        contractsResult.reason instanceof Error
          ? contractsResult.reason.message
          : String(contractsResult.reason),
    });
  }

  const preferredBase = resolvePreferredContract(contracts);
  const preferred = await enrichContractPlanAndPpp(preferredBase);
  if (preferred) {
    contracts = contracts.map((contract) =>
      contract.id === preferred.id ? preferred : contract,
    );
  }

  const invoicing = buildInvoicingSummaryFromCurrentAccount(account, {
    contracts,
    preferredContract: preferred,
  });

  console.log(`${LOG_PREFIX} current_account_ok`, {
    wisproId,
    balanceAmount: account.balance_amount,
    invoiceBalance: account.invoice_balance_amount,
    credit: account.credit_amount,
    debt: invoicing.debt,
    debtSource: "balance_amount",
    serviceSuspended: invoicing.serviceSuspended,
    contractState: invoicing.contractState,
    contractsCount: contracts.length,
    planName: invoicing.planName,
    pppProfile: invoicing.pppProfile,
  });

  return { account, contracts, invoicing };
};

/** Venezuelan document letter prefixes commonly stored in Wispro. */
const VE_DOCUMENT_PREFIXES = ["V", "E", "J", "G"] as const;

/** Digits only (cédula/RIF without letter). Empty if too short/long after strip. */
export const normalizeDocumentDigits = (raw: string): string =>
  String(raw || "").replace(/\D/g, "");

/**
 * Exact Wispro `_eq` candidates for a numeric document.
 * Order: bare digits first, then V/E/J/G + digits (no hyphens).
 */
export const buildVeDocumentCandidates = (digits: string): string[] => {
  const normalized = normalizeDocumentDigits(digits);
  if (!normalized) return [];

  const candidates = [
    normalized,
    ...VE_DOCUMENT_PREFIXES.map((prefix) => `${prefix}${normalized}`),
  ];

  return [...new Set(candidates)];
};

const lookupClientsByNationalIdExact = async (
  document: string,
  fallbackDigits: string,
): Promise<WisproCustomer[]> => {
  const clientsPayload = await wisproGet("/clients", {
    national_identification_number_eq: document,
  });

  return extractDataRecords(clientsPayload)
    .map((record) => normalizeWisproCustomer(record, fallbackDigits))
    .filter((customer): customer is WisproCustomer => customer !== null);
};

/**
 * Search Wispro by cédula or RIF using digits only.
 * Expands VE prefixes (V/E/J/G) when the bare number has no exact match.
 */
export const searchWisproByCedula = async (
  cedula: string,
): Promise<WisproSearchResult[]> => {
  const digits = normalizeDocumentDigits(cedula);
  if (!digits) {
    console.log(`${LOG_PREFIX} search_ok`, {
      query: cedula.trim() || null,
      digits: null,
      clients: 0,
      reason: "empty_digits",
    });
    return [];
  }

  const candidates = buildVeDocumentCandidates(digits);
  const customersById = new Map<string, WisproCustomer>();
  let matchedCandidate: string | null = null;

  // 1) Prefer exact digits (natural-person cédula without letter).
  try {
    const exactMatches = await lookupClientsByNationalIdExact(digits, digits);
    for (const customer of exactMatches) {
      customersById.set(customer.id, customer);
    }
    if (exactMatches.length) {
      matchedCandidate = digits;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} search_candidate_failed`, {
      candidate: digits,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // 2) If empty, try V/E/J/G in parallel (RIF / prefixed cédula in Wispro).
  if (!customersById.size) {
    const prefixed = candidates.filter((candidate) => candidate !== digits);
    const settled = await Promise.allSettled(
      prefixed.map(async (candidate) => ({
        candidate,
        customers: await lookupClientsByNationalIdExact(candidate, digits),
      })),
    );

    for (const result of settled) {
      if (result.status === "rejected") {
        console.warn(`${LOG_PREFIX} search_candidate_failed`, {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
        continue;
      }

      const { candidate, customers } = result.value;
      if (!customers.length) continue;

      if (!matchedCandidate) matchedCandidate = candidate;
      for (const customer of customers) {
        customersById.set(customer.id, customer);
      }
    }
  }

  const customers = [...customersById.values()];

  if (!customers.length) {
    console.log(`${LOG_PREFIX} search_ok`, {
      digits,
      candidatesTried: candidates,
      clients: 0,
    });
    return [];
  }

  const results = await Promise.all(
    customers.map(async (customer) => {
      const { invoicing } = await fetchInvoicingForWisproClientId(customer.id);
      return { customer, invoicing };
    }),
  );

  console.log(`${LOG_PREFIX} search_ok`, {
    digits,
    matchedCandidate,
    clients: results.length,
    withDebt: results.filter((result) => result.invoicing.hasDebt).length,
    suspended: results.filter((result) => result.invoicing.serviceSuspended)
      .length,
  });

  return results;
};
