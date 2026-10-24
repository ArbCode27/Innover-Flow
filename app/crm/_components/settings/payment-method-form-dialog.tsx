"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildPaymentInstructionFields,
  emptyPaymentMethodDraft,
  methodUsesAccount,
  methodUsesPhone,
  PAYMENT_METHOD_DEFAULTS,
  PAYMENT_METHOD_KEYS,
  PAYMENT_METHOD_LABELS,
  type OrganizationPaymentMethod,
  type PaymentAccountType,
  type PaymentCurrency,
  type PaymentMethodKey,
} from "../../_lib/payment-methods";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

const formSchema = z
  .object({
    method_key: z.enum(PAYMENT_METHOD_KEYS),
    title: z
      .string()
      .trim()
      .min(2, "El título es demasiado corto")
      .max(80, "El título es demasiado largo"),
    description: z.string().max(200).optional(),
    is_enabled: z.boolean(),
    currency: z.enum(["VES", "USD"]),
    bank_name: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
    document: z.string().max(40).optional(),
    account_number: z.string().max(40).optional(),
    account_type: z.enum(["none", "corriente", "ahorro"]),
    holder_name: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (methodUsesPhone(values.method_key)) {
      if (!String(values.phone || "").trim() && values.is_enabled) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: "Indica el teléfono del pago móvil o desactiva el método",
        });
      }
      return;
    }
    if (!String(values.account_number || "").trim() && values.is_enabled) {
      ctx.addIssue({
        code: "custom",
        path: ["account_number"],
        message: "Indica el número de cuenta o desactiva el método",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const toFormValues = (method: OrganizationPaymentMethod): FormValues => ({
  method_key: method.method_key,
  title: method.title,
  description: method.description || "",
  is_enabled: method.is_enabled,
  currency: method.currency,
  bank_name: method.bank_name || "",
  phone: method.phone || "",
  document: method.document || "",
  account_number: method.account_number || "",
  account_type: method.account_type || "none",
  holder_name: method.holder_name || "",
  notes: method.notes || "",
});

const toUpsertPayload = (
  values: FormValues,
  sortOrder: number,
): Omit<OrganizationPaymentMethod, "id" | "organization_id" | "updated_by" | "created_at" | "updated_at"> & {
  method_key: PaymentMethodKey;
  sort_order: number;
} => ({
  method_key: values.method_key,
  title: values.title.trim(),
  description: values.description?.trim() || null,
  is_enabled: values.is_enabled,
  sort_order: sortOrder,
  currency: values.currency as PaymentCurrency,
  bank_name: values.bank_name?.trim() || null,
  phone: methodUsesPhone(values.method_key)
    ? values.phone?.trim() || null
    : null,
  document: values.document?.trim() || null,
  account_number: methodUsesAccount(values.method_key)
    ? values.account_number?.trim() || null
    : null,
  account_type:
    methodUsesAccount(values.method_key) && values.account_type !== "none"
      ? (values.account_type as PaymentAccountType)
      : null,
  holder_name: values.holder_name?.trim() || null,
  notes: values.notes?.trim() || null,
});

interface PaymentMethodFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  organizationId: string;
  method: OrganizationPaymentMethod | null;
  /** Full catalog so changing type in create mode can load existing rows. */
  catalog: OrganizationPaymentMethod[];
  canEdit: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    method_key: PaymentMethodKey;
    title: string;
    description: string | null;
    is_enabled: boolean;
    sort_order: number;
    currency: PaymentCurrency;
    bank_name: string | null;
    phone: string | null;
    document: string | null;
    account_number: string | null;
    account_type: PaymentAccountType | null;
    holder_name: string | null;
    notes: string | null;
  }) => Promise<void>;
}

export const PaymentMethodFormDialog = ({
  open,
  mode,
  organizationId,
  method,
  catalog,
  canEdit,
  isSaving,
  onOpenChange,
  onSubmit,
}: PaymentMethodFormDialogProps) => {
  const defaultMethod = useMemo(
    () => method || emptyPaymentMethodDraft(organizationId, "pago_movil"),
    [method, organizationId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(defaultMethod),
  });

  const watched = form.watch();
  const methodKey = watched.method_key;
  const usesPhone = methodUsesPhone(methodKey);
  const usesAccount = methodUsesAccount(methodKey);
  const lockMethodKey = mode === "edit";

  useEffect(() => {
    if (!open) return;
    form.reset(toFormValues(defaultMethod));
  }, [open, defaultMethod, form]);

  const handleMethodKeyChange = (nextKey: PaymentMethodKey) => {
    if (lockMethodKey) return;
    const existing = catalog.find((item) => item.method_key === nextKey);
    form.reset(
      toFormValues(
        existing || emptyPaymentMethodDraft(organizationId, nextKey),
      ),
    );
  };

  const previewFields = buildPaymentInstructionFields({
    method_key: methodKey,
    currency: watched.currency,
    bank_name: watched.bank_name || null,
    phone: watched.phone || null,
    document: watched.document || null,
    account_number: watched.account_number || null,
    account_type:
      watched.account_type === "none"
        ? null
        : (watched.account_type as PaymentAccountType),
    holder_name: watched.holder_name || null,
    notes: watched.notes || null,
  });
  const willOverwrite =
    mode === "create" &&
    Boolean(catalog.find((item) => item.method_key === methodKey)?.id);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!canEdit) return;
    const existing = catalog.find(
      (item) => item.method_key === values.method_key,
    );
    const sortOrder =
      existing?.sort_order ??
      PAYMENT_METHOD_DEFAULTS[values.method_key].sort_order;
    await onSubmit(toUpsertPayload(values, sortOrder));
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${CRM_DIALOG} max-h-[90vh] overflow-y-auto sm:max-w-xl`}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? "Configurar método de pago"
              : `Editar ${PAYMENT_METHOD_LABELS[defaultMethod.method_key]}`}
          </DialogTitle>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-method-key">Tipo de método</Label>
            <Select
              value={methodKey}
              disabled={!canEdit || lockMethodKey || isSaving}
              onValueChange={(value) =>
                handleMethodKeyChange(value as PaymentMethodKey)
              }
            >
              <SelectTrigger
                id="payment-method-key"
                className={`w-full ${CRM_SURFACES.input}`}
              >
                <SelectValue placeholder="Selecciona un método" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {PAYMENT_METHOD_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {willOverwrite ? (
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Este método ya tiene datos guardados; al guardar se actualizarán.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="payment-title">Título</Label>
              <Input
                id="payment-title"
                disabled={!canEdit || isSaving}
                className={CRM_SURFACES.input}
                {...form.register("title")}
              />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.title.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="payment-currency">Moneda</Label>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    disabled={!canEdit || isSaving}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="payment-currency"
                      className={`w-full ${CRM_SURFACES.input}`}
                    >
                      <SelectValue placeholder="Moneda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VES">VES (Bs)</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-description">Descripción (opcional)</Label>
            <Input
              id="payment-description"
              disabled={!canEdit || isSaving}
              placeholder="Ej. Puede demorar más de 48 hrs"
              className={CRM_SURFACES.input}
              {...form.register("description")}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="payment-bank">Banco</Label>
              <Input
                id="payment-bank"
                disabled={!canEdit || isSaving}
                placeholder="Ej. Banplus"
                className={CRM_SURFACES.input}
                {...form.register("bank_name")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="payment-document">Cédula / RIF</Label>
              <Input
                id="payment-document"
                disabled={!canEdit || isSaving}
                placeholder="Ej. J-12345678-9"
                className={CRM_SURFACES.input}
                {...form.register("document")}
              />
            </div>

            {usesPhone ? (
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="payment-phone">Teléfono</Label>
                <Input
                  id="payment-phone"
                  disabled={!canEdit || isSaving}
                  placeholder="Ej. 0412 0000000"
                  className={CRM_SURFACES.input}
                  {...form.register("phone")}
                />
                {form.formState.errors.phone ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.phone.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            {usesAccount ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-account">Número de cuenta</Label>
                  <Input
                    id="payment-account"
                    disabled={!canEdit || isSaving}
                    placeholder="0200…"
                    className={CRM_SURFACES.input}
                    {...form.register("account_number")}
                  />
                  {form.formState.errors.account_number ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.account_number.message}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-account-type">Tipo de cuenta</Label>
                  <Controller
                    control={form.control}
                    name="account_type"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        disabled={!canEdit || isSaving}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="payment-account-type"
                          className={`w-full ${CRM_SURFACES.input}`}
                        >
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin especificar</SelectItem>
                          <SelectItem value="corriente">Corriente</SelectItem>
                          <SelectItem value="ahorro">Ahorro</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </>
            ) : null}

            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="payment-holder">Titular</Label>
              <Input
                id="payment-holder"
                disabled={!canEdit || isSaving}
                placeholder="Nombre del titular"
                className={CRM_SURFACES.input}
                {...form.register("holder_name")}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-notes">Notas para el cliente</Label>
            <Textarea
              id="payment-notes"
              disabled={!canEdit || isSaving}
              rows={2}
              placeholder="Instrucciones adicionales (opcional)"
              className={CRM_SURFACES.input}
              {...form.register("notes")}
            />
          </div>

          <div
            className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${CRM_SURFACES.border}`}
          >
            <div>
              <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                Visible en la app
              </p>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Si está activo, el cliente verá estos datos al pagar.
              </p>
            </div>
            <Controller
              control={form.control}
              name="is_enabled"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  disabled={!canEdit || isSaving}
                  onCheckedChange={field.onChange}
                  aria-label="Activar método en la app"
                />
              )}
            />
          </div>

          <div className={`rounded-xl border p-3 ${CRM_SURFACES.border}`}>
            <p
              className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}
            >
              Vista previa (app)
            </p>
            {previewFields.length ? (
              <ul className="mt-2 space-y-1">
                {previewFields.map((field) => (
                  <li
                    key={`preview-${field.label}`}
                    className={`text-sm ${CRM_SURFACES.textSecondary}`}
                  >
                    <span className={CRM_SURFACES.textMuted}>{field.label}:</span>{" "}
                    {field.value}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-2 text-sm ${CRM_SURFACES.textMuted}`}>
                Completa banco, teléfono o cuenta para que el cliente vea datos
                reales.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <CrmButton
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </CrmButton>
            <CrmButton
              type="submit"
              variant="primary"
              disabled={!canEdit || isSaving}
            >
              {isSaving ? "Guardando…" : "Guardar"}
            </CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
