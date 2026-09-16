import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPaymentApprovedLabels,
} from "@/app/api/crm/_lib/conversation-labels";
import {
  assignConversationToAgent,
  resolveConversationIdForPayment,
} from "@/app/api/crm/_lib/conversation-assign";

export type PaymentReviewOwnershipResult = {
  conversationId: number | null;
  assigned: boolean;
  agentId: number;
  agentName: string | null;
  labels: {
    pagadoApiApplied: boolean;
    pagadoApiLabelId: number | null;
    verificarPagoRemoved: boolean;
  } | null;
  skipReason: "no_conversation" | "assign_failed" | null;
};

const mergePaymentReceiptMetadata = async (
  supabase: SupabaseClient,
  paymentId: string,
  patch: Record<string, unknown>,
) => {
  const { data: row } = await supabase
    .from("crm_payments")
    .select("receipt_metadata")
    .eq("id", paymentId)
    .maybeSingle();

  const current =
    row?.receipt_metadata && typeof row.receipt_metadata === "object"
      ? (row.receipt_metadata as Record<string, unknown>)
      : {};

  await supabase
    .from("crm_payments")
    .update({
      receipt_metadata: {
        ...current,
        ...patch,
      },
    })
    .eq("id", paymentId);
};

/**
 * After approve/reject: resolve chat, assign to reviewing advisor,
 * and on approve apply PAGADO API labels. Soft on missing chat; reports assign failures.
 */
export const applyPaymentReviewOwnership = async (
  supabase: SupabaseClient,
  input: {
    paymentId: string;
    conversationId?: number | null;
    clientId?: number | null;
    agentId: number;
    action: "approve" | "reject";
  },
): Promise<PaymentReviewOwnershipResult> => {
  const agentId = Number(input.agentId);
  const conversationId = await resolveConversationIdForPayment(supabase, {
    conversationId: input.conversationId,
    clientId: input.clientId,
  });

  if (!conversationId) {
    console.warn("[CRM_PAYMENTS] review_no_conversation", {
      paymentId: input.paymentId,
      action: input.action,
      agentId,
      clientId: input.clientId ?? null,
    });
    return {
      conversationId: null,
      assigned: false,
      agentId,
      agentName: null,
      labels: null,
      skipReason: "no_conversation",
    };
  }

  let labels: PaymentReviewOwnershipResult["labels"] = null;
  if (input.action === "approve") {
    try {
      const applied = await applyPaymentApprovedLabels(supabase, conversationId);
      labels = {
        pagadoApiApplied: applied.pagadoApi.applied,
        pagadoApiLabelId: applied.pagadoApi.labelId,
        verificarPagoRemoved: applied.verificarPagoRemoved,
      };
    } catch (labelError) {
      console.warn("[CRM_PAYMENTS] pagado_api_label_soft_failed", {
        paymentId: input.paymentId,
        conversationId,
        error:
          labelError instanceof Error
            ? labelError.message
            : String(labelError),
      });
    }
  }

  const assigned = await assignConversationToAgent(supabase, {
    conversationId,
    agentId,
  });

  const assignMeta = {
    assigned: assigned.assigned,
    agent_id: agentId,
    agent_name: assigned.agentName,
    action: input.action,
    at: new Date().toISOString(),
  };

  const labelMeta = labels
    ? {
        pagado_api_applied: labels.pagadoApiApplied,
        pagado_api_label_id: labels.pagadoApiLabelId,
        verificar_pago_removed: labels.verificarPagoRemoved,
      }
    : null;

  try {
    await mergePaymentReceiptMetadata(supabase, input.paymentId, {
      payment_review_assign: assignMeta,
      ...(labelMeta ? { payment_approved_labels: labelMeta } : {}),
    });
  } catch (metaError) {
    console.warn("[CRM_PAYMENTS] review_metadata_soft_failed", {
      paymentId: input.paymentId,
      error:
        metaError instanceof Error ? metaError.message : String(metaError),
    });
  }

  if (!assigned.assigned) {
    console.warn("[CRM_PAYMENTS] review_assign_failed", {
      paymentId: input.paymentId,
      conversationId,
      agentId,
      action: input.action,
    });
  } else {
    console.log("[CRM_PAYMENTS] review_ownership_ok", {
      paymentId: input.paymentId,
      conversationId,
      agentId,
      agentName: assigned.agentName,
      action: input.action,
    });
  }

  return {
    conversationId,
    assigned: assigned.assigned,
    agentId,
    agentName: assigned.agentName,
    labels,
    skipReason: assigned.assigned ? null : "assign_failed",
  };
};

/**
 * Merge patch into receipt_metadata without clobbering sibling keys.
 * Use after WhatsApp notify / other side effects.
 */
export const patchPaymentReceiptMetadata = mergePaymentReceiptMetadata;
