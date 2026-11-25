"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CRM_KNOWN_PAYMENT_BANKS,
  CRM_PAYMENT_STATUSES,
  CRM_PAYMENT_STATUS_LABELS,
  isExcludedReceptorBank,
  isValidPaymentReference,
  type CrmPayment,
  type CrmPaymentStatus,
} from "../../_lib/payments";

const editorSchema = z.object({
  client_name: z.string().trim().max(160),
  cedula: z.string().trim().max(40),
  amount: z.string().trim(),
  bank: z.string().trim().max(80),
  transaction_code: z
    .string()
    .trim()
    .max(80)
    .refine((value) => !value || isValidPaymentReference(value), {
      message: "La referencia necesita dígitos o al menos 3 caracteres",
    }),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  comment: z.string().trim().max(500),
  status: z.enum(CRM_PAYMENT_STATUSES),
});

export type PaymentEditorValues = z.infer<typeof editorSchema>;

interface PaymentsEditorDialogProps {
  open: boolean;
  mode: "create" | "edit";
  payment?: CrmPayment | null;
  banks: string[];
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PaymentEditorValues) => Promise<void>;
}

const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const emptyValues = (): PaymentEditorValues => ({
  client_name: "",
  cedula: "",
  amount: "",
  bank: CRM_KNOWN_PAYMENT_BANKS[0],
  transaction_code: "",
  payment_date: todayIso(),
  comment: "",
  status: "EN_PROCESO",
});

export const PaymentsEditorDialog = ({
  open,
  mode,
  payment,
  banks,
  submitting = false,
  onOpenChange,
  onSubmit,
}: PaymentsEditorDialogProps) => {
  const form = useForm<PaymentEditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: emptyValues(),
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && payment) {
      form.reset({
        client_name: payment.client_name || "",
        cedula: payment.cedula || "",
        amount: payment.amount == null ? "" : String(payment.amount),
        bank: payment.bank || CRM_KNOWN_PAYMENT_BANKS[0],
        transaction_code: payment.transaction_code || "",
        payment_date: payment.payment_date?.slice(0, 10) || todayIso(),
        comment: payment.comment || "",
        status: payment.status,
      });
      return;
    }
    form.reset(emptyValues());
  }, [form, mode, open, payment]);

  const bankOptions = Array.from(
    new Set([
      ...CRM_KNOWN_PAYMENT_BANKS,
      ...banks,
      payment?.bank || "",
    ]),
  ).filter((item) => item && !isExcludedReceptorBank(item));

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Registrar pago manual" : "Editar pago"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "El comprobante entra a la bandeja aunque todavía falten datos."
              : "Los cambios reemplazan la fila de la bandeja."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="payment-client-name">Cliente</Label>
              <Input id="payment-client-name" {...form.register("client_name")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-cedula">Cédula</Label>
              <Input id="payment-cedula" {...form.register("cedula")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-amount">Monto USD</Label>
              <Input id="payment-amount" inputMode="decimal" {...form.register("amount")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-bank">Banco</Label>
              <Select
                value={form.watch("bank")}
                onValueChange={(value) => form.setValue("bank", value, { shouldValidate: true })}>
                <SelectTrigger id="payment-bank" className="w-full">
                  <SelectValue placeholder="Banco" />
                </SelectTrigger>
                <SelectContent>
                  {bankOptions.map((bank) => (
                    <SelectItem key={bank} value={bank}>
                      {bank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-reference">Referencia</Label>
              <Input id="payment-reference" {...form.register("transaction_code")} />
              {form.formState.errors.transaction_code ? (
                <p className="text-xs text-red-600">
                  {form.formState.errors.transaction_code.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-date">Fecha del comprobante</Label>
              <Input id="payment-date" type="date" {...form.register("payment_date")} />
            </div>
            {mode === "edit" ? (
              <div className="space-y-1">
                <Label htmlFor="payment-status">Estado</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(value) =>
                    form.setValue("status", value as CrmPaymentStatus, { shouldValidate: true })
                  }>
                  <SelectTrigger id="payment-status" className="w-full">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_PAYMENT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {CRM_PAYMENT_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="payment-comment">Comentario</Label>
              <Textarea id="payment-comment" rows={3} {...form.register("comment")} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="cursor-pointer"
              disabled={submitting}
              onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={submitting}>
              {submitting ? "Guardando..." : mode === "create" ? "Registrar" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
