"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  Clock3,
  MessageSquare,
  RefreshCw,
  TicketCheck,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Organization } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { EmptyState } from "../shared/empty-state";
import { CrmButton } from "../shared/crm-button";
import { useTeamScores } from "../../_hooks/use-team-scores";
import { FieldDeptCard } from "./field-dept-card";
import { OfficeDeptCard } from "./office-dept-card";
import { TeamProductivityTable } from "./team-productivity-table";
import { TopPerformers } from "./top-performers";

const formatDuration = (milliseconds: number | null): string => {
  if (milliseconds === null || milliseconds === undefined) return "Sin datos";
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

const formatCurrency = (amount: number, currency = "USD"): string =>
  new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);

const MetricCard = ({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Activity;
}) => (
  <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
    <CardContent className="flex items-start justify-between p-5">
      <div>
        <p className={`text-sm ${CRM_SURFACES.textMuted}`}>{label}</p>
        <p className={`mt-2 text-2xl font-semibold tracking-tight ${CRM_SURFACES.textPrimary}`}>
          {value}
        </p>
        <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>{helper}</p>
      </div>
      <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
        <Icon className="size-5" aria-hidden="true" />
      </span>
    </CardContent>
  </Card>
);

export const DashboardView = ({
  organization,
}: {
  organization: Organization | null;
}) => {
  const [days, setDays] = useState("30");
  const { data, team, topOffice, topField, isLoading, error, reload } = useTeamScores(
    Number(days),
  );

  const chartPoints = useMemo(() => {
    if (!data?.daily_volume.length) return "";
    const max = Math.max(
      1,
      ...data.daily_volume.flatMap((day) => [day.received, day.resolved]),
    );
    return data.daily_volume
      .map((day, index) => {
        const x =
          data.daily_volume.length === 1
            ? 50
            : (index / (data.daily_volume.length - 1)) * 100;
        const y = 44 - (day.received / max) * 38;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data]);

  const currency = organization?.currency || "USD";

  if (error && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        <EmptyState
          icon={Activity}
          title="No pudimos cargar el dashboard"
          description={error}
        />
        <div className="-mt-10 pb-10">
          <CrmButton onClick={reload}>Reintentar</CrmButton>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
            Dashboard y Productividad
          </h1>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            {organization?.name || "Organización"} · Oficina y técnicos de campo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className={`w-36 ${CRM_SURFACES.input}`} aria-label="Periodo de tiempo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="90">Últimos 90 días</SelectItem>
            </SelectContent>
          </Select>
          <CrmButton
            variant="secondary"
            size="icon"
            onClick={reload}
            aria-label="Actualizar métricas">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </CrmButton>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores Globales">
        {isLoading && !data ? (
          <>
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </>
        ) : (
          <>
            <MetricCard
              label="Conversaciones recibidas"
              value={(data?.metrics.received_conversations ?? 0).toLocaleString("es-VE")}
              helper={`${data?.metrics.active_conversations ?? 0} en gestión activa`}
              icon={MessageSquare}
            />
            <MetricCard
              label="Conversaciones resueltas"
              value={(data?.metrics.resolved_conversations ?? 0).toLocaleString("es-VE")}
              helper={`TMR Promedio: ${formatDuration(data?.metrics.average_resolution_ms ?? null)}`}
              icon={TicketCheck}
            />
            <MetricCard
              label="1ª Respuesta promedio"
              value={formatDuration(data?.metrics.average_first_response_ms ?? null)}
              helper="Velocidad inicial de atención"
              icon={Clock3}
            />
            <MetricCard
              label="Recaudación validada"
              value={formatCurrency(data?.metrics.approved_payment_amount ?? 0, currency)}
              helper={`${data?.metrics.approved_payments ?? 0} pagos aprobados`}
              icon={Banknote}
            />
          </>
        )}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className={`rounded-2xl border-0 xl:col-span-6 ${CRM_SURFACES.elevated}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-crm-accent" />
              Volumen de conversaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-28 w-full" />
            ) : chartPoints ? (
              <svg
                viewBox="0 0 100 48"
                className="h-28 w-full overflow-visible"
                aria-hidden="true">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-crm-accent"
                  points={chartPoints}
                />
              </svg>
            ) : (
              <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                Sin actividad registrada en este rango
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{data?.metrics.human_conversations ?? 0} con asesor humano</span>
              <span>{data?.metrics.bot_conversations ?? 0} atendidas por IA</span>
            </div>
          </CardContent>
        </Card>
        <OfficeDeptCard stats={data?.metrics.office ?? null} isLoading={isLoading && !data} />
        <FieldDeptCard stats={data?.metrics.field ?? null} isLoading={isLoading && !data} />
      </div>

      <TopPerformers topOffice={topOffice} topField={topField} />
      <TeamProductivityTable team={team} isLoading={isLoading && !data} />
    </div>
  );
};
