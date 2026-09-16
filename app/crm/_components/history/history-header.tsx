"use client";

import { ArrowLeft, Bot, CreditCard, Headphones, MapPin, Phone } from "lucide-react";
import { CRM_BADGE_TONES, CRM_SURFACES } from "../../_lib/crm-theme";
import { formatCrmDate } from "../../_lib/formatters";
import { getHistoryMessageCount } from "../../_lib/history-utils";
import type { Agent, ConversationHistory, Label } from "../../_lib/types";
import { cn } from "@/lib/utils";
import { AvatarInitials } from "../shared/avatar-initials";
import { LabelChip } from "../shared/label-chip";

interface HistoryHeaderProps {
  entry: ConversationHistory;
  resolvedByAgent: Agent | null;
  assignedAgent: Agent | null;
  labels: Label[];
  onBackToList?: () => void;
}

export const HistoryHeader = ({
  entry,
  resolvedByAgent,
  assignedAgent,
  labels,
  onBackToList,
}: HistoryHeaderProps) => {
  const displayName = entry.client_name || "Número desconocido";
  const phone = entry.client_phone || "Sin identificar";

  return (
    <header
      className={`shrink-0 border-b backdrop-blur ${CRM_SURFACES.border} ${CRM_SURFACES.elevatedTranslucent}`}>
      <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          {onBackToList ? (
            <button
              type="button"
              onClick={onBackToList}
              className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:hidden dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Volver al historial">
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <AvatarInitials
            name={displayName}
            color="#64748b"
            bg="rgba(100,116,139,.15)"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`truncate text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
                {displayName}
              </h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  entry.human_mode ? CRM_BADGE_TONES.rose : CRM_BADGE_TONES.violet,
                )}>
                {entry.human_mode ? (
                  <Headphones className="size-3" aria-hidden="true" />
                ) : (
                  <Bot className="size-3" aria-hidden="true" />
                )}
                {entry.human_mode ? "Atención humana" : "Atención bot"}
              </span>
            </div>

            <dl className={`mt-2 grid gap-1 text-xs ${CRM_SURFACES.textMuted}`}>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Teléfono</dt>
                <Phone className="size-3 shrink-0" aria-hidden="true" />
                <dd>{phone}</dd>
              </div>
              {entry.client_plan ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Plan</dt>
                  <CreditCard className="size-3 shrink-0" aria-hidden="true" />
                  <dd>{entry.client_plan}</dd>
                </div>
              ) : null}
              {entry.client_zone ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Zona</dt>
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  <dd>{entry.client_zone}</dd>
                </div>
              ) : null}
            </dl>

            {labels.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {labels.map((label) => (
                  <LabelChip key={label.id} label={label} />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <aside className={`rounded-2xl p-3 text-xs xl:min-w-56 ${CRM_SURFACES.card}`}>
          <p className={`font-medium ${CRM_SURFACES.textSecondary}`}>Resumen archivado</p>
          <ul className={`mt-2 space-y-1.5 ${CRM_SURFACES.textMuted}`}>
            <li>
              <span className={CRM_SURFACES.textLabel}>Última resolución:</span>{" "}
              <time dateTime={entry.resolved_at}>{formatCrmDate(entry.resolved_at)}</time>
            </li>
            <li>
              <span className={CRM_SURFACES.textLabel}>Última resolución por:</span>{" "}
              {resolvedByAgent?.name || "Desconocido"}
            </li>
            {assignedAgent ? (
              <li>
                <span className={CRM_SURFACES.textLabel}>Asignada a:</span>{" "}
                {assignedAgent.name}
              </li>
            ) : null}
            <li>
              <span className={CRM_SURFACES.textLabel}>Mensajes:</span>{" "}
              {getHistoryMessageCount(entry)}
            </li>
            {entry.client_account ? (
              <li>
                <span className={CRM_SURFACES.textLabel}>Cuenta:</span>{" "}
                {entry.client_account}
              </li>
            ) : null}
          </ul>
        </aside>
      </div>
    </header>
  );
};
