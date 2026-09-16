import { useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCheck,
  FileText,
  HandCoins,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_BUBBLE, CRM_SURFACES } from "../../_lib/crm-theme";
import type { Message } from "../../_lib/types";
import { formatCrmTime } from "../../_lib/formatters";
import { MessageContent } from "./message-content";
import { CrmButton } from "../shared/crm-button";

interface MessageBubbleProps {
  message: Message;
  onProcessPaymentReceipt?: (messageId: number) => Promise<void>;
  onResendMessage?: (messageId: number) => Promise<void>;
  canRegisterManualPayment?: boolean;
  manualPaymentBlockReason?: string | null;
}

const statusLabel: Record<string, string> = {
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
};

const hasRequestedPaymentReceipt = (message: Message) => {
  const value = message.metadata?.payment_receipt_requested;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

export const MessageBubble = ({
  message,
  onProcessPaymentReceipt,
  onResendMessage,
  canRegisterManualPayment = true,
  manualPaymentBlockReason = null,
}: MessageBubbleProps) => {
  const [isProcessingPaymentReceipt, setIsProcessingPaymentReceipt] = useState(false);
  const [isResendingMessage, setIsResendingMessage] = useState(false);

  if (message.type === "note") {
    return (
      <div className="mx-auto flex max-w-[90%] items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-50/80 px-4 py-2 text-center text-xs italic text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        {message.content}
      </div>
    );
  }

  const isOutgoing = message.type === "out";
  const isBot = isOutgoing && message.sender_type === "bot";
  const isImageMessage =
    message.media_type === "image" && Boolean(message.media_url?.trim());
  const canProcessPaymentReceipt =
    Boolean(onProcessPaymentReceipt) && !isOutgoing && isImageMessage;
  const paymentReceiptRequested = hasRequestedPaymentReceipt(message);
  const isLocationMessage = message.media_type === "location";
  const canResendMessage =
    Boolean(onResendMessage) &&
    isOutgoing &&
    message.status === "failed" &&
    !message.media_type;
  const senderLabel = isOutgoing
    ? isBot
      ? message.sent_by?.trim() || "Bot IA"
      : message.sent_by?.trim() || "Agente"
    : "Cliente";
  const status = message.status || "sent";
  const StatusIcon =
    status === "read" ? CheckCheck : status === "failed" ? AlertCircle : Check;

  const handleProcessPaymentReceipt = async () => {
    if (!onProcessPaymentReceipt) return;
    if (!canRegisterManualPayment) {
      toast.error(
        manualPaymentBlockReason ||
          "Vincula el cliente a Wispro antes de registrar el pago",
      );
      return;
    }

    setIsProcessingPaymentReceipt(true);
    try {
      await onProcessPaymentReceipt(message.id);
      toast.success("Comprobante enviado a procesamiento");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo procesar el comprobante",
      );
    } finally {
      setIsProcessingPaymentReceipt(false);
    }
  };

  const handleResendMessage = async () => {
    if (!onResendMessage) return;

    setIsResendingMessage(true);
    try {
      await onResendMessage(message.id);
      toast.success("Mensaje reenviado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo reenviar el mensaje",
      );
    } finally {
      setIsResendingMessage(false);
    }
  };

  return (
    <div
      className={`flex max-w-[82%] flex-col gap-1 sm:max-w-[72%] ${
        isOutgoing ? "ml-auto items-end" : "mr-auto items-start"
      }`}>
      <div className={`flex items-center gap-1.5 text-[11px] ${CRM_SURFACES.textMuted}`}>
        <span>{senderLabel}</span>
        {isBot ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
            <Bot className="size-3" aria-hidden="true" />
            IA
          </span>
        ) : null}
      </div>
      {isLocationMessage ? (
        <MessageContent message={message} isOutgoing={isOutgoing} />
      ) : (
        <div
          className={`px-3.5 py-2.5 text-sm leading-relaxed ${
            isOutgoing ? CRM_BUBBLE.outgoing : CRM_BUBBLE.incoming
          }`}>
          <MessageContent message={message} isOutgoing={isOutgoing} />
        </div>
      )}
      <span className={`flex items-center gap-1 text-[10px] ${CRM_SURFACES.textMuted}`}>
        {formatCrmTime(message.created_at)}
        {isOutgoing ? (
          <>
            <StatusIcon
              className={`size-3 ${
                status === "read"
                  ? "text-crm-accent"
                  : status === "failed"
                    ? "text-red-500 dark:text-red-300"
                    : CRM_SURFACES.textMuted
              }`}
              aria-hidden="true"
            />
            <span className="sr-only">{statusLabel[status] || status}</span>
          </>
        ) : null}
      </span>
      {canResendMessage ? (
        <CrmButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={isResendingMessage}
          onClick={handleResendMessage}
          className="mt-1 h-7 px-2.5 text-[11px]"
          aria-label="Reenviar mensaje fallido">
          <RotateCcw className="size-3" aria-hidden="true" />
          {isResendingMessage ? "Reenviando..." : "Reenviar"}
        </CrmButton>
      ) : null}
      {canProcessPaymentReceipt ? (
        <CrmButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={
            isProcessingPaymentReceipt ||
            paymentReceiptRequested ||
            !canRegisterManualPayment
          }
          title={
            paymentReceiptRequested
              ? "Este comprobante ya fue enviado"
              : manualPaymentBlockReason || "Registrar pago del comprobante"
          }
          onClick={handleProcessPaymentReceipt}
          className="mt-1 h-7 px-2.5 text-[11px]"
          aria-label={
            paymentReceiptRequested
              ? "Comprobante ya enviado"
              : manualPaymentBlockReason || "Registrar pago"
          }>
          <HandCoins className="size-3" aria-hidden="true" />
          {paymentReceiptRequested
            ? "Comprobante enviado"
            : isProcessingPaymentReceipt
              ? "Procesando..."
              : "Registrar pago"}
        </CrmButton>
      ) : null}
    </div>
  );
};
