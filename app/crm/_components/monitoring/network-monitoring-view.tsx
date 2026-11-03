"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Copy,
  Filter,
  Layers,
  MessageSquare,
  Power,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  Signal,
  Ticket,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  Zap,
  ZapOff,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import {
  CRM_FOCUS_RING,
  CRM_PANEL,
  CRM_SURFACES,
  CRM_TABLE,
} from "../../_lib/crm-theme";
import { getSignalQuality } from "@/components/OnuStatusCard";
import {
  ensureCrmRealtimeAuth,
  getSupabaseClient,
} from "@/app/crm/_lib/supabase";
import { NewMassNotificationForm } from "@/app/crm/notifications/NewMassNotificationForm";
import type { BoardPortTarget } from "../../_lib/types";
import type {
  AffectedClient,
  MonitoringIncident,
  MonitoringSummaryMetrics,
} from "@/types/smartolt";
import { cn } from "@/lib/utils";

export interface NetworkMonitoringViewProps {
  organizationId?: string;
  onOpenTicketChat?: (conversationId: number) => void;
  onOpenClientChat?: (clientId: number) => void;
  onCreateFieldTicket?: (payload: {
    title: string;
    description?: string;
    priority: "baja" | "media" | "alta" | "critica";
    crmClientId?: number;
    clientName?: string;
    clientPhone?: string;
  }) => Promise<void>;
}

export interface IncomingPushAlert {
  id: string;
  timestamp: string;
  board: number;
  port: number;
  affectedCount: number;
  severity: "critical" | "warning";
  title: string;
  body: string;
}

export interface PortSummaryItem {
  board: number;
  port: number;
  total: number;
  online: number;
  affected: number;
  healthRatio: number;
  managerAlertSent?: boolean;
  managerAlertSentAt?: string | null;
  managerAlertAgo?: string | null;
}

/**
 * Generador sintético de sonido de alerta gerencial mediante Web Audio API.
 * Emite dos tonos armónicos suaves pero perceptibles para alertar al operador sin ser intrusivo.
 */
const playIncidentChime = () => {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tono 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Tono 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.24, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.7);
  } catch (error) {
    console.debug("[INCIDENT_CHIME] audio bloqueado por navegador:", error);
  }
};

/**
 * Disparador de Notificación Nativa del Sistema Operativo si el navegador tiene permiso concedido.
 */
const triggerBrowserNotification = (title: string, body: string) => {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "innovercorp-network-alert",
      });
    } catch (e) {
      console.debug("[NOTIFICATION_API] error:", e);
    }
  }
};

export const NetworkMonitoringView = ({
  organizationId,
  onOpenTicketChat,
  onOpenClientChat,
  onCreateFieldTicket,
}: NetworkMonitoringViewProps) => {
  // Datos principales
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Alerta Push de InnoverCorp en vivo
  const [activePushAlert, setActivePushAlert] =
    useState<IncomingPushAlert | null>(null);
  const [lastPushReceivedAt, setLastPushReceivedAt] = useState<Date | null>(
    null,
  );
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotificationStatus, setBrowserNotificationStatus] = useState<
    NotificationPermission | "default"
  >("default");

  // Filtros interactivos por Tarjeta (Board) y Puerto (Port)
  const [selectedBoard, setSelectedBoard] = useState<number | "all">("all");
  const [selectedPort, setSelectedPort] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "LOS" | "Potencia alterada" | "Power fail" | "Offline"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "table">("grouped");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null,
  );

  // Diagnóstico en vivo por fila
  const [diagnosingClientSn, setDiagnosingClientSn] = useState<string | null>(
    null,
  );
  const [isSimulatingPush, setIsSimulatingPush] = useState(false);
  const [isDispatchingAlert, setIsDispatchingAlert] = useState(false);

  // Modal de Difusión Masiva preconfigurada
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [targetBoard, setTargetBoard] = useState<number>(1);
  const [targetPort, setTargetPort] = useState<number>(1);

  // Referencias a secciones para scroll suave
  const clientsSectionRef = useRef<HTMLDivElement | null>(null);
  const portsSectionRef = useRef<HTMLDivElement | null>(null);

  // Verificar estado de permisos de notificación al montar
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserNotificationStatus(Notification.permission);
    }
  }, []);

  const handleRequestBrowserNotification = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.info(
        "Las notificaciones de escritorio no están soportadas en este navegador",
      );
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setBrowserNotificationStatus(permission);
      if (permission === "granted") {
        toast.success(
          "Notificaciones de escritorio habilitadas para incidencias de red",
        );
      } else {
        toast.warning("Notificaciones bloqueadas por el usuario o navegador");
      }
    } catch (err) {
      console.warn("[NOTIFICATION_PERMISSION] error:", err);
    }
  };

  // Carga de datos de monitoreo e incidencias
  const fetchMonitoringData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);

      const res = await fetch("/api/crm/monitoring", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setMetrics(data.metrics || {});
        setIncidents(data.incidents || []);
        setAffectedClients(data.affectedClients || []);
        setPortsSummary(data.portsSummary || []);

        const calculatedTargets: BoardPortTarget[] = (
          data.portsSummary || []
        ).map((p: PortSummaryItem) => ({
          board: p.board,
          port: p.port,
          clientCount: p.total,
        }));
        setTargets(calculatedTargets);
      } else {
        throw new Error(data.error || "Error al consultar monitoreo");
      }
    } catch (err) {
      console.warn("[MONITORING_VIEW] error al obtener datos:", err);
      if (!silent) {
        toast.error("No se pudieron cargar los datos de monitoreo de red");
      }
    } finally {
      if (!silent) setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonitoringData();
  }, [fetchMonitoringData]);

  // Manejador central de evento Push de corte recibido
  const handlePushEventReceived = useCallback(
    (alertPayload: {
      board: number;
      port: number;
      affectedCount?: number;
      title?: string;
      body?: string;
      severity?: "critical" | "warning";
    }) => {
      const severity = alertPayload.severity || "critical";
      const affected = alertPayload.affectedCount ?? 1;
      const title =
        alertPayload.title ||
        `🚨 Alerta de Red: Incidencia en Tarjeta ${alertPayload.board} • Puerto ${alertPayload.port}`;
      const body =
        alertPayload.body ||
        `Se han detectado ${affected} clientes con anomalías en Tarjeta ${alertPayload.board} / Puerto PON ${alertPayload.port}.`;

      const newAlert: IncomingPushAlert = {
        id: `push-${Date.now()}`,
        timestamp: new Date().toISOString(),
        board: alertPayload.board,
        port: alertPayload.port,
        affectedCount: affected,
        severity,
        title,
        body,
      };

      setActivePushAlert(newAlert);
      setLastPushReceivedAt(new Date());

      // 1. Sonido de campana
      if (soundEnabled) {
        playIncidentChime();
      }

      // 2. Notificación push del navegador
      triggerBrowserNotification(title, body);

      // 3. Notificación toast visible
      toast.error("Alerta Push de Red", {
        description: `Tarjeta ${alertPayload.board} • Puerto ${alertPayload.port} registra ${affected} cliente(s) desconectado(s)`,
        duration: 10000,
      });

      // 4. Refrescar datos de monitoreo inmediatamente
      void fetchMonitoringData(true);
    },
    [fetchMonitoringData, soundEnabled],
  );

  // Suscripción en Tiempo Real con Supabase Realtime
  useEffect(() => {
    void ensureCrmRealtimeAuth();
    const supabase = getSupabaseClient();
    const channelName = organizationId
      ? `crm-monitoring-${organizationId}`
      : "crm-monitoring-global";

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(channelName)
      // A. Cambios en pon_incident_alerts
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pon_incident_alerts",
        },
        (payload) => {
          const newRow = payload.new as {
            board?: number;
            port?: number;
            affected_count?: number;
            status?: string;
            incident_type?: string;
          } | null;

          if (
            newRow &&
            newRow.status === "active" &&
            newRow.board != null &&
            newRow.port != null
          ) {
            handlePushEventReceived({
              board: Number(newRow.board),
              port: Number(newRow.port),
              affectedCount: Number(newRow.affected_count || 1),
              severity:
                newRow.incident_type === "altered_power"
                  ? "warning"
                  : "critical",
            });
          } else {
            void fetchMonitoringData(true);
          }
        },
      )
      // B. Cambios en client_onus (degradación de señal o caída de ONU)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_onus",
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            void fetchMonitoringData(true);
          }, 1500);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, handlePushEventReceived, fetchMonitoringData]);

  // Focalizar y filtrar por un puerto específico
  const handleFocusPort = (board: number, port: number) => {
    setSelectedBoard(board);
    setSelectedPort(port);
    setSelectedIncidentId(null);
    toast.info(`Focalizado en Tarjeta ${board} • Puerto ${port}`, {
      description:
        "La tabla ha sido filtrada para mostrar los clientes de este puerto.",
    });

    if (clientsSectionRef.current) {
      clientsSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  // Abrir modal de difusión masiva preconfigurada para un puerto
  const handleOpenTargetNotification = (board: number, port: number) => {
    setTargetBoard(board);
    setTargetPort(port);
    setIsNotifyModalOpen(true);
  };

  // Simulación de Push en tiempo real
  const handleSimulatePush = async () => {
    setIsSimulatingPush(true);
    try {
      const fallbackBoard =
        typeof selectedBoard === "number"
          ? selectedBoard
          : incidents[0]?.board ?? 1;
      const fallbackPort =
        typeof selectedPort === "number"
          ? selectedPort
          : incidents[0]?.port ?? 3;

      const res = await fetch("/api/crm/incidents/simulate-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: fallbackBoard,
          port: fallbackPort,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo simular el push");
      }

      handlePushEventReceived({
        board: fallbackBoard,
        port: fallbackPort,
        affectedCount: data.affectedCount || 4,
        title: data.title,
        body: data.body,
        severity: data.severity || "critical",
      });
    } catch (err) {
      toast.error("Error al simular push", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSimulatingPush(false);
    }
  };

  // Despacho de alerta push a gerentes y supervisores
  const handleDispatchManagerAlert = async () => {
    setIsDispatchingAlert(true);
    try {
      const res = await fetch("/api/crm/monitoring/test-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affectedClients,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message ||
            data.error ||
            "No se pudo despachar la alerta a gerentes",
        );
      }

      toast.success(
        affectedClients.length > 0
          ? "Incidencias notificadas a gerentes"
          : "Reporte de red operativa enviado a gerentes",
        {
          description: data.message,
        },
      );

      void fetchMonitoringData(true);
    } catch (err) {
      toast.error("Alerta a gerentes", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDispatchingAlert(false);
    }
  };

  // Diagnóstico en vivo en SmartOLT
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

      void fetchMonitoringData(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al diagnosticar equipo",
      );
    } finally {
      setDiagnosingClientSn(null);
    }
  };

  // Crear ticket técnico para el cliente afectado
  const handleCreateTicketForClient = async (client: AffectedClient) => {
    if (onCreateFieldTicket) {
      try {
        await onCreateFieldTicket({
          title: `Incidencia en Tarjeta ${client.board}/P${client.port}: ${client.name}`,
          description: `Cliente con falla tipo ${client.incidentType}. Señal RX: ${client.rxSignal != null ? `${client.rxSignal} dBm` : "Sin señal"}. ONU: ${client.sn}.`,
          priority: "alta",
          crmClientId: client.clientId,
          clientName: client.name,
          clientPhone: client.phone || undefined,
        });
        toast.success(`Ticket creado para ${client.name}`);
      } catch (err) {
        toast.error("No se pudo crear el ticket", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      toast.info(
        "Abre el módulo de tickets para registrar la orden de servicio.",
      );
    }
  };

  // Copiar número de serie o identificador al portapapeles
  const handleCopyText = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  // Extracción de tarjetas únicas disponibles en la OLT
  const availableBoards = useMemo(() => {
    const boardsSet = new Set<number>();
    for (const p of portsSummary) {
      if (p.board != null && !isNaN(p.board)) boardsSet.add(p.board);
    }
    for (const c of affectedClients) {
      if (c.board != null && !isNaN(c.board)) boardsSet.add(c.board);
    }
    return Array.from(boardsSet).sort((a, b) => a - b);
  }, [portsSummary, affectedClients]);

  // Puertos disponibles según la tarjeta seleccionada
  const availablePortsForSelectedBoard = useMemo(() => {
    return portsSummary.filter((p) => {
      if (selectedBoard === "all") return true;
      return p.board === selectedBoard;
    });
  }, [portsSummary, selectedBoard]);

  // Filtrado de clientes según tarjeta, puerto, búsqueda y tipo de incidencia
  const filteredClients = useMemo(() => {
    return affectedClients.filter((client) => {
      // Filtro si se seleccionó una tarjeta de corte masivo
      if (selectedIncidentId) {
        const activeInc = incidents.find(
          (inc) => inc.id === selectedIncidentId,
        );
        if (
          activeInc &&
          !activeInc.clients.some((item) => item.id === client.id)
        ) {
          return false;
        }
      }
      // Filtro por Tarjeta
      if (selectedBoard !== "all" && client.board !== selectedBoard) {
        return false;
      }
      // Filtro por Puerto
      if (selectedPort !== "all" && client.port !== selectedPort) {
        return false;
      }
      // Filtro por Tipo de Incidencia
      if (statusFilter !== "all" && client.incidentType !== statusFilter) {
        return false;
      }
      // Búsqueda de texto
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = client.name.toLowerCase().includes(query);
        const matchCedula = client.cedula?.toLowerCase().includes(query);
        const matchSn = client.sn.toLowerCase().includes(query);
        const matchZone = client.zone?.toLowerCase().includes(query);
        const matchPort = `p${client.port}`.toLowerCase().includes(query);
        const matchBoard = `t${client.board}`.toLowerCase().includes(query);
        if (
          !matchName &&
          !matchCedula &&
          !matchSn &&
          !matchZone &&
          !matchPort &&
          !matchBoard
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    affectedClients,
    selectedIncidentId,
    incidents,
    selectedBoard,
    selectedPort,
    statusFilter,
    searchQuery,
  ]);

  // Agrupación de clientes por Tarjeta y Puerto PON
  const groupedClients = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        board: number;
        port: number;
        clients: AffectedClient[];
        portInfo?: PortSummaryItem;
        hasMassiveAlert: boolean;
      }
    >();

    for (const client of filteredClients) {
      const key = `${client.board}:${client.port}`;
      if (!groupsMap.has(key)) {
        const portInfo = portsSummary.find(
          (p) => p.board === client.board && p.port === client.port,
        );
        groupsMap.set(key, {
          board: client.board,
          port: client.port,
          clients: [],
          portInfo,
          hasMassiveAlert: false,
        });
      }
      groupsMap.get(key)!.clients.push(client);
    }

    const groups = Array.from(groupsMap.values());
    for (const g of groups) {
      g.hasMassiveAlert = g.clients.length >= 3;
    }

    return groups.sort((a, b) => {
      if (a.hasMassiveAlert && !b.hasMassiveAlert) return -1;
      if (!a.hasMassiveAlert && b.hasMassiveAlert) return 1;
      if (a.board !== b.board) return a.board - b.board;
      return a.port - b.port;
    });
  }, [filteredClients, portsSummary]);

  // Contadores auxiliares
  const losCount = useMemo(
    () => affectedClients.filter((c) => c.incidentType === "LOS").length,
    [affectedClients],
  );
  const alteredPowerCount = useMemo(
    () =>
      affectedClients.filter((c) => c.incidentType === "Potencia alterada")
        .length,
    [affectedClients],
  );
  const powerFailCount = useMemo(
    () =>
      affectedClients.filter((c) => c.incidentType === "Power fail").length,
    [affectedClients],
  );
  const offlineCount = useMemo(
    () => affectedClients.filter((c) => c.incidentType === "Offline").length,
    [affectedClients],
  );
  const affectedBoardsCount = useMemo(() => {
    const set = new Set<number>();
    for (const c of affectedClients) {
      if (c.board != null) set.add(c.board);
    }
    return set.size;
  }, [affectedClients]);

  const onlineHealthRatio =
    metrics.totalOnus > 0
      ? Math.round((metrics.totalOnline / metrics.totalOnus) * 100)
      : 0;

  if (isLoading) {
    return (
      <main className="flex h-full w-full items-center justify-center p-6">
        <LoadingState label="Cargando centro de monitoreo de red..." />
      </main>
    );
  }

  return (
    <div
      role="region"
      aria-label="Panel de Monitoreo de Red e Incidencias"
      className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:p-6 space-y-6">
      {/* =========================================================================
          1. HEADER EJECUTIVO UNIFICADO
          ========================================================================= */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </div>
            <h1
              className={`text-xl font-bold tracking-tight md:text-2xl ${CRM_SURFACES.textPrimary}`}>
              Monitoreo de Red
            </h1>

            {/* Badge de Realtime Activo */}
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1.5 py-0.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              InnoverCorp Push Activo
            </Badge>

            {/* Badge de Puertos en Alerta */}
            {metrics.totalPortsInAlert > 0 ? (
              <Badge
                variant="destructive"
                className="animate-pulse gap-1 font-semibold">
                <AlertCircle className="size-3" />
                {metrics.totalPortsInAlert}{" "}
                {metrics.totalPortsInAlert === 1
                  ? "puerto en alerta crítica"
                  : "puertos en alerta crítica"}
              </Badge>
            ) : null}
          </div>

          <p className={`text-xs md:text-sm ${CRM_SURFACES.textSecondary}`}>
            Detección en tiempo real de caídas masivas, degradación óptica y
            difusión por Tarjeta y Puerto PON.
          </p>
        </div>

        {/* Barra de Acciones Ejecutivas */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle de sonido */}
          <button
            type="button"
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              toast.info(
                !soundEnabled
                  ? "Alertas sonoras activadas"
                  : "Alertas sonoras silenciadas",
              );
            }}
            aria-label={soundEnabled ? "Silenciar audio" : "Activar sonido"}
            title={
              soundEnabled
                ? "Silenciar audio de push"
                : "Activar sonido de push"
            }
            className={`flex size-9 items-center justify-center rounded-2xl border transition ${CRM_FOCUS_RING} ${
              soundEnabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-white/30 bg-white/20 text-slate-500 dark:border-white/10 dark:text-slate-400"
            }`}>
            {soundEnabled ? (
              <Volume2 className="size-4" />
            ) : (
              <VolumeX className="size-4" />
            )}
          </button>

          {/* Permiso de notificaciones push de escritorio */}
          {browserNotificationStatus !== "granted" ? (
            <button
              type="button"
              onClick={handleRequestBrowserNotification}
              className={`flex items-center gap-1.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 ${CRM_FOCUS_RING}`}>
              <Bell className="size-3.5" />
              <span>Activar Notificaciones Web</span>
            </button>
          ) : null}

          {/* Simular Push */}
          <CrmButton
            variant="secondary"
            onClick={handleSimulatePush}
            disabled={isSimulatingPush}
            aria-label="Simular recepción de push"
            title="Simula un evento push en tiempo real para verificar la respuesta técnica"
            className="gap-1.5 text-xs h-9">
            <Zap className={cn("size-3.5", isSimulatingPush && "animate-spin")} />
            <span>{isSimulatingPush ? "Simulando..." : "Simular Push"}</span>
          </CrmButton>

          {/* Notificar a Gerentes */}
          <CrmButton
            variant="secondary"
            onClick={handleDispatchManagerAlert}
            disabled={isDispatchingAlert}
            aria-label="Enviar reporte push a gerentes"
            title="Despacha notificación push a los dispositivos móviles de gerencia"
            className={cn(
              "gap-1.5 text-xs h-9 transition-colors",
              affectedClients.length > 0 &&
                "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300",
            )}>
            <BellRing
              className={cn(
                "size-3.5",
                affectedClients.length > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-500",
                isDispatchingAlert && "animate-bounce",
              )}
            />
            <span>
              {isDispatchingAlert
                ? "Notificando..."
                : affectedClients.length > 0
                  ? `Notificar Gerentes (${affectedClients.length})`
                  : "Notificar a Gerentes"}
            </span>
          </CrmButton>

          {/* Crear Difusión Masiva */}
          <CrmButton
            variant="primary"
            onClick={() => {
              setTargetBoard(targets[0]?.board ?? 1);
              setTargetPort(targets[0]?.port ?? 1);
              setIsNotifyModalOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs h-9">
            <Radio className="size-3.5" />
            <span>Crear difusión masiva</span>
          </CrmButton>

          {/* Refrescar Datos */}
          <CrmButton
            variant="secondary"
            size="icon"
            onClick={() => void fetchMonitoringData(false)}
            disabled={isRefreshing}
            aria-label="Refrescar estado de red"
            title="Consultar datos actualizados de OLT y clientes"
            className="size-9">
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin text-crm-accent")}
            />
          </CrmButton>
        </div>
      </header>

      {/* =========================================================================
          2. BANNER DE ALERTA PUSH EN TIEMPO REAL (SI LLEGA ALERTA)
          ========================================================================= */}
      {activePushAlert ? (
        <section
          aria-label="Alerta Push Entrante"
          className="relative overflow-hidden rounded-3xl border border-rose-500/40 bg-rose-500/10 p-4 backdrop-blur-md shadow-lg transition animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-md animate-bounce">
                <AlertOctagon className="size-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Push Recibido en Vivo
                  </span>
                  <Badge variant="destructive" className="py-0 text-[10px]">
                    Tarjeta {activePushAlert.board} • PON {activePushAlert.port}
                  </Badge>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lastPushReceivedAt
                      ? `Recibido a las ${lastPushReceivedAt.toLocaleTimeString()}`
                      : "En vivo"}
                  </span>
                </div>
                <h2
                  className={`text-sm font-semibold md:text-base ${CRM_SURFACES.textPrimary}`}>
                  {activePushAlert.title}
                </h2>
                <p
                  className={`text-xs md:text-sm ${CRM_SURFACES.textSecondary}`}>
                  {activePushAlert.body}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <CrmButton
                variant="primary"
                onClick={() =>
                  handleFocusPort(activePushAlert.board, activePushAlert.port)
                }
                className="gap-1.5 text-xs h-9">
                <span>
                  Focalizar Tarjeta {activePushAlert.board} / P
                  {activePushAlert.port}
                </span>
                <ArrowRight className="size-3.5" />
              </CrmButton>

              <button
                type="button"
                onClick={() => setActivePushAlert(null)}
                aria-label="Cerrar banner de alerta"
                className="flex size-8 items-center justify-center rounded-xl text-slate-500 hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10">
                <X className="size-4" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* =========================================================================
          3. TARJETAS DE MÉTRICAS KPI DE RED (5 TARJETAS UNIFICADAS)
          ========================================================================= */}
      <section
        aria-label="Métricas clave de red"
        className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. ONUs Registradas */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              ONUs Registradas
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600 dark:bg-white/10 dark:text-slate-300">
              <Server className="size-4" />
            </div>
          </div>
          <p
            className={`text-2xl font-bold tracking-tight md:text-3xl ${CRM_SURFACES.textPrimary}`}>
            {metrics.totalOnus}
          </p>
          <p className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
            En toda la OLT • Monitoreo continuo
          </p>
        </div>

        {/* 2. Clientes Online / Red Operativa */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Red Operativa
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 md:text-3xl">
            {metrics.totalOnline}
          </p>
          <p className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
            {onlineHealthRatio}% online ({metrics.totalOnline} de{" "}
            {metrics.totalOnus} ONUs)
          </p>
        </div>

        {/* 3. Clientes Caídos (LOS) */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Desconectados (LOS)
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <WifiOff className="size-4" />
            </div>
          </div>
          <p
            className={cn(
              "text-2xl font-bold tracking-tight md:text-3xl",
              metrics.totalLos > 0
                ? "text-rose-600 dark:text-rose-400"
                : CRM_SURFACES.textPrimary,
            )}>
            {metrics.totalLos}
          </p>
          <p className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
            Sin enlace óptico con la OLT
          </p>
        </div>

        {/* 4. Potencia Alterada / Energía */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Potencia Alterada
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <Signal className="size-4" />
            </div>
          </div>
          <p
            className={cn(
              "text-2xl font-bold tracking-tight md:text-3xl",
              metrics.totalAlteredPower > 0
                ? "text-amber-600 dark:text-amber-400"
                : CRM_SURFACES.textPrimary,
            )}>
            {metrics.totalAlteredPower}
          </p>
          <p className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
            {metrics.totalAlteredPower} señal &le; -29 dBm •{" "}
            {metrics.totalPowerFail} corte energía
          </p>
        </div>

        {/* 5. Puertos en Alerta */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Puertos en Alerta
            </span>
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-xl",
                metrics.totalPortsInAlert > 0
                  ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
                  : "bg-slate-500/10 text-slate-500 dark:bg-white/10 dark:text-slate-400",
              )}>
              <AlertTriangle className="size-4" />
            </div>
          </div>
          <p
            className={cn(
              "text-2xl font-bold tracking-tight md:text-3xl",
              metrics.totalPortsInAlert > 0
                ? "text-rose-600 dark:text-rose-400"
                : CRM_SURFACES.textPrimary,
            )}>
            {metrics.totalPortsInAlert}
          </p>
          <p className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
            {affectedBoardsCount} de {availableBoards.length} tarjetas con
            incidencias
          </p>
        </div>
      </section>

      {/* =========================================================================
          4. INCIDENCIAS DETECTADAS POR PUERTO PON (ALERTAS MASIVAS)
          ========================================================================= */}
      <section
        aria-label="Incidencias masivas detectadas por puerto PON"
        className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 md:p-5 space-y-3.5 shadow-xs`}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2
                className={`text-sm font-bold uppercase tracking-wider md:text-base ${CRM_SURFACES.textPrimary}`}>
                Incidencias Detectadas por Puerto PON
              </h2>
              {incidents.length > 0 ? (
                <Badge variant="destructive" className="py-0 text-[10px]">
                  {incidents.length} anomalía(s) activa(s)
                </Badge>
              ) : null}
            </div>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Anomalías agrupadas por puerto donde existen múltiples clientes
              afectados simultáneamente.
            </p>
          </div>
        </div>

        {incidents.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
            <div className="text-xs">
              <span className="font-semibold">
                No hay caídas masivas ni anomalías críticas en puertos.
              </span>{" "}
              Todos los puertos PON están funcionando dentro de los parámetros
              esperados de estabilidad y potencia óptica.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {incidents.map((inc) => {
              const isSelected = selectedIncidentId === inc.id;
              return (
                <div
                  key={inc.id}
                  className={cn(
                    "rounded-2xl border p-3.5 space-y-2.5 transition",
                    isSelected
                      ? "border-rose-500 bg-rose-500/10 shadow-md"
                      : "border-white/30 bg-white/30 hover:border-white/50 dark:border-white/10 dark:bg-white/[.04]",
                  )}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                        Tarjeta {inc.board} • Puerto {inc.port}
                      </span>
                      <Badge
                        variant="destructive"
                        className="py-0 text-[10px]">
                        {inc.affectedCount} en alerta
                      </Badge>
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
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <Bell className="size-3" />
                        <span>Notificación en curso</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {inc.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/30">
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedIncidentId(null);
                        } else {
                          setSelectedIncidentId(inc.id);
                          setSelectedBoard(inc.board);
                          setSelectedPort(inc.port);
                          if (clientsSectionRef.current) {
                            clientsSectionRef.current.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }
                        }
                      }}
                      className="text-xs font-semibold text-crm-accent hover:underline">
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
      </section>

      {/* =========================================================================
          5. SEGMENTACIÓN INTERACTIVA POR TARJETA Y PUERTO PON
          ========================================================================= */}
      <section
        aria-label="Segmentación física de red"
        className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 md:p-5 space-y-4 shadow-xs`}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-crm-accent" />
              <h2
                className={`text-sm font-bold uppercase tracking-wider md:text-base ${CRM_SURFACES.textPrimary}`}>
                Segmentación por Tarjeta y Puerto PON
              </h2>
            </div>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Filtra el diagnóstico por chasis físico y puertos específicos.
            </p>
          </div>

          {(selectedBoard !== "all" ||
            selectedPort !== "all" ||
            selectedIncidentId !== null) && (
            <button
              type="button"
              onClick={() => {
                setSelectedBoard("all");
                setSelectedPort("all");
                setSelectedIncidentId(null);
              }}
              className="text-xs font-medium text-crm-accent hover:underline self-start sm:self-auto">
              Restablecer filtros de puerto
            </button>
          )}
        </div>

        {/* 1. Selector de Tarjeta (Board) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            1. Seleccionar Tarjeta (Board)
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedBoard("all");
                setSelectedPort("all");
                setSelectedIncidentId(null);
              }}
              className={`rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                selectedBoard === "all"
                  ? "border-rose-500/50 bg-rose-500 text-white shadow-sm"
                  : "border-white/40 bg-white/30 text-slate-700 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}>
              Todas las tarjetas ({affectedClients.length} caídos)
            </button>

            {availableBoards.map((boardNum) => {
              const affectedInBoard = affectedClients.filter(
                (c) => c.board === boardNum,
              ).length;
              const isSelected = selectedBoard === boardNum;

              return (
                <button
                  key={boardNum}
                  type="button"
                  onClick={() => {
                    setSelectedBoard(isSelected ? "all" : boardNum);
                    setSelectedPort("all");
                    setSelectedIncidentId(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                    isSelected
                      ? "border-crm-accent bg-crm-accent text-crm-accent-foreground shadow-sm"
                      : affectedInBoard > 0
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                        : "border-white/40 bg-white/30 text-slate-700 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}>
                  <span>Tarjeta {boardNum}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : affectedInBoard > 0
                          ? "bg-rose-500 text-white"
                          : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                    }`}>
                    {affectedInBoard}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Selector de Puerto PON */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            2. Seleccionar Puerto PON{" "}
            {selectedBoard !== "all" ? `(Tarjeta ${selectedBoard})` : "(Global)"}
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedPort("all");
                setSelectedIncidentId(null);
              }}
              className={`rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                selectedPort === "all"
                  ? "border-slate-800 bg-slate-800 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-white/40 bg-white/30 text-slate-700 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}>
              Todos los puertos
            </button>

            {availablePortsForSelectedBoard.map((p) => {
              const isSelected = selectedPort === p.port;
              const hasAlert = p.affected > 0;

              return (
                <button
                  key={`${p.board}-${p.port}`}
                  type="button"
                  onClick={() => {
                    setSelectedPort(isSelected ? "all" : p.port);
                    if (selectedBoard === "all") setSelectedBoard(p.board);
                    setSelectedIncidentId(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                    isSelected
                      ? "border-crm-accent bg-crm-accent text-crm-accent-foreground shadow-sm"
                      : hasAlert
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
                        : "border-white/40 bg-white/30 text-slate-700 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}>
                  <span className="font-mono">
                    T{p.board}/P{p.port}
                  </span>
                  {hasAlert ? (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                      {p.affected}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. BARRA DE BÚSQUEDA Y FILTROS RÁPIDOS DE CLIENTES
          ========================================================================= */}
      <div
        ref={clientsSectionRef}
        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Buscador interactivo */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, cédula, SN de ONU o zona..."
            aria-label="Buscar clientes desconectados"
            className={`w-full rounded-2xl border ${CRM_SURFACES.border} bg-white/50 py-2 pl-10 pr-9 text-xs md:text-sm text-slate-900 placeholder:text-slate-400 transition dark:bg-white/[.06] dark:text-slate-100 ${CRM_FOCUS_RING}`}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Borrar texto de búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Filtros de estado y switch de vista */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por tipo de falla */}
          <div className="flex items-center rounded-2xl border border-white/40 bg-white/30 p-1 dark:border-white/10 dark:bg-white/5">
            {[
              { id: "all", label: `Todos (${affectedClients.length})` },
              { id: "LOS", label: `LOS (${losCount})` },
              { id: "Potencia alterada", label: `Potencia (${alteredPowerCount})` },
              { id: "Power fail", label: `Energía (${powerFailCount})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setStatusFilter(
                    f.id as
                      | "all"
                      | "LOS"
                      | "Potencia alterada"
                      | "Power fail"
                      | "Offline",
                  );
                  setSelectedIncidentId(null);
                }}
                className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                  statusFilter === f.id && !selectedIncidentId
                    ? "bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Toggle modo agrupado / tabla continua */}
          <div className="flex items-center rounded-2xl border border-white/40 bg-white/30 p-1 dark:border-white/10 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setViewMode("grouped")}
              aria-label="Vista agrupada por tarjeta y puerto"
              title="Agrupar por Tarjeta y Puerto PON"
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "grouped"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}>
              <Layers className="size-3.5" />
              <span className="hidden sm:inline">Por Tarjeta/Puerto</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-label="Vista de tabla plana continua"
              title="Tabla plana continua"
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "table"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}>
              <Filter className="size-3.5" />
              <span className="hidden sm:inline">Tabla Plana</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          7. LISTADO DE CLIENTES AFECTADOS: VISTA AGRUPADA (POR TARJETA/PUERTO)
          ========================================================================= */}
      {viewMode === "grouped" ? (
        <div className="space-y-4">
          {groupedClients.length === 0 ? (
            <div
              className={`${CRM_PANEL} flex flex-col items-center justify-center p-10 text-center space-y-3`}>
              <div className="flex size-12 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
                <CheckCircle2 className="size-6" />
              </div>
              <h3
                className={`text-sm font-semibold md:text-base ${CRM_SURFACES.textPrimary}`}>
                No se registran clientes afectados con los filtros actuales
              </h3>
              <p
                className={`max-w-md text-xs text-slate-500 dark:text-slate-400`}>
                {searchQuery ||
                selectedBoard !== "all" ||
                selectedPort !== "all" ||
                statusFilter !== "all"
                  ? "Prueba a cambiar o borrar los filtros de búsqueda para ver más clientes."
                  : "La red de fibra óptica opera con estabilidad y sin anomalías registradas."}
              </p>
            </div>
          ) : (
            groupedClients.map((group) => {
              const onlineCount = group.portInfo?.online ?? 0;
              const totalCount =
                group.portInfo?.total ?? group.clients.length;
              const healthRatio =
                group.portInfo?.healthRatio ??
                (totalCount > 0
                  ? Math.round((onlineCount / totalCount) * 100)
                  : 0);

              return (
                <div
                  key={`${group.board}:${group.port}`}
                  className={`${CRM_PANEL} border ${CRM_SURFACES.border} overflow-hidden shadow-xs transition hover:border-white/50 dark:hover:border-white/20`}>
                  {/* Encabezado del Grupo de Puerto PON */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/20 bg-black/[.02] p-3.5 dark:border-white/10 dark:bg-white/[.02]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                        Tarjeta {group.board} • Puerto PON {group.port}
                      </span>
                      <Badge
                        variant="destructive"
                        className="py-0 text-[10px]">
                        {group.clients.length}{" "}
                        {group.clients.length === 1
                          ? "cliente afectado"
                          : "clientes afectados"}
                      </Badge>

                      {/* Rango de Salud del Puerto */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>Salud del puerto:</span>
                        <span
                          className={cn(
                            "font-mono font-bold",
                            healthRatio >= 80
                              ? "text-emerald-600 dark:text-emerald-400"
                              : healthRatio >= 50
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-rose-600 dark:text-rose-400",
                          )}>
                          {healthRatio}% ({onlineCount}/{totalCount} online)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
                        Total ONUs en puerto: {totalCount}
                      </span>

                      {/* Botón de difusión masiva directa a este puerto */}
                      <CrmButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs flex items-center gap-1"
                        onClick={() =>
                          handleOpenTargetNotification(group.board, group.port)
                        }>
                        <Send className="size-3" />
                        <span>Difusión al puerto</span>
                      </CrmButton>
                    </div>
                  </div>

                  {/* Tabla de Clientes del Puerto */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs md:text-sm">
                      <thead
                        className={`border-b border-white/20 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-400 bg-black/[.01] dark:bg-white/[.01]`}>
                        <tr>
                          <th scope="col" className="px-4 py-2.5">
                            Cliente
                          </th>
                          <th scope="col" className="px-4 py-2.5">
                            Zona / Sector
                          </th>
                          <th scope="col" className="px-4 py-2.5">
                            ONU (SN)
                          </th>
                          <th scope="col" className="px-4 py-2.5">
                            Falla / Estado
                          </th>
                          <th scope="col" className="px-4 py-2.5">
                            Señal Óptica (RX)
                          </th>
                          <th scope="col" className="px-4 py-2.5">
                            Tiempo Desconectado
                          </th>
                          <th scope="col" className="px-4 py-2.5 text-right">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/15 dark:divide-white/5">
                        {group.clients.map((client) => {
                          const signalQuality = getSignalQuality(client.rxSignal);
                          const isDiagnosing = diagnosingClientSn === client.sn;

                          return (
                            <tr
                              key={client.id}
                              className="transition hover:bg-white/40 dark:hover:bg-white/[.04]">
                              {/* Cliente */}
                              <td className="px-4 py-3 font-medium">
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                                    {client.name}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                    {client.cedula ? (
                                      <span>CI: {client.cedula}</span>
                                    ) : null}
                                    {client.phone ? (
                                      <span>Tel: {client.phone}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>

                              {/* Zona */}
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {client.zone || "Zona no asignada"}
                              </td>

                              {/* SN de ONU */}
                              <td className="px-4 py-3 font-mono text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {client.sn}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyText(
                                        client.sn,
                                        "Número de serie",
                                      )
                                    }
                                    aria-label="Copiar SN"
                                    title="Copiar número de serie"
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                    <Copy className="size-3" />
                                  </button>
                                </div>
                              </td>

                              {/* Falla / Estado */}
                              <td className="px-4 py-3">
                                {client.incidentType === "LOS" ? (
                                  <Badge
                                    variant="destructive"
                                    className="gap-1 font-medium">
                                    <ZapOff className="size-3" />
                                    <span>% Alarma LOS</span>
                                  </Badge>
                                ) : client.incidentType ===
                                  "Potencia alterada" ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 gap-1 font-medium">
                                    <AlertCircle className="size-3" />
                                    <span>Atenuación Alta</span>
                                  </Badge>
                                ) : client.incidentType === "Power fail" ? (
                                  <Badge
                                    variant="outline"
                                    className="border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300 gap-1 font-medium">
                                    <Power className="size-3" />
                                    <span>Sin Energía</span>
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300 gap-1">
                                    <WifiOff className="size-3" />
                                    <span>Offline</span>
                                  </Badge>
                                )}
                              </td>

                              {/* Señal Óptica (RX) */}
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 font-mono text-xs">
                                    <Signal
                                      className={`size-3.5 ${signalQuality.colorClass}`}
                                    />
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                      {client.rxSignal != null
                                        ? `${client.rxSignal.toFixed(2)} dBm`
                                        : "N/D"}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                                    <div
                                      className={`h-full ${
                                        client.rxSignal == null
                                          ? "bg-rose-500"
                                          : client.rxSignal >= -25
                                            ? "bg-emerald-500"
                                            : client.rxSignal >= -28
                                              ? "bg-amber-500"
                                              : "bg-rose-500"
                                      }`}
                                      style={{
                                        width: `${
                                          client.rxSignal == null
                                            ? 0
                                            : Math.min(
                                                100,
                                                Math.max(
                                                  10,
                                                  ((client.rxSignal + 35) /
                                                    20) *
                                                    100,
                                                ),
                                              )
                                        }%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Tiempo Desconectado */}
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                <div className="flex items-center gap-1">
                                  <Clock className="size-3.5 text-slate-400" />
                                  <span>
                                    {client.durationText ||
                                      (client as { durationAgo?: string })
                                        .durationAgo ||
                                      "Reciente"}
                                  </span>
                                </div>
                              </td>

                              {/* Acciones por Fila */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Diagnóstico en vivo */}
                                  <button
                                    type="button"
                                    onClick={() => handleDiagnoseClient(client)}
                                    disabled={isDiagnosing}
                                    aria-label={`Diagnosticar en vivo a ${client.name}`}
                                    title="Diagnóstico OLT en tiempo real"
                                    className={`flex size-8 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
                                    <RefreshCw
                                      className={cn(
                                        "size-3.5",
                                        isDiagnosing &&
                                          "animate-spin text-rose-500",
                                      )}
                                    />
                                  </button>

                                  {/* Crear Ticket */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCreateTicketForClient(client)
                                    }
                                    aria-label={`Crear ticket para ${client.name}`}
                                    title="Crear ticket de soporte de campo"
                                    className={`flex size-8 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
                                    <Ticket className="size-3.5 text-amber-600 dark:text-amber-400" />
                                  </button>

                                  {/* Abrir Chat CRM */}
                                  {onOpenClientChat ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenClientChat(client.clientId)
                                      }
                                      aria-label={`Abrir chat con ${client.name}`}
                                      title="Abrir conversación en CRM"
                                      className={`flex size-8 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
                                      <MessageSquare className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* =========================================================================
            8. LISTADO DE CLIENTES AFECTADOS: VISTA DE TABLA PLANA CONTINUA
            ========================================================================= */
        <div
          className={`${CRM_TABLE} overflow-hidden border ${CRM_SURFACES.border}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead
                className={`border-b border-white/30 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-400 bg-black/[.02] dark:bg-white/[.02]`}>
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Ubicación / Zona
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Board & Port
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Serial (SN)
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado OLT
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Potencia RX
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tiempo en Falla
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/15 dark:divide-white/5">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      No se encontraron clientes con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => {
                    const signalQuality = getSignalQuality(client.rxSignal);
                    const isDiagnosing = diagnosingClientSn === client.sn;

                    return (
                      <tr
                        key={client.id}
                        className="transition hover:bg-white/40 dark:hover:bg-white/[.04]">
                        {/* Cliente */}
                        <td className="px-4 py-3 font-medium">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {client.name}
                            </span>
                            <div className="text-[11px] text-slate-500">
                              {client.cedula || client.phone || "Sin contacto"}
                            </div>
                          </div>
                        </td>

                        {/* Ubicación / Zona */}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {client.zone || "No asignada"}
                        </td>

                        {/* Board & Port */}
                        <td className="px-4 py-3 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              handleFocusPort(client.board, client.port)
                            }
                            className="font-semibold text-crm-accent hover:underline">
                            Tarjeta {client.board} / Port {client.port}
                          </button>
                        </td>

                        {/* Serial (SN) */}
                        <td className="px-4 py-3 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{client.sn}</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyText(client.sn, "Número de serie")
                              }
                              aria-label="Copiar SN"
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                              <Copy className="size-3" />
                            </button>
                          </div>
                        </td>

                        {/* Estado OLT */}
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              client.incidentType === "LOS"
                                ? "destructive"
                                : "outline"
                            }
                            className={cn(
                              "text-[10px] font-medium",
                              client.incidentType === "Potencia alterada" &&
                                "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                            )}>
                            {client.incidentType === "LOS"
                              ? "• LOS"
                              : client.incidentType}
                          </Badge>
                        </td>

                        {/* Potencia RX */}
                        <td className="px-4 py-3 font-mono text-xs">
                          <span className={signalQuality.colorClass}>
                            {client.rxSignal != null
                              ? `${client.rxSignal.toFixed(2)} dBm`
                              : "Sin señal"}
                          </span>
                        </td>

                        {/* Tiempo en Falla */}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1 text-xs">
                            <Clock className="size-3 text-slate-400" />
                            <span>
                              {client.durationText ||
                                (client as { durationAgo?: string })
                                  .durationAgo ||
                                "Reciente"}
                            </span>
                          </div>
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <CrmButton
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 text-xs px-2"
                              disabled={isDiagnosing}
                              onClick={() => void handleDiagnoseClient(client)}
                              title="Consultar estado en vivo directo a Smart OLT">
                              <RefreshCw
                                className={cn(
                                  "size-3 mr-1 text-emerald-500",
                                  isDiagnosing && "animate-spin",
                                )}
                              />
                              <span>
                                {isDiagnosing ? "Leyendo..." : "Diagnóstico"}
                              </span>
                            </CrmButton>

                            {onOpenClientChat ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenClientChat(client.clientId)
                                }
                                aria-label={`Abrir chat con ${client.name}`}
                                title="Abrir chat en CRM"
                                className={`flex size-7 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
                                <MessageSquare className="size-3 text-emerald-600 dark:text-emerald-400" />
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => handleCreateTicketForClient(client)}
                              aria-label={`Crear ticket para ${client.name}`}
                              title="Crear ticket de campo"
                              className={`flex size-7 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
                              <Ticket className="size-3 text-amber-600 dark:text-amber-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          9. TABLA DE PUERTOS SMART OLT Y RANGO DE SALUD (PANEL COMPLETO)
          ========================================================================= */}
      <section
        ref={portsSectionRef}
        aria-label="Puertos Smart OLT y rango de salud"
        className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} overflow-hidden shadow-xs`}>
        <div className="p-4 border-b border-border/40 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2
                className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
                Puertos Smart OLT y Rango de Salud
              </h2>
              <Badge variant="outline" className="text-[11px] py-0">
                {portsSummary.length} puertos
              </Badge>
            </div>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Estado general por tarjeta y puerto PON con acceso directo a
              difusión push masiva.
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
                  <th scope="col" className="px-4 py-3">
                    Board (Tarjeta)
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Puerto PON
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Clientes Vinculados
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Online
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Con Incidencia
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Salud del Puerto
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 text-xs md:text-sm">
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
                        <div className="h-1.5 w-24 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
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
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleFocusPort(tgt.board, tgt.port)}
                          className={`text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2 py-1 rounded-xl transition ${CRM_FOCUS_RING}`}>
                          Ver clientes
                        </button>
                        <CrmButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs flex items-center gap-1"
                          onClick={() =>
                            handleOpenTargetNotification(tgt.board, tgt.port)
                          }>
                          <Send className="size-3" />
                          <span>Difusión</span>
                        </CrmButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =========================================================================
          10. MODAL DE DIFUSIÓN MASIVA PRE-CONFIGURADA (WHATSAPP / SMS / PUSH)
          ========================================================================= */}
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
