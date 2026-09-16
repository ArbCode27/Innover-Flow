"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_SYSTEM_PROMPT_MAX_LENGTH,
  DEFAULT_AI_SYSTEM_PROMPT,
  promptLooksCompatibleWithAiParser,
} from "../../_lib/ai-default-prompt";
import {
  buildPaymentSuccessMessage,
  DEFAULT_PAYMENT_SUCCESS_MESSAGE,
  PAYMENT_SUCCESS_MESSAGE_MAX_LENGTH,
} from "../../_lib/payment-success-message";
import type {
  Agent,
  CrmSettings,
  Organization,
  OrganizationRole,
} from "../../_lib/types";
import { DEFAULT_AI_MODEL } from "../../_lib/ai-models";
import type {
  AfterHoursPaymentsConfig,
  OfficeHoursConfig,
} from "../../_lib/office-hours";
import { isAdminRole } from "../../_lib/agent-role-utils";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";
import { OfficeHoursSettingsSection } from "./office-hours-settings-section";
import { AiRecoverySettingsSection } from "./ai-recovery-settings-section";
import { AppearanceSettingsSection } from "./appearance-settings-section";
import { useCrmAppearance } from "../shell/crm-appearance-provider";
import type { AiRecoveryMessages } from "../../_lib/ai-recovery-messages";
import type { CrmAccentId, CrmColorMode } from "../../_lib/crm-accents";
import { OrganizationSettingsSection } from "./organization-settings-section";
import { IntegrationsSettingsSection } from "./integrations-settings-section";

interface SettingsViewProps {
  currentAgent: Agent;
  organization: Organization;
  organizationRole: OrganizationRole | null;
  settings: CrmSettings;
  onOrganizationUpdated: (organization: Organization) => void;
  onUpdateAiSystemPrompt: (prompt: string | null) => Promise<void>;
  onUpdatePaymentSuccessMessage: (message: string | null) => Promise<void>;
  onUpdateAiRecoveryMessages: (messages: AiRecoveryMessages) => Promise<void>;
  onUpdateOfficeHours: (input: {
    office_hours: OfficeHoursConfig;
    after_hours_payments: AfterHoursPaymentsConfig;
  }) => Promise<void>;
  onUpdateAppearance: (input: {
    ui_accent?: CrmAccentId;
    ui_mode?: CrmColorMode;
    office_ui_accent?: CrmAccentId;
  }) => Promise<{
    ui_accent?: CrmAccentId;
    ui_mode?: CrmColorMode | null;
    office_ui_accent: CrmAccentId;
  } | null>;
}

export const SettingsView = ({
  currentAgent,
  organization,
  organizationRole,
  settings,
  onOrganizationUpdated,
  onUpdateAiSystemPrompt,
  onUpdatePaymentSuccessMessage,
  onUpdateAiRecoveryMessages,
  onUpdateOfficeHours,
  onUpdateAppearance,
}: SettingsViewProps) => {
  const isAdmin = isAdminRole(currentAgent.role);
  const { accent, colorMode, officeAccent, applyAccent, applyColorMode } =
    useCrmAppearance();
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const savedPrompt = settings.ai_system_prompt?.trim() || "";
  const savedPaymentMessage = settings.payment_success_message?.trim() || "";
  const [draftPrompt, setDraftPrompt] = useState(
    savedPrompt || DEFAULT_AI_SYSTEM_PROMPT,
  );
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [draftPaymentMessage, setDraftPaymentMessage] = useState(
    savedPaymentMessage || DEFAULT_PAYMENT_SUCCESS_MESSAGE,
  );
  const [isSavingPaymentMessage, setIsSavingPaymentMessage] = useState(false);

  useEffect(() => {
    setDraftPrompt(savedPrompt || DEFAULT_AI_SYSTEM_PROMPT);
  }, [savedPrompt]);

  useEffect(() => {
    setDraftPaymentMessage(savedPaymentMessage || DEFAULT_PAYMENT_SUCCESS_MESSAGE);
  }, [savedPaymentMessage]);

  const isUsingDefault = !savedPrompt;
  const isDirty = useMemo(() => {
    const normalizedDraft = draftPrompt.trim();
    if (isUsingDefault) {
      return normalizedDraft !== DEFAULT_AI_SYSTEM_PROMPT.trim();
    }
    return normalizedDraft !== savedPrompt;
  }, [draftPrompt, isUsingDefault, savedPrompt]);

  const characterCount = draftPrompt.length;
  const isOverLimit = characterCount > AI_SYSTEM_PROMPT_MAX_LENGTH;
  const paymentCharacterCount = draftPaymentMessage.length;
  const isPaymentOverLimit =
    paymentCharacterCount > PAYMENT_SUCCESS_MESSAGE_MAX_LENGTH;
  const showParserWarning =
    draftPrompt.trim().length > 0 &&
    !promptLooksCompatibleWithAiParser(draftPrompt);
  const isUsingDefaultPaymentMessage = !savedPaymentMessage;
  const isPaymentMessageDirty = useMemo(() => {
    const normalizedDraft = draftPaymentMessage.trim();
    if (isUsingDefaultPaymentMessage) {
      return normalizedDraft !== DEFAULT_PAYMENT_SUCCESS_MESSAGE.trim();
    }
    return normalizedDraft !== savedPaymentMessage;
  }, [draftPaymentMessage, isUsingDefaultPaymentMessage, savedPaymentMessage]);

  const handleSavePrompt = async () => {
    if (!isAdmin || !isDirty || isOverLimit || isSavingPrompt) return;

    setIsSavingPrompt(true);
    try {
      const trimmed = draftPrompt.trim();
      const nextValue =
        !trimmed || trimmed === DEFAULT_AI_SYSTEM_PROMPT.trim()
          ? null
          : trimmed;
      await onUpdateAiSystemPrompt(nextValue);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleRestoreDefault = async () => {
    if (!isAdmin || isSavingPrompt) return;

    setDraftPrompt(DEFAULT_AI_SYSTEM_PROMPT);
    if (isUsingDefault) return;

    setIsSavingPrompt(true);
    try {
      await onUpdateAiSystemPrompt(null);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleSavePaymentMessage = async () => {
    if (
      !isAdmin ||
      !isPaymentMessageDirty ||
      isPaymentOverLimit ||
      isSavingPaymentMessage
    ) {
      return;
    }

    setIsSavingPaymentMessage(true);
    try {
      const trimmed = draftPaymentMessage.trim();
      const nextValue =
        !trimmed || trimmed === DEFAULT_PAYMENT_SUCCESS_MESSAGE.trim()
          ? null
          : trimmed;
      await onUpdatePaymentSuccessMessage(nextValue);
    } finally {
      setIsSavingPaymentMessage(false);
    }
  };

  const handleRestoreDefaultPaymentMessage = async () => {
    if (!isAdmin || isSavingPaymentMessage) return;

    setDraftPaymentMessage(DEFAULT_PAYMENT_SUCCESS_MESSAGE);
    if (isUsingDefaultPaymentMessage) return;

    setIsSavingPaymentMessage(true);
    try {
      await onUpdatePaymentSuccessMessage(null);
    } finally {
      setIsSavingPaymentMessage(false);
    }
  };

  const handleAccentChange = async (nextAccent: CrmAccentId) => {
    if (isSavingAppearance) return;
    const previous = accent;
    applyAccent(nextAccent);
    setIsSavingAppearance(true);
    try {
      await onUpdateAppearance({ ui_accent: nextAccent });
    } catch {
      applyAccent(previous);
    } finally {
      setIsSavingAppearance(false);
    }
  };

  const handleColorModeChange = async (nextMode: CrmColorMode) => {
    if (isSavingAppearance) return;
    const previous = colorMode;
    applyColorMode(nextMode);
    setIsSavingAppearance(true);
    try {
      await onUpdateAppearance({ ui_mode: nextMode });
    } catch {
      applyColorMode(previous);
    } finally {
      setIsSavingAppearance(false);
    }
  };

  const handleOfficeAccentChange = async (nextAccent: CrmAccentId) => {
    if (!isAdmin || isSavingAppearance) return;
    setIsSavingAppearance(true);
    try {
      await onUpdateAppearance({ office_ui_accent: nextAccent });
    } finally {
      setIsSavingAppearance(false);
    }
  };

  return (
    <div
      className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className={`flex items-center gap-2 text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
            <Settings2 className="size-5" aria-hidden="true" />
            Ajustes del CRM
          </h2>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            IA, apariencia, horarios de oficina y pagos fuera de jornada
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-4">
        <OrganizationSettingsSection
          organization={organization}
          organizationRole={organizationRole}
          onUpdated={onOrganizationUpdated}
        />

        <IntegrationsSettingsSection organizationRole={organizationRole} />

        <AppearanceSettingsSection
          isAdmin={isAdmin}
          accent={accent}
          colorMode={colorMode}
          officeAccent={officeAccent}
          isSaving={isSavingAppearance}
          onAccentChange={(nextAccent) => void handleAccentChange(nextAccent)}
          onColorModeChange={(nextMode) => void handleColorModeChange(nextMode)}
          onOfficeAccentChange={(nextAccent) =>
            void handleOfficeAccentChange(nextAccent)
          }
        />

        <div className="grid gap-4 lg:grid-cols-12">
          <section
            className={`rounded-2xl p-4 md:p-5 lg:col-span-4 ${CRM_SURFACES.elevated}`}>
            <h3
              className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
              Motor del bot
            </h3>
            <div className="mt-3 flex items-start gap-3">
              <Sparkles
                className="mt-0.5 size-4 shrink-0 text-crm-accent"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                  Groq
                </p>
                <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
                  Motor único del CRM. Responde desde este servidor con la API
                  configurada (`GROQ_API_KEY`).
                </p>
                <p className={`mt-3 text-xs ${CRM_SURFACES.textMuted}`}>
                  Modelo:{" "}
                  <span className={CRM_SURFACES.textSecondary}>
                    {settings.ai_model || DEFAULT_AI_MODEL}
                  </span>
                </p>
                <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
                  Requiere `GROQ_API_KEY` en el servidor.
                </p>
              </div>
            </div>
          </section>

          <div className="lg:col-span-8">
            <OfficeHoursSettingsSection
              isAdmin={isAdmin}
              officeHours={settings.office_hours}
              afterHoursPayments={settings.after_hours_payments}
              onSave={onUpdateOfficeHours}
            />
          </div>
        </div>

        <AiRecoverySettingsSection
          isAdmin={isAdmin}
          messages={settings.ai_recovery_messages}
          onSave={onUpdateAiRecoveryMessages}
        />

        <section
          className={`rounded-2xl p-4 md:p-5 ${CRM_SURFACES.elevated}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
                Prompt del agente IA
              </h3>
              <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
                Instrucciones de sistema para el asistente.
                {isUsingDefault
                  ? " Ahora se usa el prompt predeterminado."
                  : " Ahora se usa un prompt personalizado."}
              </p>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <CrmButton
                  type="button"
                  variant="primary"
                  disabled={!isDirty || isOverLimit || isSavingPrompt}
                  onClick={() => void handleSavePrompt()}>
                  {isSavingPrompt ? "Guardando…" : "Guardar prompt"}
                </CrmButton>
                <CrmButton
                  type="button"
                  variant="secondary"
                  disabled={isSavingPrompt || isUsingDefault}
                  onClick={() => void handleRestoreDefault()}>
                  Restaurar predeterminado
                </CrmButton>
              </div>
            ) : null}
          </div>

          <label htmlFor="crm-ai-system-prompt" className="sr-only">
            Prompt del sistema para el agente IA
          </label>
          <Textarea
            id="crm-ai-system-prompt"
            value={draftPrompt}
            onChange={(event) => setDraftPrompt(event.target.value)}
            disabled={!isAdmin || isSavingPrompt}
            className={`crm-scrollbar mt-4 h-56 resize-none overflow-y-auto font-mono text-xs leading-relaxed md:h-64 ${CRM_SURFACES.input}`}
            aria-describedby="crm-ai-system-prompt-help"
          />
          <div
            id="crm-ai-system-prompt-help"
            className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              className={
                isOverLimit ? "text-red-500" : CRM_SURFACES.textMuted
              }>
              {characterCount.toLocaleString("es-VE")} /{" "}
              {AI_SYSTEM_PROMPT_MAX_LENGTH.toLocaleString("es-VE")}
            </span>
            {showParserWarning ? (
              <span className="text-amber-600 dark:text-amber-400">
                Incluye referencias a tools (lookup_wispro, submit_payment,
                escalate_to_human) para mejores resultados.
              </span>
            ) : null}
          </div>

          {!isAdmin ? (
            <p className={`mt-3 text-sm ${CRM_SURFACES.textMuted}`}>
              Solo un administrador puede editar el prompt.
            </p>
          ) : null}
        </section>

        <section
          className={`rounded-2xl p-4 md:p-5 ${CRM_SURFACES.elevated}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
                Mensaje de pago aprobado
              </h3>
              <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
                Se envía automáticamente al cliente cuando Wispro confirma el pago.
                Usa <code>{"{{mes}}"}</code> para insertar el mes del pago.
              </p>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <CrmButton
                  type="button"
                  variant="primary"
                  disabled={
                    !isPaymentMessageDirty ||
                    isPaymentOverLimit ||
                    isSavingPaymentMessage
                  }
                  onClick={() => void handleSavePaymentMessage()}>
                  {isSavingPaymentMessage ? "Guardando…" : "Guardar mensaje"}
                </CrmButton>
                <CrmButton
                  type="button"
                  variant="secondary"
                  disabled={isSavingPaymentMessage || isUsingDefaultPaymentMessage}
                  onClick={() => void handleRestoreDefaultPaymentMessage()}>
                  Restaurar predeterminado
                </CrmButton>
              </div>
            ) : null}
          </div>

          <label htmlFor="crm-payment-success-message" className="sr-only">
            Mensaje de pago aprobado para el cliente
          </label>
          <Textarea
            id="crm-payment-success-message"
            value={draftPaymentMessage}
            onChange={(event) => setDraftPaymentMessage(event.target.value)}
            disabled={!isAdmin || isSavingPaymentMessage}
            className={`crm-scrollbar mt-4 h-56 resize-none overflow-y-auto text-sm leading-relaxed md:h-64 ${CRM_SURFACES.input}`}
            aria-describedby="crm-payment-success-message-help"
          />
          <div
            id="crm-payment-success-message-help"
            className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              className={
                isPaymentOverLimit ? "text-red-500" : CRM_SURFACES.textMuted
              }>
              {paymentCharacterCount.toLocaleString("es-VE")} /{" "}
              {PAYMENT_SUCCESS_MESSAGE_MAX_LENGTH.toLocaleString("es-VE")}
            </span>
            <span className={CRM_SURFACES.textMuted}>
              Vista previa:{" "}
              {buildPaymentSuccessMessage({
                template: draftPaymentMessage,
                paymentDate: new Date().toISOString(),
              }).slice(0, 90)}
              …
            </span>
          </div>

          {!isAdmin ? (
            <p className={`mt-3 text-sm ${CRM_SURFACES.textMuted}`}>
              Solo un administrador puede editar este mensaje.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
};
