import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  CRM_PAYMENT_STATUSES,
  approveCrmPayment,
  getCrmPaymentById,
  isCrmPaymentReadyForApproval,
  listCrmPayments,
  markCrmPaymentApprovalError,
  rejectCrmPayment,
} from "@/app/api/crm/_lib/crm-payments";
import {
  createWisproInvoicingPayment,
  latestInvoiceCacheKeyForPayment,
  listPendingInvoicesForClient,
  resolveLatestPendingInvoiceDate,
  resolveLatestPendingInvoiceDatesForClients,
  withOrganizationWispro,
} from "@/app/api/crm/_lib/wispro-api";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getOrganizationIntegration } from "@/app/api/crm/_lib/organization-integrations";
import { matchInvoicesToPaymentAmount } from "@/app/api/crm/_lib/wispro-invoice-match";
import { getCrmSettings } from "@/app/api/crm/_lib/crm-settings";
import {
  applyPaymentReviewOwnership,
  patchPaymentReceiptMetadata,
} from "@/app/api/crm/_lib/payment-review-ownership";
import { buildPaymentSuccessMessage } from "@/app/crm/_lib/payment-success-message";

type PaymentWithLatestInvoice = Awaited<
  ReturnType<typeof listCrmPayments>
>["payments"][number] & {
  latest_invoice_date: string | null;
};

const readLatestInvoiceDateFromMetadata = (
  metadata: Record<string, unknown> | null | undefined,
): string | null => {
  if (!metadata || typeof metadata !== "object") return null;

  const direct = metadata.latest_invoice_date;
  if (typeof direct === "string" && /^\d{4}-\d{2}-\d{2}/.test(direct.trim())) {
    return direct.trim().slice(0, 10);
  }

  const match = metadata.wispro_invoice_match;
  if (!match || typeof match !== "object") return null;
  const matchRecord = match as Record<string, unknown>;

  if (
    typeof matchRecord.latest_invoice_date === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(matchRecord.latest_invoice_date.trim())
  ) {
    return matchRecord.latest_invoice_date.trim().slice(0, 10);
  }

  const invoices = Array.isArray(matchRecord.invoices)
    ? matchRecord.invoices
    : [];
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const item of invoices) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const raw = String(row.issued_at || row.issuedAt || "").trim();
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms) || ms < bestMs) continue;
    bestMs = ms;
    best = raw.slice(0, 10);
  }
  return best;
};

const enrichPaymentsWithLatestInvoiceDate = async (
  payments: Awaited<ReturnType<typeof listCrmPayments>>["payments"],
): Promise<PaymentWithLatestInvoice[]> => {
  const needsLiveLookup = payments.filter((payment) => {
    if (readLatestInvoiceDateFromMetadata(payment.receipt_metadata)) {
      return false;
    }
    const openForReview =
      payment.status === "RECIBIDO" ||
      payment.status === "EN_PROCESO" ||
      payment.status === "ERROR";
    if (!openForReview) return false;
    return Boolean(latestInvoiceCacheKeyForPayment(payment));
  });

  const dateByKey =
    needsLiveLookup.length > 0
      ? await resolveLatestPendingInvoiceDatesForClients(
          needsLiveLookup.map((payment) => ({
            wisproClientId: payment.wispro_client_id,
            cedula: payment.cedula,
          })),
        )
      : new Map<string, string | null>();

  return payments.map((payment) => {
    const fromMeta = readLatestInvoiceDateFromMetadata(payment.receipt_metadata);
    if (fromMeta) {
      return { ...payment, latest_invoice_date: fromMeta };
    }

    const key = latestInvoiceCacheKeyForPayment(payment);
    return {
      ...payment,
      latest_invoice_date: key ? (dateByKey.get(key) ?? null) : null,
    };
  });
};

const GRAPH_API_VERSION = "v19.0";

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

const getServiceClient = () =>
  createClient(
    getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

const normalizeWhatsAppPhone = (phone: string) => phone.replace(/\D/g, "");

const wasPaymentNotificationSent = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object") return false;
  const value = (metadata as Record<string, unknown>).payment_loaded_notified_at;
  return typeof value === "string" && value.trim().length > 0;
};

const resolvePaymentRecipientPhone = async (
  supabase: ReturnType<typeof getServiceClient>,
  input: {
    conversationId: number | null;
    clientId: number | null;
    organizationId: string;
  },
) => {
  const knownPhones: string[] = [];

  if (input.conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, client_id, customer_phone")
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<{
        id: number;
        client_id: number | null;
        customer_phone: string | null;
      }>();

    if (conversation?.customer_phone) {
      knownPhones.push(normalizeWhatsAppPhone(conversation.customer_phone));
    }

    if (!input.clientId) {
      input.clientId = conversation?.client_id ?? null;
    }
  }

  if (input.clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("phone, whatsapp_id")
      .eq("id", input.clientId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<{
        phone: string | null;
        whatsapp_id: string | null;
      }>();

    if (client?.whatsapp_id) {
      knownPhones.unshift(normalizeWhatsAppPhone(client.whatsapp_id));
    }
    if (client?.phone) {
      knownPhones.push(normalizeWhatsAppPhone(client.phone));
    }
  }

  const uniquePhones = [...new Set(knownPhones.filter(Boolean))];
  const recipient = uniquePhones.find(
    (phone) => phone.length >= 8 && phone.length <= 15,
  );

  return recipient || null;
};

const sendWhatsAppPaymentApprovedMessage = async (
  organizationId: string,
  to: string,
  message: string,
) => {
  const whatsapp = await getOrganizationIntegration(
    organizationId,
    "whatsapp",
  );
  const phoneNumberId = String(whatsapp.config.phone_number_id || "");
  const waResponse = await fetch(
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsapp.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message },
      }),
      cache: "no-store",
    },
  );

  const waData = (await waResponse.json()) as {
    error?: { message?: string };
    messages?: Array<{ id?: string }>;
  };
  if (!waResponse.ok || waData.error) {
    throw new Error(waData.error?.message || "Error al enviar WhatsApp");
  }

  return String(waData.messages?.[0]?.id || "").trim() || null;
};

const notifyClientPaymentApproved = async (
  supabase: ReturnType<typeof getServiceClient>,
  input: {
    payment: NonNullable<Awaited<ReturnType<typeof getCrmPaymentById>>>;
    conversationId: number | null;
  },
) => {
  if (wasPaymentNotificationSent(input.payment.receipt_metadata)) {
    return { sent: false, skipped: "already_sent" as const };
  }

  const recipientPhone = await resolvePaymentRecipientPhone(supabase, {
    conversationId: input.conversationId,
    clientId: input.payment.client_id,
    organizationId: input.payment.organization_id,
  });
  if (!recipientPhone) {
    return { sent: false, skipped: "missing_phone" as const };
  }

  const settings = await getCrmSettings(
    supabase,
    input.payment.organization_id,
  );
  const message = buildPaymentSuccessMessage({
    template: settings.payment_success_message,
    paymentDate: input.payment.payment_date,
  });

  const waMessageId = await sendWhatsAppPaymentApprovedMessage(
    input.payment.organization_id,
    recipientPhone,
    message,
  );
  const now = new Date().toISOString();

  if (input.conversationId) {
    await supabase.from("messages").insert({
      organization_id: input.payment.organization_id,
      conversation_id: input.conversationId,
      wa_message_id: waMessageId,
      type: "out",
      content: message,
      sender_type: "bot",
      sent_by: "Bot IA",
      status: "sent",
      metadata: {
        crm_payment_id: input.payment.id,
        payment_loaded_notice: true,
      },
      created_at: now,
    });

    await supabase
      .from("conversations")
      .update({
        preview: message,
        updated_at: now,
        last_message_at: now,
      })
      .eq("id", input.conversationId)
      .eq("organization_id", input.payment.organization_id);
  }

  const nextMetadata = {
    payment_loaded_notified_at: now,
    payment_loaded_notified_wa_message_id: waMessageId,
    payment_loaded_notified_to: recipientPhone,
  };

  // Merge — do not replace whole receipt_metadata (preserves assign/label audit).
  const { data: latest } = await supabase
    .from("crm_payments")
    .select("receipt_metadata")
    .eq("id", input.payment.id)
    .maybeSingle();

  const currentMeta =
    latest?.receipt_metadata && typeof latest.receipt_metadata === "object"
      ? (latest.receipt_metadata as Record<string, unknown>)
      : input.payment.receipt_metadata || {};

  await supabase
    .from("crm_payments")
    .update({
      receipt_metadata: {
        ...currentMeta,
        ...nextMetadata,
      },
    })
    .eq("id", input.payment.id);

  return { sent: true, skipped: null };
};

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined ? undefined : value;

const isoDateSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional(),
);

const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(80).optional(),
);

const listQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  status: z.preprocess(
    emptyToUndefined,
    z.enum(CRM_PAYMENT_STATUSES).optional(),
  ),
  bank: optionalText,
  q: optionalText,
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  /** Required: advisor reviewing the payment (owns the client chat after review). */
  agent_id: z.coerce
    .number()
    .int()
    .positive("agent_id es requerido para aprobar o rechazar"),
});

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let listFilters: z.infer<typeof listQuerySchema> | null = null;

  try {
    const parsed = listQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Filtros inválidos" },
        { status: 400 },
      );
    }

    listFilters = parsed.data;
    const context = await getCrmAuthContext(req);
    const supabase = getServiceClient();
    const result = await listCrmPayments(
      supabase,
      listFilters,
      context.organizationId,
    );
    const payments = await withOrganizationWispro(
      context.organizationId,
      () => enrichPaymentsWithLatestInvoiceDate(result.payments),
    );
    const durationMs = Date.now() - startedAt;

    console.log("[CRM_PAYMENTS] list_ok", {
      count: payments.length,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      from: listFilters.from ?? null,
      to: listFilters.to ?? null,
      status: listFilters.status ?? null,
      bank: listFilters.bank ?? null,
      q: listFilters.q ? "[redacted]" : null,
      hasQuery: Boolean(listFilters.q?.trim()),
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      payments,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing environment")) {
      return NextResponse.json(
        { error: "Supabase no está configurado en el servidor" },
        { status: 503 },
      );
    }

    console.error("[CRM_PAYMENTS] list_failed", {
      error: error instanceof Error ? error.message : String(error),
      from: listFilters?.from ?? null,
      to: listFilters?.to ?? null,
      status: listFilters?.status ?? null,
      bank: listFilters?.bank ?? null,
      hasQuery: Boolean(listFilters?.q?.trim()),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los pagos",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    if (context.agentId !== parsed.data.agent_id) {
      return NextResponse.json(
        { error: "No puedes procesar pagos en nombre de otro asesor" },
        { status: 403 },
      );
    }
    const supabase = getServiceClient();

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, status, role, department")
      .eq("id", parsed.data.agent_id)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: "El agente especificado no existe o no tiene permisos" },
        { status: 403 },
      );
    }

    if (agent.status === "inactive") {
      return NextResponse.json(
        { error: "El agente está inactivo y no puede gestionar pagos" },
        { status: 403 },
      );
    }

    // Segregación de funciones: Asesores de soporte no pueden procesar pagos
    if (agent.role !== "admin" && agent.department === "soporte") {
      return NextResponse.json(
        {
          error:
            "Los asesores de Soporte Técnico no están autorizados para procesar pagos. La aprobación o rechazo financiero corresponde al departamento de Cobranzas y Administradores.",
        },
        { status: 403 },
      );
    }

    const currentPayment = await getCrmPaymentById(
      supabase,
      parsed.data.id,
      context.organizationId,
    );

    if (!currentPayment) {
      return NextResponse.json(
        { error: "Pago no encontrado" },
        { status: 404 },
      );
    }

    const canReview =
      currentPayment.status === "RECIBIDO" ||
      currentPayment.status === "EN_PROCESO" ||
      currentPayment.status === "ERROR";
    if (!canReview) {
      return NextResponse.json(
        { error: "Este pago ya fue procesado" },
        { status: 409 },
      );
    }

    if (parsed.data.action === "reject") {
      const payment = await rejectCrmPayment(supabase, currentPayment.id);
      const ownership = await applyPaymentReviewOwnership(supabase, {
        paymentId: currentPayment.id,
        conversationId: payment?.conversation_id ?? currentPayment.conversation_id,
        clientId: payment?.client_id ?? currentPayment.client_id,
        agentId: parsed.data.agent_id,
        action: "reject",
      });

      return NextResponse.json({
        ok: true,
        payment,
        conversation_id: ownership.conversationId,
        assigned: ownership.assigned,
        assigned_agent_id: ownership.agentId,
        assigned_agent_name: ownership.agentName,
        assign_skip_reason: ownership.skipReason,
      });
    }

    if (currentPayment.status === "RECIBIDO") {
      return NextResponse.json(
        { error: "El comprobante aún no tiene todos los datos para aprobarlo" },
        { status: 400 },
      );
    }

    if (!isCrmPaymentReadyForApproval(currentPayment)) {
      return NextResponse.json(
        {
          error:
            "Faltan cédula, monto, banco, referencia o cliente Wispro para aprobar",
        },
        { status: 400 },
      );
    }

    if (!currentPayment.wispro_client_id) {
      return NextResponse.json(
        { error: "El pago no tiene cliente Wispro vinculado" },
        { status: 400 },
      );
    }

    try {
      let invoiceMatchMeta: Record<string, unknown> = {
        attempted_at: new Date().toISOString(),
        strategy: "none",
        invoice_ids: [],
      };
      let invoiceIds: string[] = [];

      try {
        const pendingInvoices = await withOrganizationWispro(
          context.organizationId,
          () =>
            listPendingInvoicesForClient({
              wisproClientId: currentPayment.wispro_client_id,
              cedula: currentPayment.cedula,
            }),
        );
        const latestInvoiceDate =
          resolveLatestPendingInvoiceDate(pendingInvoices);
        const match = matchInvoicesToPaymentAmount(
          pendingInvoices.map((invoice) => ({
            id: invoice.id,
            balance: invoice.balance,
            amount: invoice.amount,
            issuedAt: invoice.issued_at,
            firstDueDate: invoice.first_due_date,
            invoiceNumber: invoice.invoice_number,
            state: invoice.state,
          })),
          Number(currentPayment.amount),
        );
        invoiceIds = match.invoiceIds;
        const matchedById = new Map(
          pendingInvoices.map((invoice) => [invoice.id, invoice]),
        );
        invoiceMatchMeta = {
          attempted_at: new Date().toISOString(),
          strategy: match.strategy,
          invoice_ids: match.invoiceIds,
          matched_amount: match.matchedAmount,
          unmatched_amount: match.unmatchedAmount,
          open_invoices_count: pendingInvoices.length,
          latest_invoice_date: latestInvoiceDate,
          invoices: match.invoices.map((item) => ({
            ...item,
            issued_at: matchedById.get(item.id)?.issued_at ?? null,
          })),
        };
      } catch (invoiceError) {
        invoiceMatchMeta = {
          attempted_at: new Date().toISOString(),
          strategy: "none",
          invoice_ids: [],
          latest_invoice_date: null,
          error:
            invoiceError instanceof Error
              ? invoiceError.message
              : "No se pudieron consultar facturas pendientes",
        };
        console.warn("[CRM_PAYMENTS] invoice_match_soft_failed", {
          paymentId: currentPayment.id,
          wisproClientId: currentPayment.wispro_client_id,
          error: invoiceMatchMeta.error,
        });
      }

      const latestInvoiceDate =
        typeof invoiceMatchMeta.latest_invoice_date === "string"
          ? invoiceMatchMeta.latest_invoice_date
          : null;

      const paymentForApprove = {
        ...currentPayment,
        receipt_metadata: {
          ...(currentPayment.receipt_metadata || {}),
          latest_invoice_date: latestInvoiceDate,
          wispro_invoice_match: invoiceMatchMeta,
        },
      };

      const wisproPayment = await withOrganizationWispro(
        context.organizationId,
        () =>
          createWisproInvoicingPayment({
            clientId: currentPayment.wispro_client_id!,
            amount: Number(currentPayment.amount),
            paymentDate: currentPayment.payment_date,
            transactionCode: currentPayment.transaction_code,
            invoiceIds,
            comment: [
              "Pago aprobado desde CRM",
              `Banco: ${currentPayment.bank}`,
              `Referencia: ${currentPayment.transaction_code}`,
              currentPayment.comment
                ? `Comentario: ${currentPayment.comment}`
                : null,
              invoiceIds.length
                ? `Facturas: ${invoiceIds.join(", ")}`
                : "Sin facturas vinculadas (crédito a cuenta)",
            ]
              .filter(Boolean)
              .join(" | "),
          }),
      );

      const payment = await approveCrmPayment(supabase, {
        payment: paymentForApprove,
        wisproPayment,
      });

      const ownership = await applyPaymentReviewOwnership(supabase, {
        paymentId: currentPayment.id,
        conversationId:
          payment?.conversation_id ?? currentPayment.conversation_id,
        clientId: payment?.client_id ?? currentPayment.client_id,
        agentId: parsed.data.agent_id,
        action: "approve",
      });

      try {
        await notifyClientPaymentApproved(supabase, {
          payment: payment || currentPayment,
          conversationId:
            ownership.conversationId ?? currentPayment.conversation_id,
        });
      } catch (notificationError) {
        await patchPaymentReceiptMetadata(supabase, currentPayment.id, {
          payment_loaded_notification_error:
            notificationError instanceof Error
              ? notificationError.message
              : "No se pudo notificar por WhatsApp",
          payment_loaded_notification_error_at: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        ok: true,
        payment,
        wisproPayment,
        conversation_id: ownership.conversationId,
        assigned: ownership.assigned,
        assigned_agent_id: ownership.agentId,
        assigned_agent_name: ownership.agentName,
        assign_skip_reason: ownership.skipReason,
      });
    } catch (approvalError) {
      const message =
        approvalError instanceof Error
          ? approvalError.message
          : "No se pudo registrar el pago en Wispro";

      const payment = await markCrmPaymentApprovalError(supabase, {
        paymentId: currentPayment.id,
        message,
      });

      return NextResponse.json(
        {
          ok: false,
          error: message,
          payment,
        },
        { status: 502 },
      );
    }

  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing environment")) {
      return NextResponse.json(
        { error: "Supabase no está configurado en el servidor" },
        { status: 503 },
      );
    }

    console.error("[CRM_PAYMENTS_API] update_failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el pago",
      },
      { status: 500 },
    );
  }
}
