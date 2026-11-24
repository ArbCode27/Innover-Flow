"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SaeCuentaBancaria } from "@/lib/sae-cuentas";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import {
  formatPaymentAmount,
  formatPaymentField,
  type CrmPayment,
} from "../../_lib/payments";
import { CrmButton } from "../shared/crm-button";

interface PaymentsSaeConcileDialogProps {
  payment: CrmPayment | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (payment: CrmPayment) => void;
}

export const PaymentsSaeConcileDialog = ({
  payment,
  onOpenChange,
  onUpdated,
}: PaymentsSaeConcileDialogProps) => {
  const open = Boolean(payment);
  const [cuentas, setCuentas] = useState<SaeCuentaBancaria[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payment) return;
    let cancelled = false;
    setSelectedId(payment.sae?.idCuba || "");
    setCuentas([]);
    setError(null);
    setIsLoading(true);

    const loadCuentas = async () => {
      try {
        const response = await fetch("/api/crm/sae/cuentas-bancarias", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          error?: string;
          data?: SaeCuentaBancaria[];
        };
        if (!response.ok) {
          throw new Error(payload.error || "No se pudieron cargar las cuentas");
        }
        if (cancelled) return;
        const next = payload.data || [];
        setCuentas(next);
        setSelectedId((current) => {
          if (current && next.some((cuenta) => cuenta.id_cuba === current)) {
            return current;
          }
          return next.length === 1 ? next[0].id_cuba : "";
        });
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar las cuentas",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadCuentas();
    return () => {
      cancelled = true;
    };
  }, [payment]);

  const handleConcile = async () => {
    if (!payment || !selectedId || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/crm/payments/${payment.id}/sae`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "conciliar", id_cuba: selectedId }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        payment?: CrmPayment;
      };
      if (payload.payment && (!response.ok || !payload.ok)) {
        onUpdated(payload.payment);
      }
      if (!response.ok || !payload.ok || !payload.payment) {
        throw new Error(payload.error || "No se pudo conciliar el pago");
      }
      onUpdated(payload.payment);
      onOpenChange(false);
      toast.success("Pago conciliado");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo conciliar el pago",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conciliar pago</DialogTitle>
          <DialogDescription>
            Elige la cuenta receptora. Si el comprobante aún no fue reportado,
            primero se registra y después se concilia.
          </DialogDescription>
        </DialogHeader>
        {payment ? (
          <div className="space-y-4">
            <div className={`space-y-1 text-sm ${CRM_SURFACES.textSecondary}`}>
              <p>
                Cliente:{" "}
                <span className={CRM_SURFACES.textPrimary}>
                  {formatPaymentField(payment.client_name)}
                </span>
              </p>
              <p>
                Referencia:{" "}
                <span className="font-mono">
                  {formatPaymentField(payment.transaction_code)}
                </span>
              </p>
              <p>
                Monto:{" "}
                <span className={CRM_SURFACES.textPrimary}>
                  {formatPaymentAmount(payment.amount)}
                </span>
              </p>
            </div>
            {payment.sae?.error ? (
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
                {payment.sae.error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="sae-cuenta">Cuenta receptora</Label>
              <Select
                value={selectedId || undefined}
                onValueChange={setSelectedId}
                disabled={isLoading || isSaving || cuentas.length === 0}>
                <SelectTrigger
                  id="sae-cuenta"
                  className="w-full"
                  aria-label="Cuenta receptora">
                  <SelectValue
                    placeholder={
                      isLoading ? "Cargando cuentas…" : "Selecciona una cuenta"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map((cuenta) => (
                    <SelectItem key={cuenta.id_cuba} value={cuenta.id_cuba}>
                      {cuenta.banco || "Cuenta"} ·{" "}
                      {cuenta.numero_cuenta || cuenta.id_cuba}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error ? (
                <p className="text-xs text-red-700 dark:text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
              {!isLoading && !error && cuentas.length === 0 ? (
                <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                  No hay cuentas bancarias para esta empresa.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <CrmButton
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}>
            Cancelar
          </CrmButton>
          <CrmButton
            type="button"
            onClick={() => void handleConcile()}
            disabled={isSaving || isLoading || !selectedId}
            aria-label="Confirmar conciliación">
            {isSaving ? "Conciliando…" : "Conciliar"}
          </CrmButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
