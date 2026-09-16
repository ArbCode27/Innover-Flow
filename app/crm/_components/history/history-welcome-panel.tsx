"use client";

import { Archive, CalendarDays, MessageSquareText } from "lucide-react";
import { CRM_SURFACES } from "../../_lib/crm-theme";

interface HistoryWelcomePanelProps {
  totalEntries: number;
}

export const HistoryWelcomePanel = ({ totalEntries }: HistoryWelcomePanelProps) => (
  <section className="relative flex min-w-0 flex-1 overflow-hidden p-6">
    <div className="pointer-events-none absolute left-1/2 top-16 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />

    <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-3xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-600 shadow-2xl shadow-emerald-950/20 dark:text-emerald-300">
        <Archive className="size-8" aria-hidden="true" />
      </div>

      <div
        className={`rounded-3xl p-8 ${CRM_SURFACES.elevatedTranslucent}`}>
        <h2 className={`text-2xl font-semibold ${CRM_SURFACES.textPrimary}`}>
          Historial de conversaciones
        </h2>
        <p className={`mx-auto mt-3 max-w-lg text-sm leading-6 ${CRM_SURFACES.textMuted}`}>
          Consulta conversaciones resueltas y archivadas. El panel izquierdo las
          agrupa por fecha de resolución; al abrirlas verás los mensajes
          organizados por día.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
            <Archive className="mx-auto mb-2 size-5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
            <p className={`text-xl font-semibold ${CRM_SURFACES.textPrimary}`}>{totalEntries}</p>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>archivadas</p>
          </div>
          <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
            <CalendarDays className="mx-auto mb-2 size-5 text-crm-accent" aria-hidden="true" />
            <p className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>Por fecha</p>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>de resolución</p>
          </div>
          <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
            <MessageSquareText className="mx-auto mb-2 size-5 text-violet-600 dark:text-violet-300" aria-hidden="true" />
            <p className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>Solo lectura</p>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>vista tipo chat</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);
