"use client";

import { HardHat, Sparkles, Trophy, UserRound } from "lucide-react";
import { formatScore, type FieldTeamRow, type OfficeTeamRow } from "@/lib/scoring";
import { CRM_SURFACES } from "../../_lib/crm-theme";

const PerformerCard = ({
  label,
  iconClassName,
  icon: Icon,
  name,
  detail,
}: {
  label: string;
  iconClassName: string;
  icon: typeof Trophy;
  name: string;
  detail: string;
}) => (
  <div className={`flex items-center gap-3.5 rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
    <div
      className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
      <Icon className="size-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Sparkles className="size-3 text-amber-500" />
      </div>
      <p className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>{name}</p>
      <p className={`text-xs ${CRM_SURFACES.textMuted}`}>{detail}</p>
    </div>
  </div>
);

export const TopPerformers = ({
  topOffice,
  topField,
}: {
  topOffice: OfficeTeamRow | null;
  topField: FieldTeamRow | null;
}) => (
  <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Mejores desempeños del periodo">
    <PerformerCard
      label="Top Agente"
      icon={UserRound}
      iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-400"
      name={topOffice ? topOffice.name : "Sin registros"}
      detail={
        topOffice
          ? `${topOffice.metrics.chatsResolved} chats · score ${formatScore(topOffice.score)}`
          : "Sin actividad de oficina en el periodo"
      }
    />
    <PerformerCard
      label="Top Técnico"
      icon={HardHat}
      iconClassName="bg-amber-500/10 text-amber-700 dark:text-amber-400"
      name={topField ? topField.name : "Sin registros"}
      detail={
        topField
          ? `${topField.metrics.ticketsResolved} resueltos · score ${formatScore(topField.score)}`
          : "Sin actividad de campo en el periodo"
      }
    />
  </section>
);
