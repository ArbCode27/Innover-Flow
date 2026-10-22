"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CreditCard,
  Save,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { OrganizationRole } from "../../_lib/types";
import {
  buildPaymentInstructionFields,
  type OrganizationPaymentMethod,
  type PaymentAccountType,
  type PaymentCurrency,
  type PaymentMethodKey,
} from "../../_lib/payment-methods";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

const METHOD_LABELS: Record<PaymentMethodKey, string> = {
  pago_movil: "Pago Móvil",
  transferencia: "Transferencia",
  deposito: "Depósito",
  deposito_usd: "Depósito USD",
};

const cloneMethod = (method: OrganizationPaymentMethod): OrganizationPaymentMethod => ({
  ...method,
});

export const PaymentMethodsSettingsSection = ({
  organizationRole,
}: {
  organizationRole: OrganizationRole | null;
}) => {
  const canEdit = organizationRole === "owner" || organizationRole === "admin";
  const [methods, setMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [drafts, setDrafts] = useState<Record<string, OrganizationPaymentMethod>>(
    {},
  );
  const [savingKey, setSavingKey] = useState<PaymentMethodKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMethods = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/crm/payment-methods", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        methods?: OrganizationPaymentMethod[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron cargar los métodos");
      }
      const next = payload.methods || [];
      setMethods(next);
      const nextDrafts: Record<string, OrganizationPaymentMethod> = {};
      for (const method of next) {
        nextDrafts[method.method_key] = cloneMethod(method);
      }
      setDrafts(nextDrafts);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los métodos de pago",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMethods();
  }, [loadMethods]);

  const handleDraftChange = (
    methodKey: PaymentMethodKey,
    patch: Partial<OrganizationPaymentMethod>,
  ) => {
    setDrafts((current) => {
      const base = current[methodKey];
      if (!base) return current;
      return {
        ...current,
        [methodKey]: { ...base, ...patch },
      };
    });
  };

  const isDirty = (methodKey: PaymentMethodKey) => {
    const original = methods.find((item) => item.method_key === methodKey);
    const draft = drafts[methodKey];
    if (!original || !draft) return false;
    return JSON.stringify(original) !== JSON.stringify(draft);
  };

  const persistMethod = async (draft: OrganizationPaymentMethod) => {
    const response = await fetch("/api/crm/payment-methods", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: {
          method_key: draft.method_key,
          title: draft.title,
          description: draft.description,
          is_enabled: draft.is_enabled,
          sort_order: draft.sort_order,
          currency: draft.currency,
          bank_name: draft.bank_name,
          phone: draft.phone,
          document: draft.document,
          account_number: draft.account_number,
          account_type: draft.account_type,
          holder_name: draft.holder_name,
          notes: draft.notes,
        },
      }),
    });
    const payload = (await response.json()) as {
      method?: OrganizationPaymentMethod;
      error?: string;
    };
    if (!response.ok || !payload.method) {
      throw new Error(payload.error || "No se pudo guardar");
    }
    return payload.method;
  };

  const handleMove = async (methodKey: PaymentMethodKey, direction: -1 | 1) => {
    if (!canEdit || savingKey) return;
    const ordered = [...methods].sort(
      (a, b) => a.sort_order - b.sort_order || a.method_key.localeCompare(b.method_key),
    );
    const index = ordered.findIndex((item) => item.method_key === methodKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    const aKey = ordered[index].method_key;
    const bKey = ordered[target].method_key;
    const draftA = drafts[aKey];
    const draftB = drafts[bKey];
    if (!draftA || !draftB) return;

    const orderA = draftA.sort_order;
    const orderB = draftB.sort_order;
    const nextA = { ...draftA, sort_order: orderB };
    const nextB = { ...draftB, sort_order: orderA };

    setDrafts((current) => ({
      ...current,
      [aKey]: nextA,
      [bKey]: nextB,
    }));
    setMethods((current) =>
      current.map((item) => {
        if (item.method_key === aKey) return { ...item, sort_order: orderB };
        if (item.method_key === bKey) return { ...item, sort_order: orderA };
        return item;
      }),
    );

    setSavingKey(methodKey);
    try {
      const [savedA, savedB] = await Promise.all([
        persistMethod(nextA),
        persistMethod(nextB),
      ]);
      setMethods((current) =>
        current.map((item) => {
          if (item.method_key === savedA.method_key) return savedA;
          if (item.method_key === savedB.method_key) return savedB;
          return item;
        }),
      );
      setDrafts((current) => ({
        ...current,
        [savedA.method_key]: cloneMethod(savedA),
        [savedB.method_key]: cloneMethod(savedB),
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo reordenar",
      );
      void loadMethods();
    } finally {
      setSavingKey(null);
    }
  };

  const handleSave = async (methodKey: PaymentMethodKey) => {
    if (!canEdit || savingKey) return;
    const draft = drafts[methodKey];
    if (!draft) return;

    setSavingKey(methodKey);
    try {
      const saved = await persistMethod(draft);
      setMethods((current) =>
        current.map((item) =>
          item.method_key === methodKey ? saved : item,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [methodKey]: cloneMethod(saved),
      }));
      toast.success(`${METHOD_LABELS[methodKey]} guardado`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el método",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const orderedKeys = useMemo(
    () =>
      [...methods]
        .sort(
          (a, b) =>
            a.sort_order - b.sort_order || a.method_key.localeCompare(b.method_key),
        )
        .map((item) => item.method_key),
    [methods],
  );

  return (
    <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4 text-crm-accent" aria-hidden="true" />
          Datos de pago (app)
        </CardTitle>
        <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
          Configura las cuentas y datos de destino que ven los clientes en la
          app al pagar. Solo administradores pueden editar.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isLoading ? (
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>Cargando métodos…</p>
        ) : null}
        {loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-destructive">{loadError}</p>
            <CrmButton
              type="button"
              variant="secondary"
              onClick={() => void loadMethods()}>
              Reintentar
            </CrmButton>
          </div>
        ) : null}

        {!isLoading && !loadError
          ? orderedKeys.map((methodKey, index) => {
              const draft = drafts[methodKey];
              if (!draft) return null;
              const dirty = isDirty(methodKey);
              const previewFields = buildPaymentInstructionFields(draft);
              const isPagoMovil = methodKey === "pago_movil";

              return (
                <section
                  key={methodKey}
                  className={`rounded-2xl border p-4 ${CRM_SURFACES.border} bg-white/30 dark:bg-white/[.03]`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isPagoMovil ? (
                          <Smartphone
                            className="size-4 shrink-0 text-crm-accent"
                            aria-hidden="true"
                          />
                        ) : (
                          <CreditCard
                            className="size-4 shrink-0 text-crm-accent"
                            aria-hidden="true"
                          />
                        )}
                        <h4
                          className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                          {METHOD_LABELS[methodKey]}
                        </h4>
                      </div>
                      <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
                        Clave: {methodKey}
                        {draft.is_enabled
                          ? " · Visible en la app"
                          : " · Oculto en la app"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`enabled-${methodKey}`}
                          className={`text-xs ${CRM_SURFACES.textMuted}`}>
                          Activo
                        </Label>
                        <Switch
                          id={`enabled-${methodKey}`}
                          checked={draft.is_enabled}
                          disabled={!canEdit || savingKey === methodKey}
                          onCheckedChange={(checked) =>
                            handleDraftChange(methodKey, { is_enabled: checked })
                          }
                          aria-label={`Activar ${METHOD_LABELS[methodKey]}`}
                        />
                      </div>
                      <CrmButton
                        type="button"
                        variant="secondary"
                        disabled={!canEdit || index === 0 || Boolean(savingKey)}
                        onClick={() => void handleMove(methodKey, -1)}
                        aria-label="Subir orden">
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      </CrmButton>
                      <CrmButton
                        type="button"
                        variant="secondary"
                        disabled={
                          !canEdit ||
                          index === orderedKeys.length - 1 ||
                          Boolean(savingKey)
                        }
                        onClick={() => void handleMove(methodKey, 1)}
                        aria-label="Bajar orden">
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      </CrmButton>
                      <CrmButton
                        type="button"
                        variant="primary"
                        disabled={!canEdit || !dirty || savingKey === methodKey}
                        onClick={() => void handleSave(methodKey)}>
                        <Save className="size-3.5" aria-hidden="true" />
                        {savingKey === methodKey ? "Guardando…" : "Guardar"}
                      </CrmButton>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`title-${methodKey}`}>Título</Label>
                      <Input
                        id={`title-${methodKey}`}
                        value={draft.title}
                        disabled={!canEdit}
                        onChange={(event) =>
                          handleDraftChange(methodKey, {
                            title: event.target.value,
                          })
                        }
                        className={CRM_SURFACES.input}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`currency-${methodKey}`}>Moneda</Label>
                      <Select
                        value={draft.currency}
                        disabled={!canEdit}
                        onValueChange={(value) =>
                          handleDraftChange(methodKey, {
                            currency: value as PaymentCurrency,
                          })
                        }>
                        <SelectTrigger
                          id={`currency-${methodKey}`}
                          className={`w-full ${CRM_SURFACES.input}`}>
                          <SelectValue placeholder="Moneda" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VES">VES (Bs)</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label htmlFor={`description-${methodKey}`}>
                        Descripción (opcional)
                      </Label>
                      <Input
                        id={`description-${methodKey}`}
                        value={draft.description || ""}
                        disabled={!canEdit}
                        placeholder="Ej. Puede demorar más de 48 hrs"
                        onChange={(event) =>
                          handleDraftChange(methodKey, {
                            description: event.target.value || null,
                          })
                        }
                        className={CRM_SURFACES.input}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`bank-${methodKey}`}>Banco</Label>
                      <Input
                        id={`bank-${methodKey}`}
                        value={draft.bank_name || ""}
                        disabled={!canEdit}
                        placeholder="Ej. Banplus"
                        onChange={(event) =>
                          handleDraftChange(methodKey, {
                            bank_name: event.target.value || null,
                          })
                        }
                        className={CRM_SURFACES.input}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`document-${methodKey}`}>
                        Cédula / RIF
                      </Label>
                      <Input
                        id={`document-${methodKey}`}
                        value={draft.document || ""}
                        disabled={!canEdit}
                        placeholder="Ej. J-12345678-9"
                        onChange={(event) =>
                          handleDraftChange(methodKey, {
                            document: event.target.value || null,
                          })
                        }
                        className={CRM_SURFACES.input}
                      />
                    </div>

                    {isPagoMovil ? (
                      <div className="grid gap-1.5">
                        <Label htmlFor={`phone-${methodKey}`}>Teléfono</Label>
                        <Input
                          id={`phone-${methodKey}`}
                          value={draft.phone || ""}
                          disabled={!canEdit}
                          placeholder="Ej. 0412 0000000"
                          onChange={(event) =>
                            handleDraftChange(methodKey, {
                              phone: event.target.value || null,
                            })
                          }
                          className={CRM_SURFACES.input}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-1.5">
                          <Label htmlFor={`account-${methodKey}`}>
                            Número de cuenta
                          </Label>
                          <Input
                            id={`account-${methodKey}`}
                            value={draft.account_number || ""}
                            disabled={!canEdit}
                            placeholder="0200…"
                            onChange={(event) =>
                              handleDraftChange(methodKey, {
                                account_number: event.target.value || null,
                              })
                            }
                            className={CRM_SURFACES.input}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor={`account-type-${methodKey}`}>
                            Tipo de cuenta
                          </Label>
                          <Select
                            value={draft.account_type || "none"}
                            disabled={!canEdit}
                            onValueChange={(value) =>
                              handleDraftChange(methodKey, {
                                account_type:
                                  value === "none"
                                    ? null
                                    : (value as PaymentAccountType),
                              })
                            }>
                            <SelectTrigger
                              id={`account-type-${methodKey}`}
                              className={`w-full ${CRM_SURFACES.input}`}>
                              <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin especificar</SelectItem>
                              <SelectItem value="corriente">Corriente</SelectItem>
                              <SelectItem value="ahorro">Ahorro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    <div className="grid gap-1.5">
                      <Label htmlFor={`holder-${methodKey}`}>Titular</Label>
                      <Input
                        id={`holder-${methodKey}`}
                        value={draft.holder_name || ""}
                        disabled={!canEdit}
                        placeholder="Nombre del titular"
                        onChange={(event) =>
                          handleDraftChange(methodKey, {
                            holder_name: event.target.value || null,
                          })
                        }
                        className={CRM_SURFACES.input}
                      />
                    </div>
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label htmlFor={`notes-${methodKey}`}>
                        Notas para el cliente
                      </Label>
                      <Textarea
                        id={`notes-${methodKey}`}
                        value={draft.notes || ""}
                        disabled={!canEdit}
                        rows={2}
                        placeholder="Instrucciones adicionales (opcional)"
                        onChange={(event) =>
                          handleDraftChange(methodKey, {
                            notes: event.target.value || null,
                          })
                        }
                        className={CRM_SURFACES.input}
                      />
                    </div>
                  </div>

                  <div
                    className={`mt-4 rounded-xl border p-3 ${CRM_SURFACES.border}`}>
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
                      Vista previa (app)
                    </p>
                    {previewFields.length ? (
                      <ul className="mt-2 space-y-1">
                        {previewFields.map((field) => (
                          <li
                            key={`${methodKey}-${field.label}`}
                            className={`text-sm ${CRM_SURFACES.textSecondary}`}>
                            <span className={CRM_SURFACES.textMuted}>
                              {field.label}:
                            </span>{" "}
                            {field.value}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`mt-2 text-sm ${CRM_SURFACES.textMuted}`}>
                        Completa banco, teléfono o cuenta para que el cliente
                        vea datos reales.
                      </p>
                    )}
                  </div>
                </section>
              );
            })
          : null}

        {!canEdit ? (
          <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
            Solo un administrador puede editar los datos de pago.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
