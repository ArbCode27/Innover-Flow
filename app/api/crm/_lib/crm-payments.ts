import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_KNOWN_PAYMENT_BANKS,
  buildPaymentBankStats,
  isExcludedReceptorBank,
  isValidPaymentReference,
  normalizeReceptorBank,
  type CrmPaymentBankStat,
} from "@/app/crm/_lib/payments";
import { syncSaeRegistrationIfConnected } from "./sae-payment-sync";

export const CRM_PAYMENT_STATUSES = [
  "RECIBIDO",
  "EN_PROCESO",
  "APROBADO",
  "RECHAZADO",
  "DUPLICADO",
  "ERROR",
] as const;

export type CrmPaymentStatus = (typeof CRM_PAYMENT_STATUSES)[number];

export const CRM_PAYMENT_SOURCES = [
  "ai",
  "advisor",
  "manual",
  "import",
  "external_api",
] as const;

export type CrmPaymentSource = (typeof CRM_PAYMENT_SOURCES)[number];

export type CrmPayment = {
  id: string;
  organization_id: string;
  client_id: number | null;
  conversation_id: number | null;
  message_id: number | null;
  submitted_by_agent_id: number | null;
  wispro_client_id: string | null;
  client_name: string | null;
  cedula: string | null;
  phone_id: string | null;
  amount: number | null;
  expected_amount?: number | null;
  plan_amount?: number | null;
  amount_raw: string | null;
  bank: string | null;
  receptor_bank?: string | null;
  transaction_code: string | null;
  payment_date: string;
  comment: string | null;
  status: CrmPaymentStatus;
  source: CrmPaymentSource;
  external_payment_id: string | null;
  external_api_status: number | null;
  external_response: unknown;
  error_message: string | null;
  receipt_media_url: string | null;
  receipt_metadata: Record<string, unknown>;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordCrmPaymentInput = {
  organizationId?: string | null;
  clientId?: number | null;
  conversationId?: number | null;
  messageId?: number | null;
  submittedByAgentId?: number | null;
  wisproClientId?: string | null;
  clientName?: string | null;
  cedula?: string | null;
  phoneId?: string | null;
  amount?: string | number | null;
  bank?: string | null;
  transactionCode?: string | null;
  paymentDate?: string | null;
  comment?: string | null;
  status?: CrmPaymentStatus;
  source?: CrmPaymentSource;
  externalPaymentId?: string | null;
  externalApiStatus?: number | null;
  externalResponse?: unknown;
  errorMessage?: string | null;
  receiptMediaUrl?: string | null;
  receiptMetadata?: Record<string, unknown>;
};

const LOG_PREFIX = "[CRM_PAYMENTS]";

const parseAmount = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0
      ? Math.round((value + Number.EPSILON) * 100) / 100
      : null;
  }

  let raw = value.trim();
  if (!raw) return null;

  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }

  raw = raw.replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const todayInCaracas = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const extractExternalId = (body: unknown): string | null => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const nested =
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : null;

  const id = nested?.id ?? row.id ?? row.payment_id ?? null;
  const value = String(id || "").trim();
  return value || null;
};

export type PaymentDateType = "payment" | "approval";

export type ListCrmPaymentsFilters = {
  from?: string | null;
  to?: string | null;
  date_type?: PaymentDateType | null;
  status?: CrmPaymentStatus | "all" | null;
  bank?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

export type CrmPaymentStatusCounts = Record<CrmPaymentStatus, number>;

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const sanitizeSearch = (value: string) =>
  value
    .trim()
    .replace(/[%_,().:*\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);

const isCrmPaymentStatus = (value: string): value is CrmPaymentStatus =>
  CRM_PAYMENT_STATUSES.includes(value as CrmPaymentStatus);

const TERMINAL_STATUSES: CrmPaymentStatus[] = ["APROBADO", "RECHAZADO"];

const isTerminalStatus = (status: string | null | undefined) =>
  TERMINAL_STATUSES.includes(status as CrmPaymentStatus);

const mergeMetadata = (
  current: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | undefined,
) => ({
  ...(current || {}),
  ...(next || {}),
});

const digitsOnly = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "") || null;

const trimOrNull = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

export const isCrmPaymentReadyForApproval = (payment: {
  status: string;
  wispro_client_id: string | null;
  cedula: string | null;
  bank: string | null;
  transaction_code: string | null;
  amount: number | null;
}) => {
  if (payment.status !== "EN_PROCESO" && payment.status !== "ERROR") {
    return false;
  }

  const hasBillingIdentity = Boolean(
    payment.wispro_client_id?.trim() || trimOrNull(payment.cedula),
  );

  return Boolean(
    hasBillingIdentity &&
      trimOrNull(payment.bank) &&
      isValidPaymentReference(payment.transaction_code) &&
      Number(payment.amount) > 0,
  );
};

export const getCrmPaymentByMessageId = async (
  supabase: SupabaseClient,
  messageId: number,
) => {
  const { data, error } = await supabase
    .from("crm_payments")
    .select("*")
    .eq("message_id", messageId)
    .maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export type IntakeCrmReceiptInput = {
  organizationId?: string | null;
  clientId?: number | null;
  conversationId?: number | null;
  messageId: number;
  submittedByAgentId?: number | null;
  clientName?: string | null;
  cedula: string;
  wisproClientId?: string | null;
  phoneId?: string | null;
  receiptMediaUrl?: string | null;
  source?: CrmPaymentSource;
  receiptMetadata?: Record<string, unknown>;
};

export const intakeCrmReceipt = async (
  supabase: SupabaseClient,
  input: IntakeCrmReceiptInput,
): Promise<{ ok: boolean; payment: CrmPayment | null; created: boolean }> => {
  try {
    let organizationId = input.organizationId?.trim() || null;
    if (!organizationId && input.conversationId) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("organization_id")
        .eq("id", input.conversationId)
        .maybeSingle();
      organizationId =
        String(conversation?.organization_id || "").trim() || null;
    }
    if (!organizationId) {
      throw new Error("No se pudo determinar la organización del pago");
    }

    const cedula = digitsOnly(input.cedula);
    if (!cedula) {
      console.warn(`${LOG_PREFIX} intake_missing_cedula`, {
        messageId: input.messageId,
      });
      return { ok: false, payment: null, created: false };
    }

    const existing = await getCrmPaymentByMessageId(supabase, input.messageId);
    if (existing) {
      return { ok: true, payment: existing, created: false };
    }

    const payload = {
      organization_id: organizationId,
      client_id: input.clientId ?? null,
      conversation_id: input.conversationId ?? null,
      message_id: input.messageId,
      submitted_by_agent_id: input.submittedByAgentId ?? null,
      wispro_client_id: trimOrNull(input.wisproClientId),
      client_name: trimOrNull(input.clientName),
      cedula,
      phone_id: trimOrNull(input.phoneId),
      payment_date: todayInCaracas(),
      status: "RECIBIDO" as CrmPaymentStatus,
      source: input.source || "ai",
      receipt_media_url: input.receiptMediaUrl || null,
      receipt_metadata: input.receiptMetadata || {},
    };

    const { data, error } = await supabase
      .from("crm_payments")
      .insert(payload)
      .select("*")
      .maybeSingle<CrmPayment>();

    if (!error && data) {
      console.log(`${LOG_PREFIX} intake_ok`, {
        id: data.id,
        messageId: input.messageId,
        source: payload.source,
      });
      return { ok: true, payment: data, created: true };
    }

    if (error?.code === "23505") {
      const duplicate = await getCrmPaymentByMessageId(supabase, input.messageId);
      return { ok: true, payment: duplicate, created: false };
    }

    console.error(`${LOG_PREFIX} intake_failed`, {
      message: error?.message,
      code: error?.code ?? null,
      messageId: input.messageId,
    });
    return { ok: false, payment: null, created: false };
  } catch (error) {
    console.error(`${LOG_PREFIX} intake_unexpected`, {
      error: error instanceof Error ? error.message : String(error),
      messageId: input.messageId,
    });
    return { ok: false, payment: null, created: false };
  }
};

export const applyCrmPaymentExtraction = async (
  supabase: SupabaseClient,
  input: RecordCrmPaymentInput & { messageId?: number | null },
): Promise<{ ok: boolean; payment: CrmPayment | null; duplicate: boolean }> => {
  try {
    const amount = parseAmount(input.amount);
    const cedula = digitsOnly(input.cedula);
    const bank = normalizeReceptorBank(input.bank);
    const transactionCode = digitsOnly(input.transactionCode);
    const clientName = trimOrNull(input.clientName);

    const existing = input.messageId
      ? await getCrmPaymentByMessageId(supabase, input.messageId)
      : null;

    const nextAmount = amount ?? existing?.amount ?? null;
    const nextCedula = cedula ?? existing?.cedula ?? null;
    const nextBank = bank ?? existing?.bank ?? null;
    const nextTransactionCode =
      transactionCode ?? existing?.transaction_code ?? null;
    const nextClientName = clientName ?? existing?.client_name ?? null;
    const nextWisproId =
      trimOrNull(input.wisproClientId) ?? existing?.wispro_client_id ?? null;
    const complete = Boolean(
      nextAmount &&
        nextCedula &&
        nextBank &&
        nextTransactionCode &&
        nextClientName,
    );

    let nextStatus: CrmPaymentStatus = input.status
      ? input.status
      : complete
        ? "EN_PROCESO"
        : "RECIBIDO";

    if (
      existing &&
      (existing.status === "EN_PROCESO" || existing.status === "ERROR") &&
      nextStatus === "RECIBIDO"
    ) {
      nextStatus = existing.status;
    }

    const patch = {
      client_id: input.clientId ?? existing?.client_id ?? undefined,
      conversation_id:
        input.conversationId ?? existing?.conversation_id ?? undefined,
      submitted_by_agent_id:
        input.submittedByAgentId ?? existing?.submitted_by_agent_id ?? undefined,
      wispro_client_id: nextWisproId ?? undefined,
      client_name: nextClientName,
      cedula: nextCedula,
      phone_id: trimOrNull(input.phoneId) ?? existing?.phone_id ?? undefined,
      amount: nextAmount,
      amount_raw:
        input.amount == null
          ? existing?.amount_raw ?? undefined
          : String(input.amount),
      bank: nextBank,
      transaction_code: nextTransactionCode,
      payment_date:
        input.paymentDate?.slice(0, 10) ||
        existing?.payment_date ||
        todayInCaracas(),
      comment: input.comment?.trim() || existing?.comment || undefined,
      source: input.source || existing?.source,
      external_payment_id:
        input.externalPaymentId ||
        extractExternalId(input.externalResponse) ||
        existing?.external_payment_id ||
        undefined,
      external_api_status:
        input.externalApiStatus ?? existing?.external_api_status ?? undefined,
      external_response:
        input.externalResponse ?? existing?.external_response ?? undefined,
      error_message:
        input.errorMessage === undefined
          ? existing?.error_message ?? undefined
          : input.errorMessage?.trim() || null,
      receipt_media_url:
        input.receiptMediaUrl || existing?.receipt_media_url || undefined,
    };

    if (existing) {
      if (isTerminalStatus(existing.status)) {
        return { ok: true, payment: existing, duplicate: false };
      }

      const { data, error } = await supabase
        .from("crm_payments")
        .update({
          ...patch,
          status: nextStatus,
          receipt_metadata: mergeMetadata(
            existing.receipt_metadata,
            input.receiptMetadata,
          ),
        })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle<CrmPayment>();

      if (error) {
        if (error.code === "23505") {
          return { ok: true, payment: existing, duplicate: true };
        }
        throw new Error(error.message);
      }

      if (!data) return { ok: true, payment: null, duplicate: false };
      const synced = await syncSaeRegistrationIfConnected(supabase, data);
      return { ok: true, payment: synced, duplicate: false };
    }

    const inserted = await insertCrmPayment(supabase, {
      ...input,
      status: nextStatus,
    });
    if (!inserted.ok || !inserted.payment || inserted.duplicate) return inserted;
    const synced = await syncSaeRegistrationIfConnected(supabase, inserted.payment);
    return { ...inserted, payment: synced };
  } catch (error) {
    console.error(`${LOG_PREFIX} extract_unexpected`, {
      error: error instanceof Error ? error.message : String(error),
      messageId: input.messageId ?? null,
    });
    return { ok: false, payment: null, duplicate: false };
  }
};

export const recordCrmPayment = async (
  supabase: SupabaseClient,
  input: RecordCrmPaymentInput,
): Promise<{ ok: boolean; payment: CrmPayment | null; duplicate: boolean }> => {
  try {
    return await insertCrmPayment(supabase, input);
  } catch (error) {
    console.error(`${LOG_PREFIX} persist_unexpected`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, payment: null, duplicate: false };
  }
};

const insertCrmPayment = async (
  supabase: SupabaseClient,
  input: RecordCrmPaymentInput,
): Promise<{ ok: boolean; payment: CrmPayment | null; duplicate: boolean }> => {
  let organizationId = input.organizationId?.trim() || null;
  if (!organizationId && input.conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("organization_id")
      .eq("id", input.conversationId)
      .maybeSingle();
    organizationId = String(conversation?.organization_id || "").trim() || null;
  }
  if (!organizationId) {
    throw new Error("No se pudo determinar la organización del pago");
  }

  const amount = parseAmount(input.amount);
  const cedula = digitsOnly(input.cedula);
  const bank = normalizeReceptorBank(input.bank);
  const rawReference = trimOrNull(input.transactionCode);
  const transactionCode =
    input.source === "manual" && isValidPaymentReference(rawReference)
      ? rawReference
      : digitsOnly(input.transactionCode);
  const clientName = trimOrNull(input.clientName);
  const complete = Boolean(amount && cedula && bank && transactionCode && clientName);

  const payload = {
    organization_id: organizationId,
    client_id: input.clientId ?? null,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    submitted_by_agent_id: input.submittedByAgentId ?? null,
    wispro_client_id: input.wisproClientId?.trim() || null,
    client_name: clientName,
    cedula,
    phone_id: input.phoneId?.trim() || null,
    amount,
    amount_raw: input.amount == null ? null : String(input.amount),
    bank,
    receptor_bank: bank,
    transaction_code: transactionCode,
    payment_date: input.paymentDate?.slice(0, 10) || todayInCaracas(),
    comment: input.comment?.trim() || null,
    status: input.status || (complete ? "EN_PROCESO" : "RECIBIDO"),
    source: input.source || "ai",
    external_payment_id:
      input.externalPaymentId || extractExternalId(input.externalResponse),
    external_api_status: input.externalApiStatus ?? null,
    external_response: input.externalResponse ?? null,
    error_message: input.errorMessage?.trim() || null,
    receipt_media_url: input.receiptMediaUrl || null,
    receipt_metadata: input.receiptMetadata || {},
  };

  const { data, error } = await supabase
    .from("crm_payments")
    .insert(payload)
    .select("*")
    .maybeSingle<CrmPayment>();

  if (!error && data) {
    console.log(`${LOG_PREFIX} persist_ok`, {
      id: data.id,
      cedula,
      transactionCode,
      status: data.status,
      conversationId: data.conversation_id,
    });
    return { ok: true, payment: data, duplicate: false };
  }

  if (error?.code === "23505") {
    console.warn(`${LOG_PREFIX} persist_duplicate`, {
      cedula,
      bank,
      transactionCode,
    });
    return { ok: true, payment: null, duplicate: true };
  }

  console.error(`${LOG_PREFIX} persist_failed`, {
    message: error?.message,
    code: error?.code ?? null,
    cedula,
    transactionCode,
  });
  return { ok: false, payment: null, duplicate: false };
};

const applyListFilters = <T>(
  query: T,
  filters: ListCrmPaymentsFilters,
  options: { includeStatus: boolean; applyBank: boolean },
): T => {
  let next = query as {
    gte: (column: string, value: string) => typeof next;
    lte: (column: string, value: string) => typeof next;
    eq: (column: string, value: string) => typeof next;
    or: (filters: string) => typeof next;
  };

  const search = filters.q ? sanitizeSearch(filters.q) : "";
  const dateType = filters.date_type === "approval" ? "approval" : "payment";

  if (!search) {
    if (dateType === "approval") {
      if (filters.from && isIsoDate(filters.from)) {
        next = next.gte("approved_at", `${filters.from}T00:00:00.000-04:00`);
      }
      if (filters.to && isIsoDate(filters.to)) {
        next = next.lte("approved_at", `${filters.to}T23:59:59.999-04:00`);
      }
    } else {
      if (filters.from && isIsoDate(filters.from)) {
        next = next.gte("payment_date", filters.from);
      }
      if (filters.to && isIsoDate(filters.to)) {
        next = next.lte("payment_date", filters.to);
      }
    }
  }

  if (options.includeStatus && filters.status && isCrmPaymentStatus(filters.status)) {
    next = next.eq("status", filters.status);
  } else if (
    !search &&
    dateType === "approval" &&
    options.includeStatus &&
    (!filters.status || filters.status === "all")
  ) {
    next = next.eq("status", "APROBADO");
  }

  if (options.applyBank && filters.bank?.trim() && filters.bank.trim() !== "all") {
    next = next.eq("receptor_bank", filters.bank.trim());
  }

  if (search) {
    const clauses = [
      `cedula.ilike.%${search}%`,
      `client_name.ilike.%${search}%`,
      `transaction_code.ilike.%${search}%`,
    ];
    const digits = search.replace(/\D/g, "");
    if (digits.length >= 4 && digits !== search) {
      clauses.push(`cedula.ilike.%${digits}%`, `transaction_code.ilike.%${digits}%`);
    }
    next = next.or(clauses.join(","));
  }

  return next as T;
};

const emptyStatusCounts = (): CrmPaymentStatusCounts => ({
  RECIBIDO: 0,
  EN_PROCESO: 0,
  APROBADO: 0,
  RECHAZADO: 0,
  DUPLICADO: 0,
  ERROR: 0,
});

const fetchStatRows = async (
  supabase: SupabaseClient,
  filters: ListCrmPaymentsFilters,
  organizationId?: string,
) => {
  const pageSize = 1000;
  const rows: Array<{ bank: string | null; amount: number | null; status: string }> = [];
  let from = 0;

  for (;;) {
    let query = supabase.from("crm_payments").select("bank, receptor_bank, amount, status");
    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }
    const filtered = applyListFilters(query, filters, {
      includeStatus: false,
      applyBank: false,
    });
    const { data, error } = await filtered.range(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    const batch = (data || []) as Array<{
      bank: string | null;
      receptor_bank?: string | null;
      amount: number | string | null;
      status: string;
    }>;
    for (const row of batch) {
      const amount = row.amount === null ? null : Number(row.amount);
      rows.push({
        bank: row.receptor_bank || row.bank,
        amount: Number.isFinite(amount) ? amount : null,
        status: row.status,
      });
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

export const listCrmPayments = async (
  supabase: SupabaseClient,
  filters: ListCrmPaymentsFilters,
  organizationId?: string,
) => {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 2000);
  const offset = Math.max(filters.offset ?? 0, 0);
  const search = filters.q ? sanitizeSearch(filters.q) : "";
  const dateType =
    !search && filters.date_type === "approval" ? "approval" : "payment";

  const listBaseQuery = supabase.from("crm_payments").select("*", { count: "exact" });
  const listQuery = applyListFilters(
    organizationId
      ? listBaseQuery.eq("organization_id", organizationId)
      : listBaseQuery,
    filters,
    { includeStatus: true, applyBank: true },
  );

  const countQueries = CRM_PAYMENT_STATUSES.map((status) =>
    applyListFilters(
      organizationId
        ? supabase
            .from("crm_payments")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
        : supabase
            .from("crm_payments")
            .select("id", { count: "exact", head: true }),
      { ...filters, status },
      { includeStatus: true, applyBank: true },
    ),
  );

  const orderedList =
    dateType === "approval"
      ? listQuery.order("approved_at", { ascending: false, nullsFirst: false })
      : listQuery.order("created_at", { ascending: false, nullsFirst: false });

  const [listResult, statRows, ...countResults] = await Promise.all([
    orderedList.range(offset, offset + limit - 1),
    fetchStatRows(supabase, filters, organizationId),
    ...countQueries,
  ]);

  if (listResult.error) {
    throw new Error(listResult.error.message);
  }

  const counts = emptyStatusCounts();
  CRM_PAYMENT_STATUSES.forEach((status, index) => {
    const result = countResults[index];
    counts[status] = result?.error ? 0 : (result?.count ?? 0);
  });

  const bankStats = buildPaymentBankStats(statRows);
  const extraBanks = bankStats
    .map((stat) => stat.bank)
    .filter(
      (bank) =>
        !CRM_KNOWN_PAYMENT_BANKS.includes(
          bank as (typeof CRM_KNOWN_PAYMENT_BANKS)[number],
        ) && !isExcludedReceptorBank(bank),
    )
    .sort((a, b) => a.localeCompare(b, "es"));
  const banks = [...CRM_KNOWN_PAYMENT_BANKS, ...extraBanks];

  return {
    payments: (listResult.data || []) as CrmPayment[],
    total: listResult.count ?? (listResult.data || []).length,
    counts,
    banks,
    bankStats,
    limit,
    offset,
  };
};

const REVIEWABLE_STATUSES: CrmPaymentStatus[] = [
  "EN_PROCESO",
  "APROBADO",
  "RECHAZADO",
];

export const isReviewablePaymentStatus = (
  value: string,
): value is CrmPaymentStatus =>
  REVIEWABLE_STATUSES.includes(value as CrmPaymentStatus);

export const updateCrmPaymentStatus = async (
  supabase: SupabaseClient,
  input: { id: string; status: CrmPaymentStatus },
) => {
  if (!isReviewablePaymentStatus(input.status)) {
    throw new Error("Estado de pago no permitido");
  }

  const { data, error } = await supabase
    .from("crm_payments")
    .update({ status: input.status })
    .eq("id", input.id)
    .select("*")
    .maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const getCrmPaymentById = async (
  supabase: SupabaseClient,
  id: string,
  organizationId?: string,
) => {
  let query = supabase
    .from("crm_payments")
    .select("*")
    .eq("id", id);
  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }
  const { data, error } = await query.maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const approveCrmPayment = async (
  supabase: SupabaseClient,
  input: {
    payment: CrmPayment;
    expectedAmount?: number | null;
    planAmount?: number | null;
    wisproPayment: {
      id: string;
      state: string | null;
      payment_date: string;
      amount: number;
      transaction_code: string | null;
      raw: unknown;
    };
  },
) => {
  const { data, error } = await supabase
    .from("crm_payments")
    .update({
      status: "APROBADO",
      approved_at: new Date().toISOString(),
      error_message: null,
      expected_amount: input.expectedAmount ?? input.payment.expected_amount ?? null,
      plan_amount: input.planAmount ?? input.payment.plan_amount ?? null,
      receipt_metadata: {
        ...(input.payment.receipt_metadata || {}),
        wispro_payment: {
          id: input.wisproPayment.id,
          state: input.wisproPayment.state,
          amount: input.wisproPayment.amount,
          payment_date: input.wisproPayment.payment_date,
          transaction_code: input.wisproPayment.transaction_code,
          response: input.wisproPayment.raw,
          registered_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", input.payment.id)
    .select("*")
    .maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const rejectCrmPayment = async (
  supabase: SupabaseClient,
  paymentId: string,
) => {
  const { data, error } = await supabase
    .from("crm_payments")
    .update({
      status: "RECHAZADO",
      approved_at: null,
      error_message: null,
    })
    .eq("id", paymentId)
    .select("*")
    .maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const approveCrmPaymentManual = async (
  supabase: SupabaseClient,
  payment: CrmPayment,
) => {
  const currentMeta =
    payment.receipt_metadata && typeof payment.receipt_metadata === "object"
      ? payment.receipt_metadata
      : {};
  const approvedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("crm_payments")
    .update({
      status: "APROBADO",
      approved_at: approvedAt,
      error_message: null,
      receipt_metadata: {
        ...currentMeta,
        manual_approval: {
          at: approvedAt,
          wispro: false,
        },
      },
    })
    .eq("id", payment.id)
    .select("*")
    .maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export type UpdateCrmPaymentInput = {
  id: string;
  organizationId: string;
  clientName?: string | null;
  cedula?: string | null;
  amount?: string | number | null;
  bank?: string | null;
  transactionCode?: string | null;
  paymentDate?: string | null;
  comment?: string | null;
  status?: CrmPaymentStatus | null;
};

export const updateCrmPaymentFields = async (
  supabase: SupabaseClient,
  input: UpdateCrmPaymentInput,
) => {
  const current = await getCrmPaymentById(supabase, input.id, input.organizationId);
  if (!current) return null;

  const nextStatus = input.status && isCrmPaymentStatus(input.status)
    ? input.status
    : current.status;
  const bank = input.bank !== undefined ? normalizeReceptorBank(input.bank) : current.bank;
  const amount = input.amount !== undefined ? parseAmount(input.amount) : current.amount;
  const reference =
    input.transactionCode !== undefined
      ? isValidPaymentReference(input.transactionCode)
        ? trimOrNull(input.transactionCode)
        : digitsOnly(input.transactionCode)
      : current.transaction_code;

  let approvedAt = current.approved_at ?? null;
  if (nextStatus === "APROBADO" && current.status !== "APROBADO") {
    approvedAt = new Date().toISOString();
  } else if (nextStatus !== "APROBADO") {
    approvedAt = null;
  }

  const { data, error } = await supabase
    .from("crm_payments")
    .update({
      client_name:
        input.clientName !== undefined ? trimOrNull(input.clientName) : current.client_name,
      cedula: input.cedula !== undefined ? digitsOnly(input.cedula) : current.cedula,
      amount,
      amount_raw:
        input.amount !== undefined
          ? input.amount == null
            ? null
            : String(input.amount)
          : current.amount_raw,
      bank,
      receptor_bank: bank,
      transaction_code: reference,
      payment_date:
        input.paymentDate !== undefined
          ? input.paymentDate?.slice(0, 10) || current.payment_date
          : current.payment_date,
      comment: input.comment !== undefined ? trimOrNull(input.comment) : current.comment,
      status: nextStatus,
      approved_at: approvedAt,
    })
    .eq("id", input.id)
    .eq("organization_id", input.organizationId)
    .select("*")
    .maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const markCrmPaymentApprovalError = async (
  supabase: SupabaseClient,
  input: {
    paymentId: string;
    message: string;
  },
) => {
  const { data, error } = await supabase
    .from("crm_payments")
    .update({
      status: "ERROR",
      error_message: input.message,
    })
    .eq("id", input.paymentId)
    .select("*")
    .maybeSingle<CrmPayment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
