"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CRM_SURFACES, CRM_TABLE } from "../../_lib/crm-theme";
import {
  canRejectPayment,
  formatPaymentAmount,
  formatPaymentDate,
  formatPaymentDateTime,
  formatPaymentField,
  isPaymentReadyForApproval,
  PAYMENT_PENDING_LABEL,
  type CrmPayment,
} from "../../_lib/payments";
import { StatusBadge } from "../shared/status-badge";
import { EmptyState } from "../shared/empty-state";
import { CheckCircle2, MessageCircle, Wallet, XCircle } from "lucide-react";
import { CrmButton } from "../shared/crm-button";

interface PaymentsTableProps {
  payments: CrmPayment[];
  updatingId: string | null;
  onApprove: (paymentId: string) => void;
  onReject: (paymentId: string) => void;
  onOpenChat?: (conversationId: number) => void;
}

const PaymentValue = ({
  value,
  className,
}: {
  value: string;
  className?: string;
}) => (
  <span
    className={
      value === PAYMENT_PENDING_LABEL
        ? `${CRM_SURFACES.textMuted} italic`
        : className
    }>
    {value}
  </span>
);

export const PaymentsTable = ({
  payments,
  updatingId,
  onApprove,
  onReject,
  onOpenChat,
}: PaymentsTableProps) => {
  if (!payments.length) {
    return (
      <div className={CRM_TABLE}>
        <EmptyState
          icon={Wallet}
          title="Sin comprobantes"
          description="Cuando un asesor o Nova registre un comprobante, aparecerá aquí aunque falten datos."
        />
      </div>
    );
  }

  return (
    <div className={`overflow-hidden ${CRM_TABLE}`}>
      <div className="overflow-x-auto">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow className={`${CRM_SURFACES.border} hover:bg-transparent`}>
              <TableHead className={CRM_SURFACES.textMuted}>Fecha</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Cliente</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Cédula</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Monto</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Banco</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Referencia</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Factura</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Estado</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Revisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const isUpdating = updatingId === payment.id;
              const clientName = formatPaymentField(payment.client_name);
              const canReject = canRejectPayment(payment);
              const canApprove = isPaymentReadyForApproval(payment);
              const approveHint = canApprove
                ? `Aprobar pago de ${clientName}`
                : "Faltan datos para aprobar este comprobante";
              const latestInvoiceDate = payment.latest_invoice_date?.trim()
                ? formatPaymentDate(payment.latest_invoice_date)
                : "—";
              const conversationId = Number(payment.conversation_id);
              const hasCrmChat =
                Number.isFinite(conversationId) && conversationId > 0;

              return (
                <TableRow
                  key={payment.id}
                  className={`${CRM_SURFACES.border} ${CRM_SURFACES.hover}`}>
                  <TableCell>
                    <div className={CRM_SURFACES.textPrimary}>
                      {formatPaymentDate(payment.payment_date)}
                    </div>
                    <div className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
                      {formatPaymentDateTime(payment.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={`font-medium ${CRM_SURFACES.textPrimary}`}>
                      <PaymentValue value={clientName} />
                    </div>
                    {payment.comment ? (
                      <div
                        className={`max-w-48 truncate text-[11px] ${CRM_SURFACES.textMuted}`}>
                        {payment.comment}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={`font-mono ${CRM_SURFACES.textSecondary}`}>
                    <PaymentValue value={formatPaymentField(payment.cedula)} />
                  </TableCell>
                  <TableCell
                    className={`font-medium ${CRM_SURFACES.textPrimary}`}>
                    <PaymentValue value={formatPaymentAmount(payment.amount)} />
                  </TableCell>
                  <TableCell className={CRM_SURFACES.textSecondary}>
                    <PaymentValue value={formatPaymentField(payment.bank)} />
                  </TableCell>
                  <TableCell className={`font-mono ${CRM_SURFACES.textMuted}`}>
                    <PaymentValue
                      value={formatPaymentField(payment.transaction_code)}
                    />
                  </TableCell>
                  <TableCell>
                    <div
                      className={
                        latestInvoiceDate === "—"
                          ? CRM_SURFACES.textMuted
                          : CRM_SURFACES.textPrimary
                      }
                      title="Fecha de la factura pendiente más reciente">
                      {latestInvoiceDate}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <CrmButton
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!hasCrmChat || !onOpenChat}
                        className="size-8 cursor-pointer text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed dark:text-emerald-400 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300"
                        title={
                          hasCrmChat
                            ? `Abrir chat de ${clientName}`
                            : "Este pago no tiene chat vinculado"
                        }
                        aria-label={
                          hasCrmChat
                            ? `Abrir chat de ${clientName}`
                            : "Este pago no tiene chat vinculado"
                        }
                        onClick={() => {
                          if (!hasCrmChat || !onOpenChat) return;
                          onOpenChat(conversationId);
                        }}>
                        <MessageCircle className="size-4" aria-hidden="true" />
                      </CrmButton>

                      {canReject ? (
                        <>
                          <CrmButton
                            type="button"
                            size="sm"
                            variant="success"
                            disabled={isUpdating || !canApprove}
                            title={approveHint}
                            onClick={() => onApprove(payment.id)}
                            aria-label={approveHint}>
                            <CheckCircle2
                              className="size-4"
                              aria-hidden="true"
                            />
                            Aprobar
                          </CrmButton>
                          <CrmButton
                            type="button"
                            size="sm"
                            variant="danger"
                            disabled={isUpdating}
                            onClick={() => onReject(payment.id)}
                            aria-label={`Rechazar pago de ${clientName}`}>
                            <XCircle className="size-4" aria-hidden="true" />
                            Rechazar
                          </CrmButton>
                        </>
                      ) : (
                        <span className={`text-xs ${CRM_SURFACES.textMuted}`}>
                          Sin acciones
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
