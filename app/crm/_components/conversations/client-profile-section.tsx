"use client";

import type { ReactNode } from "react";
import { CRM_BADGE_TONES, CRM_SURFACES } from "../../_lib/crm-theme";
import {
  formatClientDebt,
  getAccountTextClass,
  parseClientEnvoicing,
  resolveActivePlanLabel,
} from "../../_lib/client-profile-utils";
import type { Client, WisproCustomer } from "../../_lib/types";
import { AvatarInitials } from "../shared/avatar-initials";
import { CrmButton } from "../shared/crm-button";

interface ClientProfileSectionProps {
  client: Client;
  wisproSnapshot?: WisproCustomer | null;
  onOpenWispro?: () => void;
  onUnlinkWispro?: () => void;
  isUnlinkingWispro?: boolean;
  onCreatePaymentPromise?: () => void;
  isCreatingPaymentPromise?: boolean;
}

const fieldClass = "space-y-1";

const ProfileField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className={fieldClass}>
    <p className={`text-[11px] uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
      {label}
    </p>
    {children}
  </div>
);

export const ClientProfileSection = ({
  client,
  wisproSnapshot,
  onOpenWispro,
  onUnlinkWispro,
  isUnlinkingWispro = false,
  onCreatePaymentPromise,
  isCreatingPaymentPromise = false,
  }: ClientProfileSectionProps) => {
  const locationLabel = wisproSnapshot
    ? [wisproSnapshot.city, wisproSnapshot.state].filter(Boolean).join(", ")
    : null;
  const envoicingData = parseClientEnvoicing(client.envoicing);
  const activePlan = resolveActivePlanLabel({
    pppProfile: envoicingData?.pppProfile,
    planName: envoicingData?.planName,
    clientPlan: client.plan,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AvatarInitials
          name={client.name}
          initials={client.initials}
          color={client.color || "#4f8ef7"}
          bg={client.bg || "rgba(79,142,247,.15)"}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
            {client.name}
          </p>
          {client.wispro_id ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CRM_BADGE_TONES.emerald}`}>
                Wispro
              </span>
              {onOpenWispro ? (
                <CrmButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={onOpenWispro}>
                  Cambiar vinculación
                </CrmButton>
              ) : null}
              {onUnlinkWispro ? (
                <CrmButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700 dark:text-rose-300"
                  disabled={isUnlinkingWispro}
                  onClick={onUnlinkWispro}>
                  {isUnlinkingWispro ? "Desvinculando..." : "Desvincular"}
                </CrmButton>
              ) : null}
            </div>
          ) : onOpenWispro ? (
            <CrmButton
              type="button"
              variant="secondary"
              size="sm"
              className="mt-1 h-7 px-2 text-[11px]"
              onClick={onOpenWispro}>
              Vincular Wispro
            </CrmButton>
          ) : null}
        </div>
      </div>

      {wisproSnapshot ? (
        <ProfileField label="Cédula">
          <p className={`font-mono text-sm ${CRM_SURFACES.textSecondary}`}>
            {wisproSnapshot.national_identification_number}
          </p>
        </ProfileField>
      ) : null}

      <ProfileField label="Teléfono">
        <p className={`font-mono text-sm ${CRM_SURFACES.textSecondary}`}>
          {client.phone || client.whatsapp_id || "—"}
        </p>
      </ProfileField>

      {client.whatsapp_id && client.whatsapp_id !== client.phone ? (
        <ProfileField label="WhatsApp ID">
          <p className={`font-mono text-sm ${CRM_SURFACES.textSecondary}`}>
            {client.whatsapp_id}
          </p>
        </ProfileField>
      ) : null}

      {client.wa_name ? (
        <ProfileField label="Nombre en WhatsApp">
          <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
            {client.wa_name}
          </p>
        </ProfileField>
      ) : null}

      {locationLabel ? (
        <ProfileField label="Ubicación">
          <p className={`text-sm ${CRM_SURFACES.textSecondary}`}>{locationLabel}</p>
        </ProfileField>
      ) : null}

      <ProfileField label="Zona">
        <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
          {client.zone || "—"}
        </p>
      </ProfileField>

      <ProfileField label="Estado">
        <p
          className={`text-sm font-medium ${getAccountTextClass(client.account) || CRM_SURFACES.textPrimary}`}>
          {client.account || "—"}
        </p>
      </ProfileField>

      <ProfileField label="Deuda">
        <p
          className={`text-sm font-medium ${
            envoicingData?.hasDebt
              ? "text-red-700 dark:text-red-300"
              : CRM_SURFACES.textPrimary
          }`}>
          {envoicingData?.hasDebt
            ? formatClientDebt(envoicingData.debt)
            : "Sin deuda"}
        </p>
      </ProfileField>

      <ProfileField label="Plan">
        <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
          {activePlan}
        </p>
      </ProfileField>

      {client.wispro_id && onCreatePaymentPromise ? (
        <div className="space-y-1.5 pt-1">
          <CrmButton
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={isCreatingPaymentPromise}
            onClick={onCreatePaymentPromise}
            aria-label="Crear promesa de pago por 48 horas en Wispro">
            {isCreatingPaymentPromise
              ? "Creando promesa..."
              : "Crear promesa 48h"}
          </CrmButton>
          <p className={`text-[11px] leading-snug ${CRM_SURFACES.textMuted}`}>
            Solo si el servicio está suspendido. No se notifica por WhatsApp.
          </p>
        </div>
      ) : null}
    </div>
  );
};
