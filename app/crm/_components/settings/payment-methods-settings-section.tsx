"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrganizationRole } from "../../_lib/types";
import {
  PAYMENT_METHOD_LABELS,
  type OrganizationPaymentMethod,
  type PaymentMethodKey,
} from "../../_lib/payment-methods";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";
import { PaymentMethodsTable } from "./payment-methods-table";
import { PaymentMethodFormDialog } from "./payment-method-form-dialog";

const cloneMethod = (
  method: OrganizationPaymentMethod,
): OrganizationPaymentMethod => ({ ...method });

export const PaymentMethodsSettingsSection = ({
  organizationRole,
}: {
  organizationRole: OrganizationRole | null;
}) => {
  const canEdit = organizationRole === "owner" || organizationRole === "admin";
  const [methods, setMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [busyKey, setBusyKey] = useState<PaymentMethodKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingKey, setEditingKey] = useState<PaymentMethodKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      setOrganizationId(next[0]?.organization_id || "");
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

  const editingMethod = useMemo(() => {
    if (!editingKey) return null;
    return methods.find((item) => item.method_key === editingKey) || null;
  }, [editingKey, methods]);

  type PersistDraft = {
    method_key: PaymentMethodKey;
    title: string;
    description: string | null;
    is_enabled: boolean;
    sort_order: number;
    currency: OrganizationPaymentMethod["currency"];
    bank_name: string | null;
    phone: string | null;
    document: string | null;
    account_number: string | null;
    account_type: OrganizationPaymentMethod["account_type"];
    holder_name: string | null;
    email: string | null;
    link_url: string | null;
    binance_pay_id: string | null;
    binance_uid: string | null;
    wallet_address: string | null;
    crypto_network: string | null;
    notes: string | null;
  };

  const toPersistDraft = (
    method: OrganizationPaymentMethod,
  ): PersistDraft => ({
    method_key: method.method_key,
    title: method.title,
    description: method.description,
    is_enabled: method.is_enabled,
    sort_order: method.sort_order,
    currency: method.currency,
    bank_name: method.bank_name,
    phone: method.phone,
    document: method.document,
    account_number: method.account_number,
    account_type: method.account_type,
    holder_name: method.holder_name,
    email: method.email,
    link_url: method.link_url,
    binance_pay_id: method.binance_pay_id,
    binance_uid: method.binance_uid,
    wallet_address: method.wallet_address,
    crypto_network: method.crypto_network,
    notes: method.notes,
  });

  const persistMethod = async (draft: PersistDraft) => {
    const response = await fetch("/api/crm/payment-methods", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: draft }),
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
    if (!canEdit || busyKey) return;
    const ordered = [...methods].sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.method_key.localeCompare(b.method_key),
    );
    const index = ordered.findIndex((item) => item.method_key === methodKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    const a = ordered[index];
    const b = ordered[target];
    const nextA = { ...a, sort_order: b.sort_order };
    const nextB = { ...b, sort_order: a.sort_order };

    setMethods((current) =>
      current.map((item) => {
        if (item.method_key === a.method_key) return nextA;
        if (item.method_key === b.method_key) return nextB;
        return item;
      }),
    );

    setBusyKey(methodKey);
    try {
      const [savedA, savedB] = await Promise.all([
        persistMethod(toPersistDraft(nextA)),
        persistMethod(toPersistDraft(nextB)),
      ]);
      setMethods((current) =>
        current.map((item) => {
          if (item.method_key === savedA.method_key) return cloneMethod(savedA);
          if (item.method_key === savedB.method_key) return cloneMethod(savedB);
          return item;
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo reordenar",
      );
      void loadMethods();
    } finally {
      setBusyKey(null);
    }
  };

  const handleOpenCreate = () => {
    if (!canEdit) return;
    setDialogMode("create");
    setEditingKey(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (methodKey: PaymentMethodKey) => {
    if (!canEdit) return;
    setDialogMode("edit");
    setEditingKey(methodKey);
    setDialogOpen(true);
  };

  const handleDialogSubmit = async (payload: PersistDraft) => {
    setIsSaving(true);
    try {
      const saved = await persistMethod(payload);
      setMethods((current) => {
        const exists = current.some(
          (item) => item.method_key === saved.method_key,
        );
        if (!exists) return [...current, cloneMethod(saved)];
        return current.map((item) =>
          item.method_key === saved.method_key ? cloneMethod(saved) : item,
        );
      });
      if (!organizationId && saved.organization_id) {
        setOrganizationId(saved.organization_id);
      }
      toast.success(
        `${PAYMENT_METHOD_LABELS[saved.method_key]} guardado`,
      );
      setDialogOpen(false);
      setEditingKey(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el método",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4 text-crm-accent" aria-hidden="true" />
            Datos de pago (app)
          </CardTitle>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            Configura las cuentas y datos de destino que ven los clientes en la
            app al pagar. Solo administradores pueden editar.
          </p>
        </div>
        {canEdit ? (
          <CrmButton
            type="button"
            variant="primary"
            disabled={isLoading || Boolean(busyKey)}
            onClick={handleOpenCreate}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Configurar método
          </CrmButton>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {isLoading ? (
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
            Cargando métodos…
          </p>
        ) : null}
        {loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-destructive">{loadError}</p>
            <CrmButton
              type="button"
              variant="secondary"
              onClick={() => void loadMethods()}
            >
              Reintentar
            </CrmButton>
          </div>
        ) : null}

        {!isLoading && !loadError ? (
          <PaymentMethodsTable
            methods={methods}
            canEdit={canEdit}
            busyKey={busyKey}
            onEdit={handleOpenEdit}
            onMove={(methodKey, direction) =>
              void handleMove(methodKey, direction)
            }
          />
        ) : null}

        {!canEdit ? (
          <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
            Solo un administrador puede editar los datos de pago.
          </p>
        ) : null}
      </CardContent>

      <PaymentMethodFormDialog
        open={dialogOpen}
        mode={dialogMode}
        organizationId={organizationId || methods[0]?.organization_id || ""}
        method={dialogMode === "edit" ? editingMethod : null}
        catalog={methods}
        canEdit={canEdit}
        isSaving={isSaving}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingKey(null);
        }}
        onSubmit={handleDialogSubmit}
      />
    </Card>
  );
};
