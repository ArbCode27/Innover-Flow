import type { SupabaseClient } from "@supabase/supabase-js";
import { associateWisproClient } from "@/app/crm/_lib/wispro-associate";
import type { WisproSearchResult } from "@/app/crm/_lib/types";
import {
  createPaymentPromiseForClient,
  DEFAULT_PAYMENT_PROMISE_HOURS,
  searchWisproByCedula,
  WisproApiError,
} from "@/app/api/crm/_lib/wispro-api";
import {
  InnoverPaymentsError,
  submitInnoverPayment,
} from "@/app/api/crm/_lib/innover-payments";
import {
  applyCrmPaymentExtraction,
  intakeCrmReceipt,
} from "@/app/api/crm/_lib/crm-payments";
import { ensureConversationLabel } from "@/app/api/crm/_lib/conversation-labels";
import {
  withClosedOfficeNotice,
  type OfficeHoursSnapshot,
} from "@/app/crm/_lib/office-hours";
import {
  DolarVzlaError,
  enrichDebtWithBcv,
  getBcvRate,
} from "@/app/api/crm/_lib/dolarvzla-rate";
import {
  ESCALATE_HUMAN_TOOL,
  GET_BCV_RATE_TOOL,
  LINK_WISPRO_TOOL,
  LOOKUP_WISPRO_TOOL,
  SUBMIT_PAYMENT_RECEIPT_TOOL,
  escalateHumanArgsSchema,
  linkWisproArgsSchema,
  lookupWisproArgsSchema,
  submitPaymentReceiptArgsSchema,
} from "./ai-tools";
import {
  isUnsafeCustomerReply,
  SAFE_INTERNAL_LEAK_CUSTOMER_REPLY,
} from "./reply-sanitizer";
import { auditToolInvocation } from "./tool-audit";

export type AgentRunContext = {
  supabase: SupabaseClient;
  conversationId: number;
  clientId: number | null;
  customerPhone: string | null;
  whatsappId: string | null;
  waName: string | null;
  runId: string;
  triggerMessageId: number | null;
  paymentRequestedByAgentId?: number | null;
  replyMode?: "full" | "after_hours_payments" | "forced" | "skip";
  allowedToolNames?: string[] | null;
  officeHours?: OfficeHoursSnapshot | null;
  lastLookupByWisproId: Map<string, WisproSearchResult>;
  lastLookupCedula: string | null;
  linkedWisproId: string | null;
  linkedCedula: string | null;
  linkedClientName: string | null;
  escalated: boolean;
  escalateReason: string | null;
  escalateMessage: string | null;
};

export type ToolHandlerResult = {
  name: string;
  ok: boolean;
  response: Record<string, unknown>;
  stopAgent?: boolean;
  shouldHandoff?: boolean;
  handoffMessage?: string;
  handoffReason?: string;
};

const forClient = (ctx: AgentRunContext, message: string) =>
  withClosedOfficeNotice(message, ctx.officeHours);

type PendingReceipt = {
  amount: string | null;
  transaction_code: string | null;
  bank: string | null;
  comment?: string | null;
};

const parseBolivaresAmount = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round((value + Number.EPSILON) * 100) / 100;
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

const convertBsToUsd = (amountBs: number, rate: number) =>
  Math.round(((amountBs / rate) + Number.EPSILON) * 100) / 100;

const normalizePhone = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "");

const summarizeMatch = async (result: WisproSearchResult) => {
  const debtUsd = Number(result.invoicing.debt) || 0;
  const fx = await enrichDebtWithBcv(debtUsd);

  return {
    wispro_id: result.customer.id,
    name: result.customer.name,
    cedula: result.customer.national_identification_number,
    zone: result.customer.zone_name ?? null,
    city: result.customer.city ?? null,
    phone_mobile: result.customer.phone_mobile ?? null,
    account_status: result.invoicing.accountStatus,
    service_suspended: Boolean(result.invoicing.serviceSuspended),
    contract_state: result.invoicing.contractState ?? null,
    debt: debtUsd,
    has_debt: result.invoicing.hasDebt,
    debt_usd: fx.debt_usd,
    debt_usd_formatted: fx.debt_usd_formatted,
    debt_bs: fx.debt_bs,
    debt_bs_formatted: fx.debt_bs_formatted,
    bcv_rate: fx.ok ? fx.bcv_rate : null,
    bcv_usd: fx.ok ? fx.bcv_usd : null,
    bcv_eur: fx.ok ? fx.bcv_eur : null,
    bcv_as_of: fx.ok ? fx.bcv_as_of : null,
    bcv_source: fx.ok ? fx.bcv_source : null,
    bcv_error: fx.ok ? null : fx.bcv_error,
    currency_hint: fx.ok
      ? "Usa debt_bs_formatted y debt_usd_formatted. No recalcules ni inventes tasa."
      : fx.hint,
  };
};

const resolvePhoneId = (ctx: AgentRunContext) => {
  const candidates = [ctx.customerPhone, ctx.whatsappId]
    .map((value) => normalizePhone(value))
    .filter((value) => value.length >= 8 && value.length <= 15);
  return candidates[0] || null;
};

const resolvePaymentMatch = (
  ctx: AgentRunContext,
  wisproId?: string | null,
): { ok: true; match: WisproSearchResult } | { ok: false; error: string } => {
  if (wisproId) {
    const match = ctx.lastLookupByWisproId.get(wisproId);
    if (!match) {
      return {
        ok: false,
        error:
          "wispro_id no está en el lookup reciente. Llama lookup_wispro_by_cedula otra vez.",
      };
    }
    return { ok: true, match };
  }

  const matches = [...ctx.lastLookupByWisproId.values()];
  if (matches.length === 1) {
    return { ok: true, match: matches[0] };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      error:
        "Hay varios matches de Wispro. Confirma con el usuario y pasa wispro_id.",
    };
  }

  return {
    ok: false,
    error:
      "Falta lookup Wispro. Si el cliente aún no dio cédula, PÍDELA (no hagas handoff). Cuando la tenga, llama lookup_wispro_by_cedula y luego submit_payment_receipt.",
  };
};

const findReceiptMessage = async (ctx: AgentRunContext) => {
  if (ctx.triggerMessageId) {
    const { data } = await ctx.supabase
      .from("messages")
    .select("id, metadata, media_type, media_url")
    .eq("id", ctx.triggerMessageId)
      .maybeSingle();
    if (data) return data;
  }

  const { data: latestImage } = await ctx.supabase
    .from("messages")
    .select("id, metadata, media_type, media_url")
    .eq("conversation_id", ctx.conversationId)
    .eq("type", "in")
    .eq("media_type", "image")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return latestImage;
};

const readPendingReceipt = (
  metadata: Record<string, unknown>,
): PendingReceipt | null => {
  const pending = metadata.pending_receipt;
  if (!pending || typeof pending !== "object") return null;
  const record = pending as Record<string, unknown>;
  const amount = String(record.amount || "").trim();
  const transactionCode = String(record.transaction_code || "").trim();
  const bank = String(record.bank || "").trim();
  if (!amount || !transactionCode || !bank) return null;
  return {
    amount,
    transaction_code: transactionCode,
    bank,
    comment:
      typeof record.comment === "string" ? record.comment : null,
  };
};

const persistReceiptToCrm = async (
  ctx: AgentRunContext,
  input: {
    receiptMessage?: {
      id?: number | null;
      media_url?: string | null;
    } | null;
    clientName?: string | null;
    cedula?: string | null;
    amount?: string | number | null;
    bank?: string | null;
    transactionCode?: string | null;
    comment?: string | null;
    wisproClientId?: string | null;
    phoneId?: string | null;
    status?: "RECIBIDO" | "EN_PROCESO";
    extraMetadata?: Record<string, unknown>;
  },
) => {
  const messageId = input.receiptMessage?.id ?? ctx.triggerMessageId;
  if (!messageId) return { ok: false, payment: null, duplicate: false };

  const cedula = input.cedula || ctx.linkedCedula;
  const wisproClientId = input.wisproClientId || ctx.linkedWisproId;
  const clientName = input.clientName || ctx.linkedClientName || ctx.waName;

  if (!cedula) {
    return { ok: false, payment: null, duplicate: false };
  }

  await intakeCrmReceipt(ctx.supabase, {
    clientId: ctx.clientId,
    conversationId: ctx.conversationId,
    messageId,
    submittedByAgentId: ctx.paymentRequestedByAgentId ?? null,
    clientName,
    cedula,
    wisproClientId,
    phoneId: input.phoneId || ctx.whatsappId || ctx.customerPhone,
    receiptMediaUrl:
      typeof input.receiptMessage?.media_url === "string"
        ? input.receiptMessage.media_url
        : null,
    source: ctx.paymentRequestedByAgentId ? "advisor" : "ai",
    receiptMetadata: {
      requested_manually: Boolean(ctx.paymentRequestedByAgentId),
      requested_by_agent_id: ctx.paymentRequestedByAgentId ?? null,
      requested_from_message_id: messageId,
    },
  });

  return applyCrmPaymentExtraction(ctx.supabase, {
    clientId: ctx.clientId,
    conversationId: ctx.conversationId,
    messageId,
    submittedByAgentId: ctx.paymentRequestedByAgentId ?? null,
    wisproClientId,
    clientName,
    cedula,
    phoneId: input.phoneId || ctx.whatsappId || ctx.customerPhone,
    amount: input.amount,
    bank: input.bank,
    transactionCode: input.transactionCode,
    comment: input.comment,
    status: input.status,
    source: ctx.paymentRequestedByAgentId ? "advisor" : "ai",
    receiptMediaUrl:
      typeof input.receiptMessage?.media_url === "string"
        ? input.receiptMessage.media_url
        : null,
    receiptMetadata: input.extraMetadata,
  });
};

const markHandoff = (
  ctx: AgentRunContext,
  reason: string,
  message: string,
) => {
  ctx.escalated = true;
  ctx.escalateReason = reason;
  ctx.escalateMessage = message;
};

const applyPaymentVerificationLabel = async (ctx: AgentRunContext) => {
  const result = await ensureConversationLabel(
    ctx.supabase,
    ctx.conversationId,
    "verificar_pago",
  );
  return result;
};

const looksLikeSupportReason = (reason: string) => {
  const normalized = reason
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    normalized.includes("soporte") ||
    normalized.includes("tecnico") ||
    normalized.includes("falla") ||
    normalized.includes("lentitud") ||
    normalized.includes("intermiten") ||
    normalized.includes("sin servicio") ||
    normalized.includes("clave") ||
    normalized.includes("password") ||
    normalized.includes("wifi") ||
    normalized.includes("router") ||
    normalized.includes("luz roja")
  );
};

const handleGetBcvRate = async (): Promise<ToolHandlerResult> => {
  try {
    const rate = await getBcvRate();
    return {
      name: GET_BCV_RATE_TOOL,
      ok: true,
      response: {
        ok: true,
        bcv_rate: rate.rate,
        bcv_usd: rate.usd,
        bcv_eur: rate.eur,
        bcv_as_of: rate.asOf,
        bcv_source: rate.source,
        bcv_cached: rate.cached,
        bcv_change_percentage_usd: rate.changePercentageUsd,
        bcv_rate_display: `${rate.usd.toFixed(4).replace(".", ",")} Bs/$`,
        hint: "Usa bcv_rate (current.usd = tasa BCV del día). No inventes otra tasa.",
      },
    };
  } catch (error) {
    const message =
      error instanceof DolarVzlaError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo obtener la tasa BCV";

    return {
      name: GET_BCV_RATE_TOOL,
      ok: false,
      response: {
        ok: false,
        error: message,
        hint: "Di que no pudiste consultar la tasa del día. No inventes un valor.",
      },
    };
  }
};

const tryAssociateLookupMatch = async (
  ctx: AgentRunContext,
  match: WisproSearchResult,
): Promise<{
  linked: boolean;
  skippedReason: string | null;
  error: string | null;
  clientId: number | null;
  wisproId: string | null;
  name: string | null;
  zone: string | null;
  account: string | null;
}> => {
  try {
    const { data: conversation, error: conversationError } = await ctx.supabase
      .from("conversations")
      .select("id, organization_id, client_id, customer_phone, status")
      .eq("id", ctx.conversationId)
      .maybeSingle();

    if (conversationError) throw conversationError;

    if (!conversation) {
      return {
        linked: false,
        skippedReason: "conversation_not_found",
        error: "Conversación no encontrada",
        clientId: null,
        wisproId: null,
        name: null,
        zone: null,
        account: null,
      };
    }

    if (conversation.status === "resuelto") {
      return {
        linked: false,
        skippedReason: "conversation_resolved",
        error: null,
        clientId: null,
        wisproId: null,
        name: null,
        zone: null,
        account: null,
      };
    }

    const client = await associateWisproClient(ctx.supabase, {
      organizationId: String(conversation.organization_id),
      conversationId: ctx.conversationId,
      customer: match.customer,
      invoicing: match.invoicing,
      existingClientId: conversation.client_id ?? ctx.clientId,
      conversationPhone:
        conversation.customer_phone ?? ctx.customerPhone ?? ctx.whatsappId,
      whatsappId: ctx.whatsappId,
      waName: ctx.waName,
    });

    ctx.clientId = client.id;

    console.log("[AI_TOOL] wispro_auto_link_ok", {
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      clientId: client.id,
      wisproId: client.wispro_id ?? match.customer.id,
      humanModeAllowed: true,
    });

    return {
      linked: true,
      skippedReason: null,
      error: null,
      clientId: client.id,
      wisproId: client.wispro_id ?? match.customer.id,
      name: client.name,
      zone: client.zone,
      account: client.account,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo vincular Wispro";

    console.warn("[AI_TOOL] wispro_auto_link_soft_failed", {
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      wisproId: match.customer.id,
      error: message,
    });

    return {
      linked: false,
      skippedReason: "associate_failed",
      error: message,
      clientId: null,
      wisproId: match.customer.id,
      name: null,
      zone: null,
      account: null,
    };
  }
};

const buildLookupHint = (input: {
  count: number;
  linked: boolean;
  serviceSuspended: boolean;
  linkError: string | null;
}) => {
  if (input.count === 0) {
    return "No se encontró abonado. Pide verificar la cédula o RIF.";
  }

  if (input.count > 1) {
    return "Varios matches. Confirma nombre/zona y llama link_wispro_client con el wispro_id elegido antes del pago.";
  }

  if (!input.linked) {
    return input.linkError
      ? `Lookup ok pero no se pudo vincular automáticamente (${input.linkError}). Informa saldo; puedes reintentar con link_wispro_client.`
      : "Un solo match. Informa saldo. Si aún no está vinculado, llama link_wispro_client.";
  }

  if (input.serviceSuspended) {
    return "Cliente vinculado. Servicio suspendido (service_suspended=true). Informa saldo, incentiva el pago y di que al registrar el comprobante se activa de forma inmediata. No menciones promesas internas.";
  }

  return "Cliente vinculado automáticamente. Informa saldo con debt_usd_formatted y debt_bs_formatted. Si hay comprobante pendiente, llama submit_payment_receipt.";
};

const handleLookup = async (
  ctx: AgentRunContext,
  rawArgs: unknown,
): Promise<ToolHandlerResult> => {
  const parsed = lookupWisproArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      name: LOOKUP_WISPRO_TOOL,
      ok: false,
      response: {
        ok: false,
        error: parsed.error.issues[0]?.message || "Documento inválido",
      },
    };
  }

  try {
    const results = await searchWisproByCedula(parsed.data.cedula);
    ctx.lastLookupByWisproId.clear();
    ctx.lastLookupCedula = parsed.data.cedula;
    for (const result of results) {
      ctx.lastLookupByWisproId.set(result.customer.id, result);
    }

    const matches = await Promise.all(
      results.map((result) => summarizeMatch(result)),
    );

    let linked = false;
    let linkError: string | null = null;
    let linkSkippedReason: string | null = null;
    let linkedClientId: number | null = null;
    let linkedWisproId: string | null = null;
    let linkedName: string | null = null;
    let linkedZone: string | null = null;
    let linkedAccount: string | null = null;

    // Auto-link only on a unique match (deterministic; do not rely on a 2nd tool call).
    if (results.length === 1 && results[0]) {
      const linkResult = await tryAssociateLookupMatch(ctx, results[0]);
      linked = linkResult.linked;
      linkError = linkResult.error;
      linkSkippedReason = linkResult.skippedReason;
      linkedClientId = linkResult.clientId;
      linkedWisproId = linkResult.wisproId;
      linkedName = linkResult.name;
      linkedZone = linkResult.zone;
      linkedAccount = linkResult.account;
    } else if (results.length > 1) {
      linkSkippedReason = "multiple_matches";
    } else {
      linkSkippedReason = "no_matches";
    }

    const singleSuspended =
      results.length === 1 && Boolean(results[0]?.invoicing.serviceSuspended);

    return {
      name: LOOKUP_WISPRO_TOOL,
      ok: true,
      response: {
        ok: true,
        cedula: parsed.data.cedula,
        count: results.length,
        linked,
        link_skipped_reason: linkSkippedReason,
        link_error: linkError,
        client_id: linkedClientId,
        wispro_id: linkedWisproId,
        linked_name: linkedName,
        linked_zone: linkedZone,
        linked_account: linkedAccount,
        matches,
        hint: buildLookupHint({
          count: results.length,
          linked,
          serviceSuspended: singleSuspended,
          linkError,
        }),
      },
    };
  } catch (error) {
    const message =
      error instanceof WisproApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error al consultar Wispro";

    return {
      name: LOOKUP_WISPRO_TOOL,
      ok: false,
      response: {
        ok: false,
        error: message,
        hint: "Pide reintentar la cédula o, si insiste, escalate_to_human.",
      },
    };
  }
};

const handleLink = async (
  ctx: AgentRunContext,
  rawArgs: unknown,
): Promise<ToolHandlerResult> => {
  const parsed = linkWisproArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      name: LINK_WISPRO_TOOL,
      ok: false,
      response: {
        ok: false,
        error: parsed.error.issues[0]?.message || "wispro_id inválido",
      },
    };
  }

  const match = ctx.lastLookupByWisproId.get(parsed.data.wispro_id);
  if (!match) {
    return {
      name: LINK_WISPRO_TOOL,
      ok: false,
      response: {
        ok: false,
        error:
          "No hay un lookup reciente con ese wispro_id. Llama primero lookup_wispro_by_cedula.",
      },
    };
  }

  const linkResult = await tryAssociateLookupMatch(ctx, match);

  if (!linkResult.linked) {
    return {
      name: LINK_WISPRO_TOOL,
      ok: false,
      response: {
        ok: false,
        error:
          linkResult.error ||
          (linkResult.skippedReason === "conversation_resolved"
            ? "La conversación ya está resuelta"
            : "No se pudo vincular Wispro"),
        link_skipped_reason: linkResult.skippedReason,
      },
      stopAgent: linkResult.skippedReason === "conversation_resolved",
    };
  }

  return {
    name: LINK_WISPRO_TOOL,
    ok: true,
    response: {
      ok: true,
      linked: true,
      client_id: linkResult.clientId,
      wispro_id: linkResult.wisproId,
      name: linkResult.name,
      zone: linkResult.zone,
      account: linkResult.account,
      debt: match.invoicing.debt,
      has_debt: match.invoicing.hasDebt,
      account_status: match.invoicing.accountStatus,
      service_suspended: Boolean(match.invoicing.serviceSuspended),
      contract_state: match.invoicing.contractState ?? null,
      hint: "Cliente vinculado. Puedes continuar con submit_payment_receipt si hay comprobante.",
    },
  };
};

const handleSubmitPaymentReceipt = async (
  ctx: AgentRunContext,
  rawArgs: unknown,
): Promise<ToolHandlerResult> => {
  const parsed = submitPaymentReceiptArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: parsed.error.issues[0]?.message || "Datos del comprobante inválidos",
        hint: "Pide monto, referencia y banco si no son legibles. No hagas handoff todavía.",
      },
    };
  }

  const receiptMessage = await findReceiptMessage(ctx);
  const existingMetadata =
    receiptMessage?.metadata && typeof receiptMessage.metadata === "object"
      ? ({ ...(receiptMessage.metadata as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};

  const pending = readPendingReceipt(existingMetadata);
  const amount = parsed.data.amount ?? pending?.amount ?? null;
  const transactionCode =
    parsed.data.transaction_code ?? pending?.transaction_code ?? null;
  const bank = (parsed.data.bank || pending?.bank || "").trim() || null;
  const comment = parsed.data.comment ?? pending?.comment ?? null;

  if (existingMetadata.payment_submitted === true) {
    const message = forClient(
      ctx,
      "Tu comprobante ya fue registrado. Un asesor lo verificará en breve.",
    );
    const label = await applyPaymentVerificationLabel(ctx);
    markHandoff(ctx, "payment_already_submitted", message);
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: true,
      response: {
        ok: true,
        alreadyProcessed: true,
        message_id: receiptMessage?.id ?? null,
        should_handoff: true,
        label_applied: label.applied,
        label_id: label.labelId,
        hint: message,
      },
      stopAgent: true,
      shouldHandoff: true,
      handoffMessage: message,
      handoffReason: "payment_already_submitted",
    };
  }

  const savePendingReceipt = async (nextPending: PendingReceipt) => {
    if (!receiptMessage?.id) return false;

    const { error: pendingError } = await ctx.supabase
      .from("messages")
      .update({
        metadata: {
          ...existingMetadata,
          pending_receipt: nextPending,
          pending_receipt_at: new Date().toISOString(),
        },
      })
      .eq("id", receiptMessage.id);

    if (pendingError) {
      console.warn("[AI_AGENT] pending_receipt_save_failed", {
        messageId: receiptMessage.id,
        error: pendingError.message,
      });
      return false;
    }

    existingMetadata.pending_receipt = nextPending;
    return true;
  };

  // Incomplete extraction: only stash on message metadata — never write crm_payments / POST.
  if (!amount || !transactionCode || !bank) {
    const pendingSaved = await savePendingReceipt({
      amount,
      transaction_code: transactionCode,
      bank,
      comment,
    });
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: "Faltan amount, transaction_code o bank",
        hint: "Extrae los datos del comprobante o pídelos. No hagas handoff.",
        crm_payment_saved: false,
        pending_receipt_saved: pendingSaved,
      },
    };
  }

  // Stash complete extraction for a later turn (e.g. after cedula) without CRM insert yet.
  await savePendingReceipt({
    amount,
    transaction_code: transactionCode,
    bank,
    comment,
  });

  const amountBs = parseBolivaresAmount(amount);
  if (!amountBs) {
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: "Monto inválido en bolívares",
        hint: "Verifica que el monto del comprobante sea legible y reintenta.",
        crm_payment_saved: false,
      },
    };
  }

  let bcvRate: number;
  let bcvAsOf: string;
  try {
    const rate = await getBcvRate();
    bcvRate = rate.rate;
    bcvAsOf = rate.asOf;
  } catch (error) {
    const message =
      error instanceof DolarVzlaError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo obtener la tasa BCV del día";

    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: message,
        hint: "No se pudo convertir el monto de Bs a USD. Reintenta en unos segundos.",
        crm_payment_saved: false,
      },
    };
  }

  const amountUsd = convertBsToUsd(amountBs, bcvRate);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: "No se pudo convertir el monto de Bs a USD",
        hint: "Verifica el monto y la tasa BCV del día.",
        crm_payment_saved: false,
      },
    };
  }

  const matchResult = resolvePaymentMatch(ctx, parsed.data.wispro_id);
  if (!matchResult.ok) {
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: matchResult.error,
        pending_receipt_saved: Boolean(receiptMessage?.id),
        crm_payment_saved: false,
        needs_cedula: ctx.lastLookupByWisproId.size === 0,
        hint:
          ctx.lastLookupByWisproId.size === 0
            ? "Datos del comprobante listos en el chat. Pide la cédula del abonado y luego lookup + submit. NO escalate."
            : matchResult.error,
      },
    };
  }

  const phoneId = resolvePhoneId(ctx);
  if (!phoneId) {
    const message = forClient(
      ctx,
      "No pudimos identificar tu número de WhatsApp. Un asesor te ayudará en breve.",
    );
    const label = await applyPaymentVerificationLabel(ctx);
    markHandoff(ctx, "payment_missing_phone", message);
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: "No hay phone_id WhatsApp para este chat",
        should_handoff: true,
        label_applied: label.applied,
        label_id: label.labelId,
        crm_payment_saved: false,
      },
      stopAgent: true,
      shouldHandoff: true,
      handoffMessage: message,
      handoffReason: "payment_missing_phone",
    };
  }

  const match = matchResult.match;
  const cedula =
    parsed.data.cedula ||
    match.customer.national_identification_number ||
    ctx.lastLookupCedula ||
    ctx.linkedCedula;

  if (!cedula) {
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: "Falta cédula",
        hint: "Pide la cédula y haz lookup_wispro_by_cedula. No hagas handoff.",
        needs_cedula: true,
        crm_payment_saved: false,
        pending_receipt_saved: Boolean(receiptMessage?.id),
      },
    };
  }

  const payload = {
    client_id: match.customer.id,
    amount: String(amountUsd),
    transaction_code: transactionCode,
    bank,
    name: match.customer.name,
    cedula,
    phone_id: phoneId,
  };

  // Single CRM write + Innover POST only when all required fields are present.
  const persisted = await persistReceiptToCrm(ctx, {
    receiptMessage,
    clientName: payload.name,
    cedula: payload.cedula,
    amount: payload.amount,
    bank: payload.bank,
    transactionCode: payload.transaction_code,
    comment,
    wisproClientId: payload.client_id,
    phoneId: payload.phone_id,
    status: "EN_PROCESO",
    extraMetadata: {
      extracted_at: new Date().toISOString(),
      extraction_incomplete: false,
      amount_bs: amountBs,
      amount_usd: amountUsd,
      bcv_rate: bcvRate,
      bcv_as_of: bcvAsOf,
    },
  });

  if (!persisted.ok || (!persisted.payment && !persisted.duplicate)) {
    return {
      name: SUBMIT_PAYMENT_RECEIPT_TOOL,
      ok: false,
      response: {
        ok: false,
        error: "No se pudo guardar el pago en CRM",
        hint: "Reintenta submit_payment_receipt. No digas que el pago quedó registrado.",
        crm_payment_saved: false,
      },
    };
  }

  let innoverStatus: number | null = null;
  let innoverBody: unknown = null;
  let innoverError: string | null = null;

  try {
    const result = await submitInnoverPayment(payload);
    innoverStatus = result.status;
    innoverBody = result.body;
  } catch (error) {
    innoverError =
      error instanceof InnoverPaymentsError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo registrar el pago en Innover";
    console.warn("[AI_AGENT] innover_soft_fail", {
      messageId: receiptMessage?.id ?? null,
      error: innoverError,
    });
  }

  if (persisted.payment?.id) {
    await applyCrmPaymentExtraction(ctx.supabase, {
      messageId: receiptMessage?.id ?? ctx.triggerMessageId,
      clientId: ctx.clientId,
      conversationId: ctx.conversationId,
      wisproClientId: payload.client_id,
      clientName: payload.name,
      cedula: payload.cedula,
      amount: payload.amount,
      bank: payload.bank,
      transactionCode: payload.transaction_code,
      comment,
      status: "EN_PROCESO",
      source: ctx.paymentRequestedByAgentId ? "advisor" : "ai",
      externalApiStatus: innoverStatus,
      externalResponse: innoverBody,
      errorMessage: innoverError,
      receiptMetadata: {
        innover_soft_fail: Boolean(innoverError),
        amount_bs: amountBs,
        amount_usd: amountUsd,
        bcv_rate: bcvRate,
        bcv_as_of: bcvAsOf,
      },
    });
  }

  // Silent Wispro payment promise. Never changes the client-facing message.
  let promiseMetadata: Record<string, unknown> = {
    payment_promise_created: false,
    payment_promise_source: "auto_submit",
  };
  let promiseCreated = false;

  try {
    const debtUsd = Number(match.invoicing.debt) || 0;
    const promiseResult = await createPaymentPromiseForClient({
      wisproClientId: payload.client_id,
      cedula: payload.cedula,
      hours: DEFAULT_PAYMENT_PROMISE_HOURS,
      amountUsd,
      debtUsd,
    });

    promiseCreated = promiseResult.ok;
    promiseMetadata = promiseResult.ok
      ? {
          payment_promise_created: true,
          payment_promise_id: promiseResult.promise.id,
          payment_promise_contract_id: promiseResult.contract.id,
          payment_promise_valid_until: promiseResult.validUntil,
          payment_promise_source: "auto_submit",
          payment_promise_error: null,
          payment_promise_amount_usd: amountUsd,
          payment_promise_debt_usd: debtUsd,
        }
      : {
          payment_promise_created: false,
          payment_promise_id: null,
          payment_promise_contract_id: null,
          payment_promise_valid_until: null,
          payment_promise_source: "auto_submit",
          payment_promise_error: promiseResult.error,
          payment_promise_skip_reason: promiseResult.reason,
          payment_promise_amount_usd: amountUsd,
          payment_promise_debt_usd: debtUsd,
        };
  } catch (promiseError) {
    console.warn("[AI_PAYMENT] promise_unexpected_error", {
      error:
        promiseError instanceof Error
          ? promiseError.message
          : String(promiseError),
    });
    promiseMetadata = {
      payment_promise_created: false,
      payment_promise_source: "auto_submit",
      payment_promise_error:
        promiseError instanceof Error
          ? promiseError.message
          : "Error inesperado al crear promesa",
    };
  }

  if (receiptMessage?.id) {
    const { error: updateError } = await ctx.supabase
      .from("messages")
      .update({
        metadata: {
          ...existingMetadata,
          payment_submitted: true,
          payment_submitted_at: new Date().toISOString(),
          payment_submitted_run_id: ctx.runId,
          payment_submitted_payload: payload,
          payment_api_status: innoverStatus,
          payment_submit_error: innoverError,
          payment_comment: comment,
          payment_amount_bs: amountBs,
          payment_amount_usd: amountUsd,
          payment_bcv_rate: bcvRate,
          payment_bcv_as_of: bcvAsOf,
          pending_receipt: null,
          crm_payment_id: persisted.payment?.id ?? null,
          crm_payment_duplicate: persisted.duplicate,
          ...promiseMetadata,
        },
      })
      .eq("id", receiptMessage.id);

    if (updateError) {
      console.warn("[AI_PAYMENT] metadata_update_failed", {
        messageId: receiptMessage.id,
        error: updateError.message,
      });
    }
  }

  const message = forClient(
    ctx,
    "Registramos tu comprobante de pago. Un asesor lo verificará en breve.",
  );
  const label = await applyPaymentVerificationLabel(ctx);
  markHandoff(ctx, "payment_submitted", message);

  return {
    name: SUBMIT_PAYMENT_RECEIPT_TOOL,
    ok: true,
    response: {
      ok: true,
      alreadyProcessed: false,
      submitted: true,
      should_handoff: true,
      message_id: receiptMessage?.id ?? null,
      crm_payment_id: persisted.payment?.id ?? null,
      client_id: payload.client_id,
      amount: payload.amount,
      transaction_code: payload.transaction_code,
      bank: payload.bank,
      name: payload.name,
      cedula: payload.cedula,
      label_applied: label.applied,
      label_id: label.labelId,
      payment_promise_created: promiseCreated,
      hint: message,
    },
    stopAgent: true,
    shouldHandoff: true,
    handoffMessage: message,
    handoffReason: "payment_submitted",
  };
};

const handleEscalate = async (
  ctx: AgentRunContext,
  rawArgs: unknown,
): Promise<ToolHandlerResult> => {
  const parsed = escalateHumanArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      name: ESCALATE_HUMAN_TOOL,
      ok: false,
      response: {
        ok: false,
        error: parsed.error.issues[0]?.message || "Argumentos inválidos",
      },
    };
  }

  const candidateMessage =
    parsed.data.message?.trim() ||
    "Un asesor de nuestro equipo continuará contigo en breve.";
  const message = forClient(
    ctx,
    isUnsafeCustomerReply(candidateMessage)
      ? SAFE_INTERNAL_LEAK_CUSTOMER_REPLY
      : candidateMessage,
  );

  const isSupport =
    parsed.data.category === "support" ||
    looksLikeSupportReason(parsed.data.reason);

  let labelApplied = false;
  let labelId: number | null = null;
  if (isSupport) {
    const label = await ensureConversationLabel(
      ctx.supabase,
      ctx.conversationId,
      "soporte",
    );
    labelApplied = label.applied;
    labelId = label.labelId;
  }

  const handoffReason = isSupport
    ? `support:${parsed.data.reason}`
    : parsed.data.reason;

  markHandoff(ctx, handoffReason, message);

  return {
    name: ESCALATE_HUMAN_TOOL,
    ok: true,
    response: {
      ok: true,
      escalated: true,
      reason: parsed.data.reason,
      category: isSupport ? "support" : "general",
      label_applied: labelApplied,
      label_id: labelId,
      message_queued: message,
    },
    stopAgent: true,
    shouldHandoff: true,
    handoffMessage: message,
    handoffReason,
  };
};

export const executeAgentTool = async (
  ctx: AgentRunContext,
  toolName: string,
  rawArgs: unknown,
): Promise<ToolHandlerResult> => {
  const started = Date.now();

  if (
    ctx.allowedToolNames &&
    ctx.allowedToolNames.length > 0 &&
    !ctx.allowedToolNames.includes(toolName)
  ) {
    const blocked: ToolHandlerResult = {
      name: toolName,
      ok: false,
      response: {
        ok: false,
        error: `Tool no permitida en modo ${ctx.replyMode || "restricted"}: ${toolName}`,
        hint:
          ctx.replyMode === "after_hours_payments"
            ? "Fuera de oficina solo puedes gestionar pagos/comprobantes. Informa el horario inyectado y que un asesor atenderá el resto al abrir. No digas “en breve”."
            : "Tool no disponible en este modo.",
      },
    };

    await auditToolInvocation(ctx.supabase, {
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      toolName,
      args: rawArgs,
      result: blocked.response,
      ok: false,
      durationMs: Date.now() - started,
      error: String(blocked.response.error),
    });

    return blocked;
  }

  let result: ToolHandlerResult;

  switch (toolName) {
    case LOOKUP_WISPRO_TOOL:
      result = await handleLookup(ctx, rawArgs);
      break;
    case GET_BCV_RATE_TOOL:
      result = await handleGetBcvRate();
      break;
    case LINK_WISPRO_TOOL:
      result = await handleLink(ctx, rawArgs);
      break;
    case SUBMIT_PAYMENT_RECEIPT_TOOL:
      result = await handleSubmitPaymentReceipt(ctx, rawArgs);
      break;
    case ESCALATE_HUMAN_TOOL:
      result = await handleEscalate(ctx, rawArgs);
      break;
    default:
      result = {
        name: toolName,
        ok: false,
        response: {
          ok: false,
          error: `Tool no soportada: ${toolName}`,
        },
      };
  }

  await auditToolInvocation(ctx.supabase, {
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    toolName: result.name,
    args: rawArgs,
    result: result.response,
    ok: result.ok,
    durationMs: Date.now() - started,
    error: result.ok ? null : String(result.response.error || "tool_failed"),
  });

  console.log(`[AI_AGENT] tool_${result.ok ? "ok" : "fail"}`, {
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    toolName: result.name,
    ok: result.ok,
    shouldHandoff: result.shouldHandoff ?? false,
    durationMs: Date.now() - started,
  });

  return result;
};
