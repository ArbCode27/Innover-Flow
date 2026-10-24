"use client";

import {
  ArrowDown,
  ArrowUp,
  Bitcoin,
  CreditCard,
  Globe,
  Pencil,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  getPaymentMethodUiStatus,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_UI_STATUS_LABELS,
  paymentMethodDestinationSummary,
  type OrganizationPaymentMethod,
  type PaymentMethodKey,
  type PaymentMethodUiStatus,
} from "../../_lib/payment-methods";
import { CRM_SURFACES, CRM_TABLE } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

const STATUS_BADGE_CLASS: Record<PaymentMethodUiStatus, string> = {
  active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  incomplete:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  hidden: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

interface PaymentMethodsTableProps {
  methods: OrganizationPaymentMethod[];
  canEdit: boolean;
  busyKey: PaymentMethodKey | null;
  onEdit: (methodKey: PaymentMethodKey) => void;
  onMove: (methodKey: PaymentMethodKey, direction: -1 | 1) => void;
}

export const PaymentMethodsTable = ({
  methods,
  canEdit,
  busyKey,
  onEdit,
  onMove,
}: PaymentMethodsTableProps) => {
  const ordered = [...methods].sort(
    (a, b) =>
      a.sort_order - b.sort_order || a.method_key.localeCompare(b.method_key),
  );

  return (
    <div className={CRM_TABLE}>
      <div className="overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow className={`${CRM_SURFACES.border} hover:bg-transparent`}>
              <TableHead className={CRM_SURFACES.textMuted}>Método</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Moneda</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Destino</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Estado</TableHead>
              <TableHead className={`text-right ${CRM_SURFACES.textMuted}`}>
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.length ? (
              ordered.map((method, index) => {
                const status = getPaymentMethodUiStatus(method);
                const busy = busyKey === method.method_key;
                const MethodIcon =
                  method.method_key === "pago_movil"
                    ? Smartphone
                    : method.method_key === "binance"
                      ? Bitcoin
                      : method.method_key === "zelle" ||
                          method.method_key === "paypal"
                        ? Globe
                        : CreditCard;

                return (
                  <TableRow
                    key={method.method_key}
                    className={cn(CRM_SURFACES.border, CRM_SURFACES.hover)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MethodIcon
                          className="size-4 shrink-0 text-crm-accent"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div
                            className={`truncate text-sm font-medium ${CRM_SURFACES.textPrimary}`}
                          >
                            {method.title ||
                              PAYMENT_METHOD_LABELS[method.method_key]}
                          </div>
                          <div className={`text-xs ${CRM_SURFACES.textMuted}`}>
                            {PAYMENT_METHOD_LABELS[method.method_key]}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={CRM_SURFACES.textSecondary}>
                      {method.currency === "USD" ? "USD" : "VES (Bs)"}
                    </TableCell>
                    <TableCell
                      className={`max-w-[16rem] truncate text-sm ${CRM_SURFACES.textSecondary}`}
                    >
                      {paymentMethodDestinationSummary(method)}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE_CLASS[status]}>
                        {PAYMENT_METHOD_UI_STATUS_LABELS[status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <CrmButton
                          type="button"
                          variant="secondary"
                          disabled={
                            !canEdit || index === 0 || Boolean(busyKey)
                          }
                          onClick={() => onMove(method.method_key, -1)}
                          aria-label={`Subir ${PAYMENT_METHOD_LABELS[method.method_key]}`}
                        >
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        </CrmButton>
                        <CrmButton
                          type="button"
                          variant="secondary"
                          disabled={
                            !canEdit ||
                            index === ordered.length - 1 ||
                            Boolean(busyKey)
                          }
                          onClick={() => onMove(method.method_key, 1)}
                          aria-label={`Bajar ${PAYMENT_METHOD_LABELS[method.method_key]}`}
                        >
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        </CrmButton>
                        <CrmButton
                          type="button"
                          variant="secondary"
                          disabled={!canEdit || busy}
                          onClick={() => onEdit(method.method_key)}
                          aria-label={`Editar ${PAYMENT_METHOD_LABELS[method.method_key]}`}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          {method.id ? "Editar" : "Configurar"}
                        </CrmButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow className={CRM_SURFACES.border}>
                <TableCell
                  colSpan={5}
                  className={`h-20 text-center ${CRM_SURFACES.textMuted}`}
                >
                  No hay métodos de pago configurados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
