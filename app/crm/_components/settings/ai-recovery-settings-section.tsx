"use client";

import { useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_RECOVERY_MESSAGE_MAX_LENGTH,
  DEFAULT_AI_ACK_MESSAGE,
  DEFAULT_AI_HARD_FALLBACK_MESSAGE,
  DEFAULT_AI_SOFT_HOLD_MESSAGE,
  parseAiRecoveryMessages,
  type AiRecoveryMessages,
} from "../../_lib/ai-recovery-messages";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

interface AiRecoverySettingsSectionProps {
  isAdmin: boolean;
  messages?: AiRecoveryMessages | null;
  onSave: (messages: AiRecoveryMessages) => Promise<void>;
}

const asDraft = (value: string | null | undefined, fallback: string) =>
  (value || "").trim() || fallback;

export const AiRecoverySettingsSection = ({
  isAdmin,
  messages,
  onSave,
}: AiRecoverySettingsSectionProps) => {
  const saved = parseAiRecoveryMessages(messages);
  const [draftAck, setDraftAck] = useState(asDraft(saved.ack, DEFAULT_AI_ACK_MESSAGE));
  const [draftSoft, setDraftSoft] = useState(
    asDraft(saved.soft_hold, DEFAULT_AI_SOFT_HOLD_MESSAGE),
  );
  const [draftHard, setDraftHard] = useState(
    asDraft(saved.hard_fallback, DEFAULT_AI_HARD_FALLBACK_MESSAGE),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftAck(asDraft(saved.ack, DEFAULT_AI_ACK_MESSAGE));
    setDraftSoft(asDraft(saved.soft_hold, DEFAULT_AI_SOFT_HOLD_MESSAGE));
    setDraftHard(asDraft(saved.hard_fallback, DEFAULT_AI_HARD_FALLBACK_MESSAGE));
  }, [saved.ack, saved.soft_hold, saved.hard_fallback]);

  const isUsingDefaults = !saved.ack && !saved.soft_hold && !saved.hard_fallback;
  const isOverLimit =
    draftAck.length > AI_RECOVERY_MESSAGE_MAX_LENGTH ||
    draftSoft.length > AI_RECOVERY_MESSAGE_MAX_LENGTH ||
    draftHard.length > AI_RECOVERY_MESSAGE_MAX_LENGTH;

  const isDirty = useMemo(() => {
    const nextAck = draftAck.trim();
    const nextSoft = draftSoft.trim();
    const nextHard = draftHard.trim();
    const savedAck = saved.ack || DEFAULT_AI_ACK_MESSAGE;
    const savedSoft = saved.soft_hold || DEFAULT_AI_SOFT_HOLD_MESSAGE;
    const savedHard = saved.hard_fallback || DEFAULT_AI_HARD_FALLBACK_MESSAGE;
    return nextAck !== savedAck || nextSoft !== savedSoft || nextHard !== savedHard;
  }, [draftAck, draftSoft, draftHard, saved.ack, saved.soft_hold, saved.hard_fallback]);

  const handleSave = async () => {
    if (!isAdmin || !isDirty || isOverLimit || isSaving) return;

    setIsSaving(true);
    try {
      const ack = draftAck.trim();
      const softHold = draftSoft.trim();
      const hardFallback = draftHard.trim();
      await onSave({
        ack: !ack || ack === DEFAULT_AI_ACK_MESSAGE ? null : ack,
        soft_hold:
          !softHold || softHold === DEFAULT_AI_SOFT_HOLD_MESSAGE
            ? null
            : softHold,
        hard_fallback:
          !hardFallback || hardFallback === DEFAULT_AI_HARD_FALLBACK_MESSAGE
            ? null
            : hardFallback,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefault = async () => {
    if (!isAdmin || isSaving) return;

    setDraftAck(DEFAULT_AI_ACK_MESSAGE);
    setDraftSoft(DEFAULT_AI_SOFT_HOLD_MESSAGE);
    setDraftHard(DEFAULT_AI_HARD_FALLBACK_MESSAGE);
    if (isUsingDefaults) return;

    setIsSaving(true);
    try {
      await onSave({
        ack: null,
        soft_hold: null,
        hard_fallback: null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      className={`rounded-2xl p-4 md:p-5 ${CRM_SURFACES.elevated}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
            Mensajes de recuperación de Nova
          </h3>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            Se usan cuando la IA tarda o satura. Los mensajes de cédula,
            comprobante o pedido de asesor siguen siendo específicos.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <CrmButton
              type="button"
              variant="primary"
              disabled={!isDirty || isOverLimit || isSaving}
              onClick={() => void handleSave()}>
              {isSaving ? "Guardando…" : "Guardar mensajes"}
            </CrmButton>
            <CrmButton
              type="button"
              variant="secondary"
              disabled={isSaving || isUsingDefaults}
              onClick={() => void handleRestoreDefault()}>
              Restaurar predeterminados
            </CrmButton>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="crm-ai-ack-message"
            className={`mb-1.5 block text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
            Espera (ack)
          </label>
          <Textarea
            id="crm-ai-ack-message"
            value={draftAck}
            onChange={(event) => setDraftAck(event.target.value)}
            disabled={!isAdmin || isSaving}
            className={`crm-scrollbar h-32 resize-none overflow-y-auto text-sm leading-relaxed ${CRM_SURFACES.input}`}
            aria-describedby="crm-ai-ack-message-help"
          />
          <p
            id="crm-ai-ack-message-help"
            className={`mt-1 text-xs ${
              draftAck.length > AI_RECOVERY_MESSAGE_MAX_LENGTH
                ? "text-red-500"
                : CRM_SURFACES.textMuted
            }`}>
            {draftAck.length.toLocaleString("es-VE")} /{" "}
            {AI_RECOVERY_MESSAGE_MAX_LENGTH.toLocaleString("es-VE")}
          </p>
        </div>

        <div>
          <label
            htmlFor="crm-ai-soft-hold-message"
            className={`mb-1.5 block text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
            Contención (reintento)
          </label>
          <Textarea
            id="crm-ai-soft-hold-message"
            value={draftSoft}
            onChange={(event) => setDraftSoft(event.target.value)}
            disabled={!isAdmin || isSaving}
            className={`crm-scrollbar h-32 resize-none overflow-y-auto text-sm leading-relaxed ${CRM_SURFACES.input}`}
            aria-describedby="crm-ai-soft-hold-message-help"
          />
          <p
            id="crm-ai-soft-hold-message-help"
            className={`mt-1 text-xs ${
              draftSoft.length > AI_RECOVERY_MESSAGE_MAX_LENGTH
                ? "text-red-500"
                : CRM_SURFACES.textMuted
            }`}>
            {draftSoft.length.toLocaleString("es-VE")} /{" "}
            {AI_RECOVERY_MESSAGE_MAX_LENGTH.toLocaleString("es-VE")}
          </p>
        </div>

        <div>
          <label
            htmlFor="crm-ai-hard-fallback-message"
            className={`mb-1.5 block text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
            Escalamiento (asesor)
          </label>
          <Textarea
            id="crm-ai-hard-fallback-message"
            value={draftHard}
            onChange={(event) => setDraftHard(event.target.value)}
            disabled={!isAdmin || isSaving}
            className={`crm-scrollbar h-32 resize-none overflow-y-auto text-sm leading-relaxed ${CRM_SURFACES.input}`}
            aria-describedby="crm-ai-hard-fallback-message-help"
          />
          <p
            id="crm-ai-hard-fallback-message-help"
            className={`mt-1 text-xs ${
              draftHard.length > AI_RECOVERY_MESSAGE_MAX_LENGTH
                ? "text-red-500"
                : CRM_SURFACES.textMuted
            }`}>
            {draftHard.length.toLocaleString("es-VE")} /{" "}
            {AI_RECOVERY_MESSAGE_MAX_LENGTH.toLocaleString("es-VE")}
          </p>
        </div>
      </div>

      {!isAdmin ? (
        <p className={`mt-3 text-sm ${CRM_SURFACES.textMuted}`}>
          Solo un administrador puede editar estos mensajes.
        </p>
      ) : null}
    </section>
  );
};
