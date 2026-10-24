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
  methodHasDestinationData,
  methodUsesBankAccount,
  methodUsesBinanceIds,
  methodUsesCryptoWallet,
  methodUsesEmail,
  methodUsesHolderName,
  methodUsesPaypalLink,
  methodUsesPhone,
  methodUsesVeDocument,
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
    description: z.string().max(280).optional(),
    is_enabled: z.boolean(),
    currency: z.enum(["VES", "USD"]),
    bank_name: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
    document: z.string().max(40).optional(),
    account_number: z.string().max(40).optional(),
    account_type: z.enum(["none", "corriente", "ahorro"]),
    holder_name: z.string().max(120).optional(),
    email: z.string().max(160).optional(),
    link_url: z.string().max(200).optional(),
    binance_pay_id: z.string().max(80).optional(),
    binance_uid: z.string().max(80).optional(),
    wallet_address: z.string().max(200).optional(),
    crypto_network: z.string().max(40).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.is_enabled) return;
    const draft = {
      method_key: values.method_key,
      bank_name: values.bank_name || null,
      phone: values.phone || null,
      document: values.document || null,
      account_number: values.account_number || null,
      holder_name: values.holder_name || null,
      email: values.email || null,
      link_url: values.link_url || null,
      binance_pay_id: values.binance_pay_id || null,
      binance_uid: values.binance_uid || null,
      wallet_address: values.wallet_address || null,
    };
    if (!methodHasDestinationData(draft)) {
      ctx.addIssue({
        code: "custom",
        path: ["is_enabled"],
        message:
          "Completa al menos un dato de destino de este método o desactívalo",
      });
    }
    if (
      values.method_key === "binance" &&
      String(values.wallet_address || "").trim() &&
      !String(values.crypto_network || "").trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["crypto_network"],
        message: "Si indicas wallet, debes indicar la red (TRC20, BEP20, etc.)",
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
  email: method.email || "",
  link_url: method.link_url || "",
  binance_pay_id: method.binance_pay_id || "",
  binance_uid: method.binance_uid || "",
  wallet_address: method.wallet_address || "",
  crypto_network: method.crypto_network || "",
  notes: method.notes || "",
});

const toUpsertPayload = (values: FormValues, sortOrder: number) => {
  const key = values.method_key;
  return {
    method_key: key,
    title: values.title.trim(),
    description: values.description?.trim() || null,
    is_enabled: values.is_enabled,
    sort_order: sortOrder,
    currency: values.currency as PaymentCurrency,
    bank_name:
      key === "pago_movil" || key === "transferencia"
        ? values.bank_name?.trim() || null
        : null,
    phone: methodUsesPhone(key) ? values.phone?.trim() || null : null,
    document: methodUsesVeDocument(key)
      ? values.document?.trim() || null
      : null,
    account_number: methodUsesBankAccount(key)
      ? values.account_number?.trim() || null
      : null,
    account_type:
      methodUsesBankAccount(key) && values.account_type !== "none"
        ? (values.account_type as PaymentAccountType)
        : null,
    holder_name: methodUsesHolderName(key)
      ? values.holder_name?.trim() || null
      : null,
    email: methodUsesEmail(key) ? values.email?.trim() || null : null,
    link_url: methodUsesPaypalLink(key)
      ? values.link_url?.trim() || null
      : null,
    binance_pay_id: methodUsesBinanceIds(key)
      ? values.binance_pay_id?.trim() || null
      : null,
    binance_uid: methodUsesBinanceIds(key)
      ? values.binance_uid?.trim() || null
      : null,
    wallet_address: methodUsesCryptoWallet(key)
      ? values.wallet_address?.trim() || null
      : null,
    crypto_network: methodUsesCryptoWallet(key)
      ? values.crypto_network?.trim() || null
      : null,
    notes: values.notes?.trim() || null,
  };
};

interface PaymentMethodFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  organizationId: string;
  method: OrganizationPaymentMethod | null;
  catalog: OrganizationPaymentMethod[];
  canEdit: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    payload: ReturnType<typeof toUpsertPayload>,
  ) => Promise<void>;
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
    email: watched.email || null,
    link_url: watched.link_url || null,
    binance_pay_id: watched.binance_pay_id || null,
    binance_uid: watched.binance_uid || null,
    wallet_address: watched.wallet_address || null,
    crypto_network: watched.crypto_network || null,
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

        <form
          className="grid gap-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
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
                Este método ya tiene datos guardados; al guardar se
                actualizarán.
              </p>
            ) : null}
            {PAYMENT_METHOD_DEFAULTS[methodKey].description ? (
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                {PAYMENT_METHOD_DEFAULTS[methodKey].description}
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
              className={CRM_SURFACES.input}
              {...form.register("description")}
            />
          </div>

          {(methodKey === "pago_movil" || methodKey === "transferencia") && (
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
              {methodUsesVeDocument(methodKey) ? (
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
              ) : null}
              {methodKey === "pago_movil" ? (
                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor="payment-phone">Teléfono</Label>
                  <Input
                    id="payment-phone"
                    disabled={!canEdit || isSaving}
                    placeholder="Ej. 0412 0000000"
                    className={CRM_SURFACES.input}
                    {...form.register("phone")}
                  />
                </div>
              ) : null}
              {methodUsesBankAccount(methodKey) ? (
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
              {methodUsesHolderName(methodKey) ? (
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
              ) : null}
            </div>
          )}

          {methodKey === "zelle" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="payment-zelle-phone">
                  Teléfono registrado en Zelle
                </Label>
                <Input
                  id="payment-zelle-phone"
                  disabled={!canEdit || isSaving}
                  placeholder="+1 …"
                  className={CRM_SURFACES.input}
                  {...form.register("phone")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="payment-zelle-email">
                  Correo registrado en Zelle
                </Label>
                <Input
                  id="payment-zelle-email"
                  type="email"
                  disabled={!canEdit || isSaving}
                  placeholder="correo@ejemplo.com"
                  className={CRM_SURFACES.input}
                  {...form.register("email")}
                />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="payment-zelle-name">
                  Nombre completo (como en el banco)
                </Label>
                <Input
                  id="payment-zelle-name"
                  disabled={!canEdit || isSaving}
                  className={CRM_SURFACES.input}
                  {...form.register("holder_name")}
                />
              </div>
              <p className={`md:col-span-2 text-xs ${CRM_SURFACES.textMuted}`}>
                Indica teléfono o correo (el vinculado a Zelle). El nombre ayuda
                a que el pagador confirme el destinatario.
              </p>
            </div>
          ) : null}

          {methodKey === "binance" ? (
            <div className="grid gap-3">
              <p className={`text-xs font-medium ${CRM_SURFACES.textSecondary}`}>
                Opción A — Binance Pay / P2P
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-binance-pay">Pay ID</Label>
                  <Input
                    id="payment-binance-pay"
                    disabled={!canEdit || isSaving}
                    className={CRM_SURFACES.input}
                    {...form.register("binance_pay_id")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-binance-uid">User ID (UID)</Label>
                  <Input
                    id="payment-binance-uid"
                    disabled={!canEdit || isSaving}
                    className={CRM_SURFACES.input}
                    {...form.register("binance_uid")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-binance-email">Correo Binance</Label>
                  <Input
                    id="payment-binance-email"
                    type="email"
                    disabled={!canEdit || isSaving}
                    className={CRM_SURFACES.input}
                    {...form.register("email")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-binance-phone">Teléfono Binance</Label>
                  <Input
                    id="payment-binance-phone"
                    disabled={!canEdit || isSaving}
                    className={CRM_SURFACES.input}
                    {...form.register("phone")}
                  />
                </div>
              </div>
              <p className={`text-xs font-medium ${CRM_SURFACES.textSecondary}`}>
                Opción B — Wallet externa (misma red obligatoria)
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor="payment-wallet">Wallet address</Label>
                  <Input
                    id="payment-wallet"
                    disabled={!canEdit || isSaving}
                    placeholder="Dirección USDT / BTC…"
                    className={CRM_SURFACES.input}
                    {...form.register("wallet_address")}
                  />
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor="payment-network">Red (Network)</Label>
                  <Input
                    id="payment-network"
                    disabled={!canEdit || isSaving}
                    placeholder="TRC20, BEP20, Polygon…"
                    className={CRM_SURFACES.input}
                    {...form.register("crypto_network")}
                  />
                  {form.formState.errors.crypto_network ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.crypto_network.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {methodKey === "paypal" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="payment-paypal-email">Correo PayPal</Label>
                <Input
                  id="payment-paypal-email"
                  type="email"
                  disabled={!canEdit || isSaving}
                  placeholder="correo@ejemplo.com"
                  className={CRM_SURFACES.input}
                  {...form.register("email")}
                />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="payment-paypal-me">Enlace PayPal.Me</Label>
                <Input
                  id="payment-paypal-me"
                  disabled={!canEdit || isSaving}
                  placeholder="https://paypal.me/tuusuario"
                  className={CRM_SURFACES.input}
                  {...form.register("link_url")}
                />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="payment-paypal-name">
                  Nombre completo en PayPal
                </Label>
                <Input
                  id="payment-paypal-name"
                  disabled={!canEdit || isSaving}
                  className={CRM_SURFACES.input}
                  {...form.register("holder_name")}
                />
              </div>
            </div>
          ) : null}

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

          <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
            Consejo de seguridad: nunca pidas ni compartas contraseñas, códigos
            OTP ni claves privadas. Ninguna plataforma las necesita para
            recibir un pago.
          </p>

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
              {form.formState.errors.is_enabled ? (
                <p className="mt-1 text-xs text-destructive">
                  {form.formState.errors.is_enabled.message}
                </p>
              ) : null}
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
                Completa los datos del método para que el cliente vea
                instrucciones reales.
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
