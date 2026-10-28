"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Radio,
  RefreshCw,
  Send,
  Server,
  Signal,
  Users,
  Wifi,
  ZapOff,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { BoardPortTarget } from "../../_lib/types";
import type {
  AffectedClient,
  MonitoringIncident,
  MonitoringSummaryMetrics,
} from "@/types/smartolt";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import { NewMassNotificationForm } from "@/app/crm/notifications/NewMassNotificationForm";
import {
  getSignalQuality,
  getOnuStatusBadge,
} from "@/components/OnuStatusCard";
import {
  getSupabaseClient,
  ensureCrmRealtimeAuth,
} from "@/app/crm/_lib/supabase";
import { cn } from "@/lib/utils";

interface NotificationsViewProps {
  organizationId?: string;
}

interface PortSummaryItem {
  board: number;
  port: number;
  total: number;
  online: number;
  affected: number;
  healthRatio: number;
}

export const NotificationsView = ({
  organizationId,
}: NotificationsViewProps) => {
  const [metrics, setMetrics] = useState<MonitoringSummaryMetrics>({
    totalOnus: 0,
    totalOnline: 0,
    totalLos: 0,
    totalAlteredPower: 0,
    totalPowerFail: 0,
    totalOffline: 0,
    totalPortsInAlert: 0,
  });

  const [incidents, setIncidents] = useState<MonitoringIncident[]>([]);
  const [affectedClients, setAffectedClients] = useState<AffectedClient[]>([]);
  const [portsSummary, setPortsSummary] = useState<PortSummaryItem[]>([]);
  const [targets, setTargets] = useState<BoardPortTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtro en la tabla de clientes afectados
  const [incidentFilter, setIncidentFilter] = useState<
    "all" | "LOS" | "Potencia alterada" | "Power fail"
  >("all");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null,
  );

  // Estado para el modal de notificación masiva preconfigurada
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [targetBoard, setTargetBoard] = useState<number>(1);
  const [targetPort, setTargetPort] = useState<number>(1);

  // Estado para diagnóstico en vivo en una fila
  const [diagnosingClientSn, setDiagnosingClientSn] = useState<string | null>(
    null,
  );
  const [isSendingTestAlert, setIsSendingTestAlert] = useState(false);

  const handleTestPushAlert = async () => {
    setIsSendingTestAlert(true);
    try {
      const res = await fetch("/api/crm/monitoring/test-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: 1, port: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message || data.error || "No se pudo enviar la alerta",
        );
      }
      toast.success("Alerta enviada a la app móvil de gerentes", {
        description: data.message,
      });
    } catch (err) {
      toast.error("Alerta a gerentes", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSendingTestAlert(false);
    }
  };

  const fetchMonitoringData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const res = await fetch("/api/crm/monitoring", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setMetrics(data.metrics || {});
        setIncidents(data.incidents || []);
        setAffectedClients(data.affectedClients || []);
        setPortsSummary(data.portsSummary || []);

        // Generar lista de targets para el formulario de difusión
        const calculatedTargets: BoardPortTarget[] = (
          data.portsSummary || []
        ).map((p: PortSummaryItem) => ({
          board: p.board,
          port: p.port,
          clientCount: p.total,
        }));
        setTargets(calculatedTargets);
      }
    } catch (err) {
      console.warn("[MONITORING_VIEW] error al cargar datos:", err);
      if (!silent) toast.error("No se pudieron cargar los datos de monitoreo");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonitoringData();
  }, [fetchMonitoringData]);

  // Suscripción Realtime a client_onus para refresco en tiempo real
  useEffect(() => {
    void ensureCrmRealtimeAuth();
    const supabase = getSupabaseClient();

    const channel = supabase
      .channel("monitoring-client-onus-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_onus",
        },
        () => {
          // Actualización silenciosa ante cualquier cambio de estado o señal
          void fetchMonitoringData(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchMonitoringData]);

  // Abrir notificación masiva segmentada a un Board y Port
  const handleOpenTargetNotification = (board: number, port: number) => {
    setTargetBoard(board);
    setTargetPort(port);
    setIsNotifyModalOpen(true);
  };

  // Diagnóstico en vivo desde la tabla de clientes afectados
  const handleDiagnoseClient = async (client: AffectedClient) => {
    setDiagnosingClientSn(client.sn);
    try {
      const res = await fetch("/api/crm/smartolt/live-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onu_external_id: client.onuExternalId,
          clientId: client.clientId,
          sn: client.sn,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo consultar el estado actual en la OLT",
        );
      }

      toast.success(`Diagnóstico en vivo: ${client.name}`, {
        description: `Estado: ${data.data.onu_status} | RX: ${data.data.rx_power != null ? `${data.data.rx_power} dBm` : "N/D"} | Uptime: ${data.data.uptime || "N/D"}`,
      });

      // Refrescar tabla
      void fetchMonitoringData(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al diagnosticar equipo",
      );
    } finally {
      setDiagnosingClientSn(null);
    }
  };

  // Filtrado de clientes afectados
  const filteredClients = affectedClients.filter((c) => {
    if (selectedIncidentId) {
      const activeInc = incidents.find((inc) => inc.id === selectedIncidentId);
      if (activeInc) {
        return activeInc.clients.some((item) => item.id === c.id);
      }
    }
    if (incidentFilter === "all") return true;
    return c.incidentType === incidentFilter;
  });

  return (
    <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-6 text-emerald-500 animate-pulse" />
            <h2
              className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
              Monitoreo de Red
            </h2>
            {metrics.totalPortsInAlert > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                <AlertTriangle className="size-3" />
                {metrics.totalPortsInAlert}{" "}
                {metrics.totalPortsInAlert === 1
                  ? "puerto en alerta"
                  : "puertos en alerta"}
              </span>
            ) : null}
          </div>
          <p className={`text-sm mt-1 ${CRM_SURFACES.textMuted}`}>
            Detección en tiempo real de caídas en puertos PON, clientes en LOS y
            niveles de atenuación crítica (&gt; -29 dBm).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CrmButton
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => void fetchMonitoringData()}
            disabled={isLoading}
            aria-label="Refrescar monitoreo">
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          </CrmButton>

          <CrmButton
            type="button"
            variant="secondary"
            className="flex items-center gap-1.5 text-xs h-9"
            onClick={handleTestPushAlert}
            disabled={isSendingTestAlert}
            title="Envía una notificación de prueba al teléfono de los gerentes">
            <BellRing
              className={cn(
                "size-3.5 text-amber-500",
                isSendingTestAlert && "animate-bounce",
              )}
            />
            <span>
              {isSendingTestAlert ? "Enviando..." : "Probar push gerentes"}
            </span>
          </CrmButton>

          <CrmButton
            type="button"
            variant="primary"
            className="flex items-center gap-1.5"
            onClick={() => {
              setTargetBoard(targets[0]?.board ?? 1);
              setTargetPort(targets[0]?.port ?? 1);
              setIsNotifyModalOpen(true);
            }}>
            <Radio className="size-4" />
            <span>Crear difusión masiva</span>
          </CrmButton>
        </div>
      </div>

      {/* Tarjetas de Métricas de Red */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div
          className={`rounded-xl border p-3.5 shadow-xs ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              ONUs Registradas
            </span>
            <Server className="size-4 text-emerald-500" />
          </div>
          <p className={`mt-2 text-2xl font-bold ${CRM_SURFACES.textPrimary}`}>
            {metrics.totalOnus}
          </p>
          <p className={`mt-0.5 text-[11px] ${CRM_SURFACES.textMuted}`}>
            En toda la OLT
          </p>
        </div>

        <div
          className={`rounded-xl border p-3.5 shadow-xs ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Clientes Online
            </span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.totalOnline}
          </p>
          <p className={`mt-0.5 text-[11px] ${CRM_SURFACES.textMuted}`}>
            {metrics.totalOnus > 0
              ? `${Math.round((metrics.totalOnline / metrics.totalOnus) * 100)}% de salud de red`
              : "0%"}
          </p>
        </div>

        <div
          className={`rounded-xl border p-3.5 shadow-xs ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Desconectados (LOS)
            </span>
            <AlertCircle className="size-4 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {metrics.totalLos + metrics.totalOffline}
          </p>
          <p className={`mt-0.5 text-[11px] ${CRM_SURFACES.textMuted}`}>
            Sin enlace óptico con la OLT
          </p>
        </div>

        <div
          className={`rounded-xl border p-3.5 shadow-xs ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Potencia Alterada
            </span>
            <Signal className="size-4 text-orange-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-orange-600 dark:text-orange-400">
            {metrics.totalAlteredPower}
          </p>
          <p className={`mt-0.5 text-[11px] ${CRM_SURFACES.textMuted}`}>
            Señal &le; -29 dBm (intermitente)
          </p>
        </div>

        <div
          className={`rounded-xl border p-3.5 shadow-xs ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Power Fail
            </span>
            <ZapOff className="size-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {metrics.totalPowerFail}
          </p>
          <p className={`mt-0.5 text-[11px] ${CRM_SURFACES.textMuted}`}>
            Corte de energía en el cliente
          </p>
        </div>
      </div>

      {/* ================= SECCIÓN DE INCIDENCIAS ACTIVAS ================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3
              className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
              Incidencias Detectadas por Puerto PON
            </h3>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Anomalías agrupadas por puerto donde existen múltiples clientes
              afectados simultáneamente.
            </p>
          </div>
          {selectedIncidentId ? (
            <button
              type="button"
              onClick={() => setSelectedIncidentId(null)}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-500 underline">
              Ver todos los afectados
            </button>
          ) : null}
        </div>

        {incidents.length === 0 ? (
          <div
            className={`rounded-xl border p-5 text-center space-y-1.5 ${CRM_SURFACES.border} bg-emerald-500/[0.04]`}>
            <CheckCircle2 className="size-7 mx-auto text-emerald-500" />
            <p className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              No hay caídas masivas ni anomalías críticas en puertos
            </p>
            <p className={`text-xs max-w-md mx-auto ${CRM_SURFACES.textMuted}`}>
              Todos los puertos PON están funcionando dentro de los parámetros
              esperados de estabilidad y potencia óptica.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {incidents.map((inc) => {
              const isSelected = selectedIncidentId === inc.id;
              const isCritical = inc.severity === "critical";

              return (
                <div
                  key={inc.id}
                  className={cn(
                    "rounded-xl border p-4 space-y-3 transition-all",
                    isCritical
                      ? "border-rose-500/40 bg-rose-500/[0.03] shadow-xs"
                      : "border-orange-500/40 bg-orange-500/[0.03] shadow-xs",
                    isSelected && "ring-2 ring-emerald-500",
                  )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isCritical ? (
                        <AlertCircle className="size-5 text-rose-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="size-5 text-orange-500 shrink-0" />
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-foreground">
                          {inc.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="size-3" />
                            {inc.durationText}
                          </span>
                          <span>•</span>
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            {inc.affectedCount}{" "}
                            {inc.affectedCount === 1 ? "afectado" : "afectados"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {inc.managerAlertSent ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        title={
                          inc.managerAlertSentAt
                            ? `Alerta despachada a gerentes: ${inc.managerAlertSentAt}`
                            : "Notificado a gerentes"
                        }>
                        <BellRing className="size-3" />
                        <span>
                          Gerentes notificados{" "}
                          {inc.managerAlertAgo
                            ? `(${inc.managerAlertAgo})`
                            : ""}
                        </span>
                      </span>
                    ) : inc.affectedCount >= 3 ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <Bell className="size-3" />
                        <span>Notificación en curso</span>
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {inc.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIncidentId(isSelected ? null : inc.id)
                      }
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-500 underline">
                      {isSelected
                        ? "Ver todas las incidencias"
                        : `Ver los ${inc.affectedCount} clientes`}
                    </button>

                    <CrmButton
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs flex items-center gap-1.5"
                      onClick={() =>
                        handleOpenTargetNotification(inc.board, inc.port)
                      }>
                      <Send className="size-3" />
                      <span>Notificar a este puerto</span>
                    </CrmButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= TABLA DE CLIENTES AFECTADOS ================= */}
      <div
        className={`rounded-xl border shadow-sm ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
        <div className="p-4 border-b border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
                Clientes Afectados por Incidencias
              </h3>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                {filteredClients.length}
              </span>
            </div>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Listado con contabilizador de tiempo en falla (LOS, Offline, Power
              fail o Potencia alterada &le; -29 dBm).
            </p>
          </div>

          {/* Filtros de Tipo */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="size-3" /> Filtro:
            </span>
            <button
              type="button"
              onClick={() => {
                setIncidentFilter("all");
                setSelectedIncidentId(null);
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                incidentFilter === "all" && !selectedIncidentId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground",
              )}>
              Todos ({affectedClients.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setIncidentFilter("LOS");
                setSelectedIncidentId(null);
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                incidentFilter === "LOS"
                  ? "bg-rose-600 text-white"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground",
              )}>
              LOS / Caídos (
              {affectedClients.filter((c) => c.incidentType === "LOS").length})
            </button>
            <button
              type="button"
              onClick={() => {
                setIncidentFilter("Potencia alterada");
                setSelectedIncidentId(null);
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                incidentFilter === "Potencia alterada"
                  ? "bg-orange-600 text-white"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground",
              )}>
              Potencia &le; -29 dBm (
              {
                affectedClients.filter(
                  (c) => c.incidentType === "Potencia alterada",
                ).length
              }
              )
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8">
            <LoadingState label="Analizando estados y potencias de Smart OLT..." />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="size-8 mx-auto text-emerald-500" />
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
              No hay clientes afectados bajo este criterio
            </p>
            <p className={`text-xs max-w-md mx-auto ${CRM_SURFACES.textMuted}`}>
              Todos los clientes vinculados se encuentran con estado Online y
              potencias óptimas de señal óptica.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead
                className={`border-b text-xs uppercase tracking-wider ${CRM_SURFACES.border} ${CRM_SURFACES.textMuted}`}>
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Ubicación / Zona</th>
                  <th className="px-4 py-3">Board &amp; Port</th>
                  <th className="px-4 py-3">Serial (SN)</th>
                  <th className="px-4 py-3">Estado OLT</th>
                  <th className="px-4 py-3">Potencia RX</th>
                  <th className="px-4 py-3">Tiempo en Falla</th>
                  <th className="px-4 py-3 text-right">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredClients.map((client) => {
                  const statusBadge = getOnuStatusBadge(client.status);
                  const signalInfo = getSignalQuality(client.rxSignal);
                  const isDiagnosingThis = diagnosingClientSn === client.sn;

                  return (
                    <tr
                      key={client.id}
                      className={cn(
                        "transition-colors",
                        CRM_SURFACES.hover,
                        client.incidentType === "LOS" && "bg-rose-500/[0.02]",
                      )}>
                      {/* Cliente */}
                      <td className="px-4 py-3 font-medium">
                        <div className="font-semibold text-foreground">
                          {client.name}
                        </div>
                        {client.phone ? (
                          <div className="text-xs text-muted-foreground font-mono">
                            {client.phone}
                          </div>
                        ) : null}
                      </td>

                      {/* Ubicación / Zona */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {client.zone || "—"}
                      </td>

                      {/* Board & Port */}
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        Tarjeta {client.board} / Port {client.port}
                      </td>

                      {/* SN */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {client.sn}
                      </td>

                      {/* Estado OLT */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border",
                            statusBadge.badgeClass,
                          )}>
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              statusBadge.color,
                            )}
                          />
                          {client.status}
                        </span>
                      </td>

                      {/* Potencia RX */}
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        <span className={signalInfo.colorClass}>
                          {client.rxSignal != null
                            ? `${client.rxSignal} dBm`
                            : "Sin señal"}
                        </span>
                        <div
                          className={cn(
                            "text-[10px] font-normal",
                            signalInfo.colorClass,
                          )}>
                          {signalInfo.label}
                        </div>
                      </td>

                      {/* Tiempo en Falla (Contabilizador) */}
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1 text-xs font-mono font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          <Clock className="size-3" />
                          <span>{client.durationText}</span>
                        </div>
                      </td>

                      {/* Acción: Diagnóstico en Vivo */}
                      <td className="px-4 py-3 text-right">
                        <CrmButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs px-2"
                          disabled={isDiagnosingThis}
                          onClick={() => void handleDiagnoseClient(client)}
                          title="Consultar estado en vivo directo a Smart OLT">
                          <RefreshCw
                            className={cn(
                              "size-3 mr-1 text-emerald-500",
                              isDiagnosingThis && "animate-spin",
                            )}
                          />
                          <span>
                            {isDiagnosingThis ? "Leyendo..." : "Diagnóstico"}
                          </span>
                        </CrmButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= TABLA DE ESTADO POR PUERTO PON ================= */}
      <div
        className={`rounded-xl border shadow-sm ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div>
            <h3
              className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
              Puertos Smart OLT y Rango de Salud
            </h3>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Estado general por tarjeta y puerto PON con acceso a difusión push
              masiva.
            </p>
          </div>
        </div>

        {portsSummary.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No hay puertos con clientes vinculados actualmente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead
                className={`border-b text-xs uppercase tracking-wider ${CRM_SURFACES.border} ${CRM_SURFACES.textMuted}`}>
                <tr>
                  <th className="px-4 py-3">Board (Tarjeta)</th>
                  <th className="px-4 py-3">Puerto PON</th>
                  <th className="px-4 py-3">Clientes Vinculados</th>
                  <th className="px-4 py-3">Online</th>
                  <th className="px-4 py-3">Con Incidencia</th>
                  <th className="px-4 py-3">Salud del Puerto</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {portsSummary.map((tgt) => (
                  <tr
                    key={`${tgt.board}-${tgt.port}`}
                    className={`transition-colors ${CRM_SURFACES.hover}`}>
                    <td className="px-4 py-3 font-mono font-medium">
                      Tarjeta {tgt.board}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">
                      Puerto {tgt.port}
                    </td>
                    <td className="px-4 py-3 font-medium">{tgt.total}</td>
                    <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-medium">
                      {tgt.online}
                    </td>
                    <td className="px-4 py-3">
                      {tgt.affected > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          {tgt.affected} en alerta
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              tgt.healthRatio >= 90
                                ? "bg-emerald-500"
                                : tgt.healthRatio >= 60
                                  ? "bg-amber-500"
                                  : "bg-rose-500",
                            )}
                            style={{ width: `${tgt.healthRatio}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-medium">
                          {tgt.healthRatio}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CrmButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs flex items-center gap-1 ml-auto"
                        onClick={() =>
                          handleOpenTargetNotification(tgt.board, tgt.port)
                        }>
                        <Send className="size-3" />
                        <span>Difusión</span>
                      </CrmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Difusión Masiva Pre-configurada */}
      <NewMassNotificationForm
        open={isNotifyModalOpen}
        onOpenChange={setIsNotifyModalOpen}
        targetOptions={targets}
        defaultBoard={targetBoard}
        defaultPort={targetPort}
        organizationId={organizationId}
        onSuccess={() => void fetchMonitoringData(true)}
      />
    </div>
  );
};
