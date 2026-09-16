"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  Clock3,
  MessageSquare,
  RefreshCw,
  TicketCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Organization } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { EmptyState } from "../shared/empty-state";
import { LoadingState } from "../shared/loading-state";

type DashboardPayload = {
  scope: "organization" | "advisor";
  metrics: {
    received_conversations: number;
    active_conversations: number;
    resolved_conversations: number;
    average_first_response_ms: number | null;
    average_resolution_ms: number | null;
    human_conversations: number;
    bot_conversations: number;
    open_tickets: number;
    approved_payments: number;
    approved_payment_amount: number;
  };
  daily_volume: Array<{ date: string; received: number; resolved: number }>;
  advisors: Array<{
    agent_id: number;
    name: string;
    status: string;
    active_conversations: number;
    resolved_conversations: number;
    average_first_response_ms: number | null;
    approved_payments: number;
  }>;
};

const formatDuration = (milliseconds: number | null) => {
  if (milliseconds === null) return "Sin datos";
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} h ${remainingMinutes} min`;
};

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
        <p className={`mt-2 text-2xl font-semibold ${CRM_SURFACES.textPrimary}`}>
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
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - (Number(days) - 1) * 86_400_000);
    const params = new URLSearchParams({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
    setIsLoading(true);
    setError(null);
    fetch(`/api/crm/dashboard?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "No se pudieron cargar las métricas");
        }
        setData(payload);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar las métricas",
        );
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [days, reloadKey]);

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

  if (isLoading && !data) {
    return <LoadingState label="Calculando métricas..." />;
  }

  if (error && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <EmptyState
          icon={Activity}
          title="No pudimos cargar el dashboard"
          description={error}
        />
        <div className="-mt-10 pb-10">
          <Button onClick={() => setReloadKey((value) => value + 1)}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
            Dashboard
          </h1>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            {organization?.name || "Organización"} · rendimiento operativo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className={`w-36 ${CRM_SURFACES.input}`} aria-label="Periodo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="90">Últimos 90 días</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setReloadKey((value) => value + 1)}
            aria-label="Actualizar métricas">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
        <MetricCard
          label="Conversaciones recibidas"
          value={data.metrics.received_conversations.toLocaleString("es-VE")}
          helper={`${data.metrics.active_conversations} activas`}
          icon={MessageSquare}
        />
        <MetricCard
          label="Conversaciones resueltas"
          value={data.metrics.resolved_conversations.toLocaleString("es-VE")}
          helper={`Promedio ${formatDuration(data.metrics.average_resolution_ms)}`}
          icon={TicketCheck}
        />
        <MetricCard
          label="Primera respuesta"
          value={formatDuration(data.metrics.average_first_response_ms)}
          helper="Promedio del periodo"
          icon={Clock3}
        />
        <MetricCard
          label="Pagos aprobados"
          value={data.metrics.approved_payments.toLocaleString("es-VE")}
          helper={new Intl.NumberFormat("es-VE", {
            style: "currency",
            currency: organization?.currency || "USD",
          }).format(data.metrics.approved_payment_amount)}
          icon={Banknote}
        />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className={`rounded-2xl border-0 xl:col-span-7 ${CRM_SURFACES.elevated}`}>
          <CardHeader>
            <CardTitle className="text-base">Volumen de conversaciones</CardTitle>
          </CardHeader>
          <CardContent>
            {chartPoints ? (
              <svg
                className="h-52 w-full overflow-visible"
                viewBox="0 0 100 48"
                preserveAspectRatio="none"
                role="img"
                aria-label="Tendencia de conversaciones recibidas">
                <line x1="0" y1="44" x2="100" y2="44" stroke="currentColor" opacity="0.12" />
                <polyline
                  points={chartPoints}
                  fill="none"
                  stroke="var(--crm-accent)"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : (
              <p className={`py-20 text-center text-sm ${CRM_SURFACES.textMuted}`}>
                No hay actividad en este periodo.
              </p>
            )}
            <div className={`mt-2 flex gap-5 text-xs ${CRM_SURFACES.textMuted}`}>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-crm-accent" />
                Recibidas
              </span>
              <span>{data.metrics.human_conversations} con atención humana</span>
              <span>{data.metrics.bot_conversations} gestionadas por IA</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`rounded-2xl border-0 xl:col-span-5 ${CRM_SURFACES.elevated}`}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Estado operativo</CardTitle>
            <Badge variant="secondary">{data.metrics.open_tickets} tickets abiertos</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <span className={`flex items-center gap-2 text-sm ${CRM_SURFACES.textSecondary}`}>
                <Users className="size-4" /> Asesores disponibles
              </span>
              <strong className={CRM_SURFACES.textPrimary}>
                {data.advisors.filter((agent) => agent.status === "online").length}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <span className={`flex items-center gap-2 text-sm ${CRM_SURFACES.textSecondary}`}>
                <Activity className="size-4" /> Conversaciones activas
              </span>
              <strong className={CRM_SURFACES.textPrimary}>
                {data.metrics.active_conversations}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.advisors.length ? (
        <Card className={`mt-4 rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
          <CardHeader>
            <CardTitle className="text-base">Rendimiento de asesores</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className={CRM_SURFACES.textMuted}>
                <tr className="border-b border-black/5 dark:border-white/10">
                  <th className="pb-3 font-medium">Asesor</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 text-right font-medium">Activas</th>
                  <th className="pb-3 text-right font-medium">Resueltas</th>
                  <th className="pb-3 text-right font-medium">1ª respuesta</th>
                  <th className="pb-3 text-right font-medium">Pagos</th>
                </tr>
              </thead>
              <tbody>
                {data.advisors.map((advisor) => (
                  <tr
                    key={advisor.agent_id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className={`py-3 font-medium ${CRM_SURFACES.textPrimary}`}>
                      {advisor.name}
                    </td>
                    <td className="py-3">
                      <Badge variant={advisor.status === "online" ? "default" : "secondary"}>
                        {advisor.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">{advisor.active_conversations}</td>
                    <td className="py-3 text-right">{advisor.resolved_conversations}</td>
                    <td className="py-3 text-right">
                      {formatDuration(advisor.average_first_response_ms)}
                    </td>
                    <td className="py-3 text-right">{advisor.approved_payments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
