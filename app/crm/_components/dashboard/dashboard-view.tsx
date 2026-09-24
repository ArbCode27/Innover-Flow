"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Award,
  Banknote,
  CheckCircle2,
  Clock3,
  DollarSign,
  Eye,
  Headphones,
  Layers,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TicketCheck,
  TrendingUp,
  Trophy,
  Users,
  Star,
  Wallet,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AdvisorProductivityMetric,
  AgentDepartment,
  DashboardPayload,
  Organization,
} from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { EmptyState } from "../shared/empty-state";
import { LoadingState } from "../shared/loading-state";
import { AvatarInitials } from "../shared/avatar-initials";
import { CrmButton } from "../shared/crm-button";

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

const getWorkloadTheme = (percentage: number) => {
  if (percentage >= 85) {
    return {
      bar: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400 font-semibold",
      label: "Saturado",
    };
  }
  if (percentage >= 60) {
    return {
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400 font-medium",
      label: "Ocupado",
    };
  }
  return {
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400 font-medium",
    label: "Óptimo",
  };
};

const getResponseSpeedBadge = (milliseconds: number | null) => {
  if (milliseconds === null || milliseconds === undefined) {
    return {
      text: "N/D",
      className: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    };
  }
  const minutes = milliseconds / 60_000;
  if (minutes < 2) {
    return {
      text: `${Math.round(minutes)}m · Rápido`,
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    };
  }
  if (minutes < 8) {
    return {
      text: `${Math.round(minutes)}m · Normal`,
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    };
  }
  return {
    text: `${Math.round(minutes)}m · Lento`,
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  };
};

const getScoreBadge = (score: number) => {
  if (score === 0) {
    return {
      tier: "Sin actividad",
      className: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    };
  }
  if (score >= 80) {
    return {
      tier: "Excelente",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    };
  }
  if (score >= 60) {
    return {
      tier: "Bueno",
      className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    };
  }
  if (score >= 40) {
    return {
      tier: "Medio",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    };
  }
  return {
    tier: "Bajo",
    className: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  };
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
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Filtro de pestaña de departamento
  const [departmentTab, setDepartmentTab] = useState<"all" | "soporte" | "cobranza">("all");

  // Asesor seleccionado para modal de detalle
  const [selectedAdvisor, setSelectedAdvisor] = useState<AdvisorProductivityMetric | null>(null);

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

  // Lista de asesores filtrada según pestaña
  const filteredAdvisors = useMemo(() => {
    if (!data?.advisors) return [];
    if (departmentTab === "all") return data.advisors;
    return data.advisors.filter(
      (advisor) => advisor.department === departmentTab || advisor.department === "general",
    );
  }, [data?.advisors, departmentTab]);

  // Asesores destacados para el Podio
  const topSupport = useMemo(() => {
    if (!data?.advisors?.length) return null;
    const candidates = data.advisors.filter(
      (a) => a.department === "soporte" || a.department === "general",
    );
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => {
      if (b.resolved_conversations !== a.resolved_conversations) {
        return b.resolved_conversations - a.resolved_conversations;
      }
      return b.productivity_score - a.productivity_score;
    })[0];
  }, [data?.advisors]);

  const topBilling = useMemo(() => {
    if (!data?.advisors?.length) return null;
    const candidates = data.advisors.filter(
      (a) => a.department === "cobranza" || a.department === "general",
    );
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => {
      if (b.approved_payment_amount !== a.approved_payment_amount) {
        return b.approved_payment_amount - a.approved_payment_amount;
      }
      return b.approved_payments - a.approved_payments;
    })[0];
  }, [data?.advisors]);

  const topSpeed = useMemo(() => {
    if (!data?.advisors?.length) return null;
    const withResponse = data.advisors.filter(
      (a) => a.average_first_response_ms !== null && a.average_first_response_ms > 0,
    );
    if (!withResponse.length) return null;
    return [...withResponse].sort(
      (a, b) => (a.average_first_response_ms || 0) - (b.average_first_response_ms || 0),
    )[0];
  }, [data?.advisors]);

  const currency = organization?.currency || "USD";

  if (isLoading && !data) {
    return <LoadingState label="Calculando métricas de productividad..." />;
  }

  if (error && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        <EmptyState
          icon={Activity}
          title="No pudimos cargar el dashboard"
          description={error}
        />
        <div className="-mt-10 pb-10">
          <CrmButton onClick={() => setReloadKey((value) => value + 1)}>
            Reintentar
          </CrmButton>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const deptStats = data.metrics.department_stats;

  return (
    <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      {/* Cabecera */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
            Dashboard y Productividad
          </h1>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            {organization?.name || "Organización"} · Control de operaciones, cobranza y soporte
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
            onClick={() => setReloadKey((value) => value + 1)}
            aria-label="Actualizar métricas">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </CrmButton>
        </div>
      </header>

      {/* Tarjetas Principales de Indicadores Globales */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores Globales">
        <MetricCard
          label="Conversaciones recibidas"
          value={data.metrics.received_conversations.toLocaleString("es-VE")}
          helper={`${data.metrics.active_conversations} en gestión activa`}
          icon={MessageSquare}
        />
        <MetricCard
          label="Conversaciones resueltas"
          value={data.metrics.resolved_conversations.toLocaleString("es-VE")}
          helper={`TMR Promedio: ${formatDuration(data.metrics.average_resolution_ms)}`}
          icon={TicketCheck}
        />
        <MetricCard
          label="1ª Respuesta promedio"
          value={formatDuration(data.metrics.average_first_response_ms)}
          helper="Velocidad inicial de atención"
          icon={Clock3}
        />
        <MetricCard
          label="Recaudación validada"
          value={formatCurrency(data.metrics.approved_payment_amount, currency)}
          helper={`${data.metrics.approved_payments} pagos aprobados`}
          icon={Banknote}
        />
      </section>

      {/* Sección Operativa y Resúmenes Especializados de Departamentos */}
      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        {/* Gráfico de Volumen Diario */}
        <Card className={`rounded-2xl border-0 xl:col-span-6 ${CRM_SURFACES.elevated}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-crm-accent" />
              Volumen de conversaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartPoints ? (
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
              <span>{data.metrics.human_conversations} con asesor humano</span>
              <span>{data.metrics.bot_conversations} atendidas por IA</span>
            </div>
          </CardContent>
        </Card>

        {/* Resumen Especializado: Soporte Técnico */}
        <Card className={`rounded-2xl border-0 xl:col-span-3 ${CRM_SURFACES.elevated}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Wrench className="size-4 text-blue-500" />
                Dpto. Soporte
              </CardTitle>
              <Badge variant="outline" className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {deptStats?.support.online_agents || 0} online
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-1 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>Casos resueltos:</span>
              <strong className={CRM_SURFACES.textPrimary}>
                {deptStats?.support.resolved_conversations ?? data.metrics.resolved_conversations}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>Tickets cerrados:</span>
              <strong className={CRM_SURFACES.textPrimary}>
                {deptStats?.support.resolved_tickets ?? 0}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>1ª Respuesta media:</span>
              <strong className={CRM_SURFACES.textPrimary}>
                {formatDuration(deptStats?.support.average_first_response_ms ?? data.metrics.average_first_response_ms)}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>TMR de solución:</span>
              <strong className={CRM_SURFACES.textPrimary}>
                {formatDuration(deptStats?.support.average_resolution_ms ?? data.metrics.average_resolution_ms)}
              </strong>
            </div>
          </CardContent>
        </Card>

        {/* Resumen Especializado: Cobranza y Facturación */}
        <Card className={`rounded-2xl border-0 xl:col-span-3 ${CRM_SURFACES.elevated}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Wallet className="size-4 text-emerald-500" />
                Dpto. Cobranza
              </CardTitle>
              <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {deptStats?.billing.online_agents || 0} online
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-1 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>Total recaudado:</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                {formatCurrency(deptStats?.billing.approved_payment_amount ?? data.metrics.approved_payment_amount, currency)}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>Comprobantes aprobados:</span>
              <strong className={CRM_SURFACES.textPrimary}>
                {deptStats?.billing.approved_payments ?? data.metrics.approved_payments}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>Comprobantes rechazados:</span>
              <strong className={CRM_SURFACES.textPrimary}>
                {deptStats?.billing.rejected_payments ?? 0}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
              <span className={CRM_SURFACES.textMuted}>Tasa de aprobación:</span>
              <strong className={CRM_SURFACES.textPrimary}>
                {deptStats?.billing.approval_rate ?? 100}%
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Podio de Asesores Destacados (Top Performers) */}
      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Podio de Asesores Destacados">
        {/* Top Soporte */}
        <div className={`flex items-center gap-3.5 rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Trophy className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Top Soporte
              </span>
              <Sparkles className="size-3 text-amber-500" />
            </div>
            <p className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              {topSupport ? topSupport.name : "Sin registros"}
            </p>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              {topSupport
                ? `${topSupport.resolved_conversations} chats · ${topSupport.resolved_tickets} tickets`
                : "Sin actividad en el periodo"}
            </p>
          </div>
        </div>

        {/* Top Cobranza */}
        <div className={`flex items-center gap-3.5 rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <DollarSign className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Top Cobranza
              </span>
              <Award className="size-3 text-amber-500" />
            </div>
            <p className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              {topBilling ? topBilling.name : "Sin registros"}
            </p>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              {topBilling
                ? `${formatCurrency(topBilling.approved_payment_amount, currency)} (${topBilling.approved_payments} pagos)`
                : "Sin recaudación en el periodo"}
            </p>
          </div>
        </div>

        {/* Respuesta más Rápida */}
        <div className={`flex items-center gap-3.5 rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Zap className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Respuesta más veloz
              </span>
            </div>
            <p className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              {topSpeed ? topSpeed.name : "Sin registros"}
            </p>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              {topSpeed
                ? `Promedio: ${formatDuration(topSpeed.average_first_response_ms)}`
                : "Sin mediciones en el periodo"}
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN PRINCIPAL: TABLA DE PRODUCTIVIDAD Y RENDIMIENTO */}
      <Card className={`mt-5 rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">
              Productividad y Rendimiento del Equipo
            </CardTitle>
            <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
              Métricas comparativas adaptadas a las funciones de Soporte y Cobranza
            </p>
          </div>

          {/* Filtros de Pestaña de Especialidad */}
          <Tabs
            value={departmentTab}
            onValueChange={(val) =>
              setDepartmentTab(val as "all" | "soporte" | "cobranza")
            }
            className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-3 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.05] sm:inline-flex sm:w-auto">
              <TabsTrigger
                value="all"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-crm-accent data-[state=active]:shadow-sm dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white">
                <Users className="size-3.5" />
                Todos ({data.advisors.length})
              </TabsTrigger>
              <TabsTrigger
                value="soporte"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-blue-400">
                <Wrench className="size-3.5" />
                Soporte (
                {
                  data.advisors.filter(
                    (a) => a.department === "soporte" || a.department === "general",
                  ).length
                }
                )
              </TabsTrigger>
              <TabsTrigger
                value="cobranza"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-emerald-400">
                <Wallet className="size-3.5" />
                Cobranza (
                {
                  data.advisors.filter(
                    (a) => a.department === "cobranza" || a.department === "general",
                  ).length
                }
                )
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="overflow-x-auto p-0 sm:p-4 sm:pt-0">
          {!filteredAdvisors.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Headphones className="size-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium text-foreground">
                No hay asesores asignados a esta especialidad
              </p>
              <p className="text-xs text-muted-foreground">
                Puedes editar el departamento de tus asesores desde la pestaña de Asesores.
              </p>
            </div>
          ) : (
            <Table className="min-w-[760px] text-xs sm:text-sm">
              <TableHeader className={CRM_SURFACES.textMuted}>
                <TableRow className="border-b border-black/5 hover:bg-transparent dark:border-white/10">
                  <TableHead className="pb-3 pl-4 font-medium">Asesor</TableHead>
                  <TableHead className="pb-3 font-medium">Especialidad</TableHead>
                  <TableHead className="pb-3 font-medium">Carga / Capacidad</TableHead>
                  {departmentTab === "cobranza" ? (
                    <>
                      <TableHead className="pb-3 text-right font-medium">Comprobantes</TableHead>
                      <TableHead className="pb-3 text-right font-medium">Aprobación</TableHead>
                      <TableHead className="pb-3 text-right font-medium">Recaudación</TableHead>
                    </>
                  ) : departmentTab === "soporte" ? (
                    <>
                      <TableHead className="pb-3 text-right font-medium">Resueltos</TableHead>
                      <TableHead className="pb-3 text-right font-medium">Tickets</TableHead>
                      <TableHead className="pb-3 text-right font-medium">1ª Respuesta</TableHead>
                      <TableHead className="pb-3 text-right font-medium">TMR Solución</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="pb-3 text-right font-medium">Chats Resueltos</TableHead>
                      <TableHead className="pb-3 text-right font-medium">Tickets</TableHead>
                      <TableHead className="pb-3 text-right font-medium">Recaudado</TableHead>
                      <TableHead className="pb-3 text-right font-medium">1ª Respuesta</TableHead>
                    </>
                  )}
                  <TableHead className="pb-3 text-center font-medium">Score</TableHead>
                  <TableHead className="pb-3 pr-4 text-right font-medium">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-black/5 dark:divide-white/5">
                {filteredAdvisors.map((advisor) => {
                  const workloadTheme = getWorkloadTheme(advisor.workload_percentage);
                  const speedBadge = getResponseSpeedBadge(advisor.average_first_response_ms);
                  const scoreBadge = getScoreBadge(advisor.productivity_score);

                  return (
                    <TableRow
                      key={advisor.agent_id}
                      className="border-b border-black/5 transition-colors hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.02]">
                      {/* Asesor info */}
                      <TableCell className="py-3 pl-4">
                        <div className="flex items-center gap-2.5">
                          <AvatarInitials name={advisor.name} size="sm" />
                          <div>
                            <span className={`block font-medium ${CRM_SURFACES.textPrimary}`}>
                              {advisor.name}
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span
                                className={`inline-block size-1.5 rounded-full ${
                                  advisor.status === "online"
                                    ? "bg-emerald-500"
                                    : advisor.status === "busy"
                                      ? "bg-amber-500"
                                      : "bg-slate-400"
                                }`}
                              />
                              {advisor.status === "online"
                                ? "Disponible"
                                : advisor.status === "busy"
                                  ? "Ocupado"
                                  : "Desconectado"}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Especialidad */}
                      <TableCell className="py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            advisor.department === "cobranza"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : advisor.department === "soporte"
                                ? "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : "border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                          }`}>
                          {advisor.department === "cobranza" ? (
                            <>
                              <Wallet className="size-3" /> Cobranza
                            </>
                          ) : advisor.department === "soporte" ? (
                            <>
                              <Wrench className="size-3" /> Soporte
                            </>
                          ) : (
                            <>
                              <Layers className="size-3" /> General
                            </>
                          )}
                        </span>
                      </TableCell>

                      {/* Carga / Capacidad */}
                      <TableCell className="py-3">
                        <div className="w-36 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={CRM_SURFACES.textMuted}>
                              {advisor.active_conversations} / {advisor.max_conversations} chats
                            </span>
                            <span className={workloadTheme.text}>
                              {advisor.workload_percentage}%
                            </span>
                          </div>
                          <Progress
                            value={advisor.workload_percentage}
                            className="h-1.5 w-full bg-slate-200 dark:bg-white/10"
                          />
                        </div>
                      </TableCell>

                      {/* Columnas variables según departamento */}
                      {departmentTab === "cobranza" ? (
                        <>
                          <TableCell className="py-3 text-right">
                            <span className="font-semibold text-foreground">
                              {advisor.processed_payments}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {advisor.approved_payments} ap. / {advisor.rejected_payments} rech.
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <Badge
                              variant="outline"
                              className={
                                advisor.approval_rate >= 80
                                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              }>
                              {advisor.approval_rate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(advisor.approved_payment_amount, currency)}
                          </TableCell>
                        </>
                      ) : departmentTab === "soporte" ? (
                        <>
                          <TableCell className="py-3 text-right">
                            <span className="font-semibold text-foreground">
                              {advisor.resolved_conversations}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {advisor.resolution_rate}% efect.
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <span className="font-semibold text-foreground">
                              {advisor.resolved_tickets}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              de {advisor.assigned_tickets}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <Badge variant="outline" className={speedBadge.className}>
                              {speedBadge.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 text-right text-muted-foreground">
                            {formatDuration(advisor.average_resolution_ms)}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="py-3 text-right">
                            <span className="font-semibold text-foreground">
                              {advisor.resolved_conversations}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {advisor.resolution_rate}% resueltas
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            {advisor.department === "cobranza" ? (
                              <span
                                className="text-muted-foreground/50 font-mono text-xs"
                                title="No aplica: El asesor pertenece a Cobranza">
                                —
                              </span>
                            ) : (
                              <span>
                                {advisor.resolved_tickets} / {advisor.assigned_tickets}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            {advisor.department === "soporte" ? (
                              <span
                                className="text-muted-foreground/50 font-mono text-xs"
                                title="No aplica: El asesor pertenece a Soporte Técnico">
                                —
                              </span>
                            ) : (
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(advisor.approved_payment_amount, currency)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <Badge variant="outline" className={speedBadge.className}>
                              {speedBadge.text}
                            </Badge>
                          </TableCell>
                        </>
                      )}

                      {/* Score General */}
                      <TableCell className="py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreBadge.className}`}>
                          {advisor.productivity_score > 0 ? (
                            <>
                              <Star className="size-3 fill-current" />
                              {advisor.productivity_score} pts
                            </>
                          ) : (
                            <>
                              <span className="inline-block size-1.5 rounded-full bg-slate-400" />
                              0 pts
                            </>
                          )}
                        </span>
                      </TableCell>

                      {/* Acción */}
                      <TableCell className="py-3 pr-4 text-right">
                        <CrmButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAdvisor(advisor)}
                          className="h-8 gap-1 text-xs text-crm-accent hover:bg-crm-accent/10 hover:text-crm-accent">
                          <Eye className="size-3.5" />
                          Detalle
                        </CrmButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* MODAL DE DETALLE DEL ASESOR */}
      <Dialog
        open={Boolean(selectedAdvisor)}
        onOpenChange={(open) => {
          if (!open) setSelectedAdvisor(null);
        }}>
        <DialogContent className="max-w-lg rounded-2xl">
          {selectedAdvisor ? (
            <div>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <AvatarInitials name={selectedAdvisor.name} size="md" />
                  <div>
                    <DialogTitle className="text-base font-semibold">
                      {selectedAdvisor.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      {selectedAdvisor.department === "cobranza"
                        ? "Especialista en Cobranzas y Conciliación"
                        : selectedAdvisor.department === "soporte"
                          ? "Especialista en Soporte Técnico y Atención"
                          : "Asesor Polivalente (Soporte y Cobranza)"}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Score y Carga Banner */}
              <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
                <div>
                  <span className="text-[11px] text-muted-foreground">Productivity Score</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      {selectedAdvisor.productivity_score}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                    <Badge variant="outline" className={getScoreBadge(selectedAdvisor.productivity_score).className}>
                      {getScoreBadge(selectedAdvisor.productivity_score).tier}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">Saturación Operativa</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      {selectedAdvisor.workload_percentage}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({selectedAdvisor.active_conversations}/{selectedAdvisor.max_conversations})
                    </span>
                  </div>
                </div>
              </div>

              {/* Métricas de Soporte Técnico */}
              <div className="mt-4 space-y-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  <Wrench className="size-3.5" />
                  Rendimiento de Soporte y Atención
                </h4>
                {selectedAdvisor.department === "cobranza" ? (
                  <div className="rounded-xl border border-dashed border-blue-500/30 bg-blue-500/5 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-blue-500" />
                      Especialidad exclusiva de Cobranza y Finanzas
                    </p>
                    <p className="mt-1">
                      Este asesor está asignado a conciliación de pagos. La resolución de tickets técnicos no aplica a su perfil.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">Chats resueltos:</span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {selectedAdvisor.resolved_conversations}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          ({selectedAdvisor.resolution_rate}% tasa)
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">Tickets gestionados:</span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {selectedAdvisor.resolved_tickets} resueltos
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          / {selectedAdvisor.assigned_tickets}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">1ª Respuesta (FRT):</span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {formatDuration(selectedAdvisor.average_first_response_ms)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">Tiempo de solución (TMR):</span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {formatDuration(selectedAdvisor.average_resolution_ms)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Métricas de Cobranza y Finanzas */}
              <div className="mt-4 space-y-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <Wallet className="size-3.5" />
                  Rendimiento de Cobranzas y Recaudación
                </h4>
                {selectedAdvisor.department === "soporte" ? (
                  <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      Especialidad exclusiva de Soporte Técnico
                    </p>
                    <p className="mt-1">
                      Por política de segregación de funciones, este asesor técnico no gestiona ni valida transferencias bancarias o pagos.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">Monto Total Aprobado:</span>
                      <p className="mt-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(selectedAdvisor.approved_payment_amount, currency)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">Comprobantes evaluados:</span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {selectedAdvisor.processed_payments} total
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          ({selectedAdvisor.approved_payments} ap. / {selectedAdvisor.rejected_payments} rech.)
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">Tasa de aprobación:</span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {selectedAdvisor.approval_rate}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 p-2.5">
                      <span className="text-muted-foreground">Estado del usuario:</span>
                      <p className="mt-0.5 text-sm font-semibold capitalize">
                        {selectedAdvisor.status}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <CrmButton variant="secondary" size="sm" onClick={() => setSelectedAdvisor(null)}>
                  Cerrar
                </CrmButton>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
