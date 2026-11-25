"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatPaymentAmount,
  formatPaymentField,
  type CrmPayment,
} from "../../_lib/payments";

interface PaymentsManualDialogProps {
  payment: CrmPayment | null;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const PaymentsManualDialog = ({
  payment,
  submitting = false,
  onOpenChange,
  onConfirm,
}: PaymentsManualDialogProps) => (
  <Dialog open={Boolean(payment)} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md sm:rounded-2xl">
      <DialogHeader>
        <DialogTitle>Aprobar sin Wispro</DialogTitle>
        <DialogDescription>
          No se registrará en el sistema de facturación porque ese registro ya se hizo a mano.
        </DialogDescription>
      </DialogHeader>

      {payment ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Cliente</dt>
            <dd>{formatPaymentField(payment.client_name)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Monto</dt>
            <dd>{formatPaymentAmount(payment.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Banco</dt>
            <dd>{formatPaymentField(payment.bank)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Referencia</dt>
            <dd>{formatPaymentField(payment.transaction_code)}</dd>
          </div>
        </dl>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          disabled={submitting}
          onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          className="cursor-pointer"
          disabled={submitting || !payment}
          onClick={onConfirm}>
          Aprobar sin Wispro
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
