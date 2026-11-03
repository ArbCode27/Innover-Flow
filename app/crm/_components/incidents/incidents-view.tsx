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
  ExternalLink,
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
  Wifi,
  WifiOff,
  X,
  ZapOff,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import {
  CRM_FOCUS_RING,
  CRM_PANEL,
  CRM_RADIUS,
  CRM_SURFACES,
  CRM_TABLE,
} from "../../_lib/crm-theme";
import { getSignalQuality } from "@/components/OnuStatusCard";
import {
  ensureCrmRealtimeAuth,
  getSupabaseClient,
} from "@/app/crm/_lib/supabase";
import type {
  AffectedClient,
  MonitoringIncident,
  MonitoringSummaryMetrics,
} from "@/types/smartolt";
import { cn } from "@/lib/utils";

interface IncidentsViewProps {
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

interface PortSummaryItem {
  board: number;
  port: number;
  total: number;
  online: number;
  affected: number;
  healthRatio: number;
  managerAlertSent?: boolean;
  managerAlertSentAt?: string | null;
}

/**
 * Generador sintético de sonido de alerta gerencial mediante Web Audio API.
 * Emite dos tonos suaves pero contrastantes que capturan la atención sin ser molestos.
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
 * Disparador de Notificación Nativa del Sistema Operativo si el navegador tiene permiso
 */
const triggerBrowserNotification = (title: string, body: string) => {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "innovercorp-incident-alert",
      });
    } catch (e) {
      console.debug("[NOTIFICATION_API] error:", e);
    }
  }
};

export const IncidentsView = ({
  organizationId,
  onOpenTicketChat,
  onOpenClientChat,
  onCreateFieldTicket,
}: IncidentsViewProps) => {
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
    "default" | "granted" | "denied"
  >("default");

  // Filtros interactivos por Tarjeta (Board) y Puerto (Port)
  const [selectedBoard, setSelectedBoard] = useState<number | "all">("all");
  const [selectedPort, setSelectedPort] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "LOS" | "Potencia alterada" | "Power fail" | "Offline"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "table">("grouped");

  // Diagnóstico en vivo por fila
  const [diagnosingClientSn, setDiagnosingClientSn] = useState<string | null>(
    null,
  );
  const [isSimulatingPush, setIsSimulatingPush] = useState(false);
  const [isDispatchingAlert, setIsDispatchingAlert] = useState(false);

  // Referencia al contenedor de la tabla para scroll suave al focalizar
  const tableSectionRef = useRef<HTMLDivElement | null>(null);

  // Verificar estado de permisos de notificación al montar
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserNotificationStatus(Notification.permission);
    }
  }, []);

  const handleRequestBrowserNotification = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.info("Las notificaciones de escritorio no están soportadas en este navegador");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setBrowserNotificationStatus(permission);
      if (permission === "granted") {
        toast.success("Notificaciones de escritorio habilitadas para incidencias de InnoverCorp");
      } else {
        toast.warning("Notificaciones bloqueadas por el usuario o navegador");
      }
    } catch (err) {
      console.warn("[NOTIFICATION_PERMISSION] error:", err);
    }
  };

  // Carga de datos de monitoreo e incidencias
  const fetchIncidentsData = useCallback(async (silent = false) => {
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
      } else {
        throw new Error(data.error || "Error al consultar incidencias");
      }
    } catch (err) {
      console.warn("[INCIDENTS_VIEW] error al obtener datos:", err);
      if (!silent) {
        toast.error("No se pudieron cargar los datos de incidencias de red");
      }
    } finally {
      if (!silent) setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchIncidentsData();
  }, [fetchIncidentsData]);

  // Manejador central de evento Push de InnoverCorp recibido
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
      const affected = alertPayload.affectedCount ?? 3;
      const title =
        alertPayload.title ||
        `🚨 Alerta InnoverCorp: Incidencia en Tarjeta ${alertPayload.board} • Puerto ${alertPayload.port}`;
      const body =
        alertPayload.body ||
        `Se han detectado ${affected} clientes desconectados en Tarjeta ${alertPayload.board} / Puerto PON ${alertPayload.port}.`;

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
      toast.error("Alerta Push de InnoverCorp", {
        description: `Tarjeta ${alertPayload.board} • Puerto ${alertPayload.port} registra ${affected} cliente(s) desconectado(s)`,
        duration: 10000,
      });

      // 4. Refrescar datos de incidencias inmediatamente
      void fetchIncidentsData(true);
    },
    [fetchIncidentsData, soundEnabled],
  );

  // Suscripción en Tiempo Real con Supabase Realtime (escuchando alertas push e incidencias de InnoverCorp)
  useEffect(() => {
    void ensureCrmRealtimeAuth();
    const supabase = getSupabaseClient();
    const channelName = organizationId
      ? `crm-incidents-${organizationId}`
      : "crm-incidents-global";

    const channel = supabase
      .channel(channelName)
      // A. Cambios en la tabla pon_incident_alerts
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

          if (newRow && newRow.status === "active" && newRow.board != null && newRow.port != null) {
            handlePushEventReceived({
              board: Number(newRow.board),
              port: Number(newRow.port),
              affectedCount: Number(newRow.affected_count || 1),
              severity: newRow.incident_type === "altered_power" ? "warning" : "critical",
            });
          } else {
            void fetchIncidentsData(true);
          }
        },
      )
      // B. Cambios en client_onus (clientes que caen en LOS u offline)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_onus",
        },
        () => {
          void fetchIncidentsData(true);
        },
      )
      // C. Canal de difusión directo 'incident_push' de InnoverCorp
      .on("broadcast", { event: "incident_push" }, (event) => {
        const payload = event.payload as {
          board?: number;
          port?: number;
          affectedCount?: number;
          title?: string;
          body?: string;
          severity?: "critical" | "warning";
        };
        if (payload?.board != null && payload?.port != null) {
          handlePushEventReceived({
            board: Number(payload.board),
            port: Number(payload.port),
            affectedCount: payload.affectedCount,
            title: payload.title,
            body: payload.body,
            severity: payload.severity,
          });
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchIncidentsData, handlePushEventReceived]);

  // Acción para focalizar la Tarjeta y Puerto de la alerta recibida
  const handleFocusAlertPort = (board: number, port: number) => {
    setSelectedBoard(board);
    setSelectedPort(port);
    toast.info(`Focalizado en Tarjeta ${board} • Puerto ${port}`, {
      description: "La tabla ha sido filtrada para mostrar únicamente los clientes de este puerto.",
    });

    if (tableSectionRef.current) {
      tableSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Simulación de Push de InnoverCorp (ideal para demostración y validación en vivo del gerente)
  const handleSimulateInnoverPush = async () => {
    setIsSimulatingPush(true);
    try {
      // Tomar primer puerto afectado si existe, o usar Tarjeta 1 / Puerto 3 por defecto
      const targetBoard =
        typeof selectedBoard === "number"
          ? selectedBoard
          : incidents[0]?.board ?? 1;
      const targetPort =
        typeof selectedPort === "number"
          ? selectedPort
          : incidents[0]?.port ?? 3;

      const res = await fetch("/api/crm/incidents/simulate-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: targetBoard,
          port: targetPort,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo simular el push");
      }

      handlePushEventReceived({
        board: targetBoard,
        port: targetPort,
        affectedCount: data.affectedCount || 4,
        title: data.title,
        body: data.body,
        severity: data.severity || "critical",
      });
    } catch (err) {
      toast.error("Error al simular push de InnoverCorp", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSimulatingPush(false);
    }
  };

  // Despacho de alerta push a los dispositivos móviles de los gerentes
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
          data.message || data.error || "No se pudo enviar la alerta push",
        );
      }

      toast.success("Alerta push despachada a gerentes y supervisores", {
        description: data.message,
      });

      void fetchIncidentsData(true);
    } catch (err) {
      toast.error("Alerta a gerentes", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDispatchingAlert(false);
    }
  };

  // Diagnóstico en vivo en SmartOLT para un cliente específico
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

      void fetchIncidentsData(true);
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
          description: `Cliente desconectado por falla tipo ${client.incidentType}. Señal RX: ${client.rxSignal != null ? `${client.rxSignal} dBm` : "Sin señal"}. ONU: ${client.sn}.`,
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
      toast.info("Abre el módulo de tickets para registrar la orden de servicio.");
    }
  };

  // Copiar SN o identificador al portapapeles
  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  // Extracción de tarjetas únicas disponibles en la red
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

  // Puertos disponibles para la tarjeta seleccionada
  const availablePortsForSelectedBoard = useMemo(() => {
    return portsSummary.filter((p) => {
      if (selectedBoard === "all") return true;
      return p.board === selectedBoard;
    });
  }, [portsSummary, selectedBoard]);

  // Filtrado de clientes según tarjeta, puerto, búsqueda y tipo de incidencia
  const filteredClients = useMemo(() => {
    return affectedClients.filter((client) => {
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
  }, [affectedClients, selectedBoard, selectedPort, statusFilter, searchQuery]);

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

    // Calcular estado de alerta masiva (3 o más clientes)
    const groups = Array.from(groupsMap.values());
    for (const g of groups) {
      g.hasMassiveAlert = g.clients.length >= 3;
    }

    // Ordenar grupos: puertos con alerta masiva primero, luego por tarjeta y puerto
    return groups.sort((a, b) => {
      if (a.hasMassiveAlert && !b.hasMassiveAlert) return -1;
      if (!a.hasMassiveAlert && b.hasMassiveAlert) return 1;
      if (a.board !== b.board) return a.board - b.board;
      return a.port - b.port;
    });
  }, [filteredClients, portsSummary]);

  if (isLoading) {
    return (
      <main className="flex h-full w-full items-center justify-center p-6">
        <LoadingState label="Cargando incidencias de red para gerencia..." />
      </main>
    );
  }

  return (
    <div
      role="region"
      aria-label="Panel de Incidencias de Red - Gerencia"
      className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:p-6 space-y-6">
      {/* =========================================================================
          1. HEADER EJECUTIVO GERENCIAL
          ========================================================================= */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </div>
            <h1
              className={`text-xl font-bold tracking-tight md:text-2xl ${CRM_SURFACES.textPrimary}`}>
              Incidencias de Red
            </h1>
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1.5 py-0.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              InnoverCorp Push Activo
            </Badge>

            {metrics.totalPortsInAlert > 0 ? (
              <Badge
                variant="destructive"
                className="animate-pulse gap-1 font-semibold">
                <AlertCircle className="size-3" />
                {metrics.totalPortsInAlert} puerto(s) en alerta crítica
              </Badge>
            ) : null}
          </div>
          <p className={`text-xs md:text-sm ${CRM_SURFACES.textSecondary}`}>
            Detección en tiempo real de cortes masivos y degradación óptica agrupados por Tarjeta y Puerto PON.
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
            title={soundEnabled ? "Silenciar audio de push" : "Activar sonido de push"}
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

          {/* Simular Push de InnoverCorp */}
          <CrmButton
            variant="secondary"
            onClick={handleSimulateInnoverPush}
            disabled={isSimulatingPush}
            aria-label="Simular recepción de push de InnoverCorp"
            title="Simula un evento push en tiempo real para probar la experiencia gerencial"
            className="gap-1.5 text-xs h-9">
            <Radio
              className={cn("size-3.5", isSimulatingPush && "animate-spin text-rose-500")}
            />
            <span>{isSimulatingPush ? "Simulando..." : "Simular Push"}</span>
          </CrmButton>

          {/* Enviar alerta push a gerentes/supervisores */}
          <CrmButton
            variant="danger"
            onClick={handleDispatchManagerAlert}
            disabled={isDispatchingAlert || affectedClients.length === 0}
            aria-label="Notificar a dispositivos de gerentes"
            className="gap-1.5 text-xs h-9 font-medium">
            <BellRing
              className={cn("size-3.5", isDispatchingAlert && "animate-spin")}
            />
            <span>
              {isDispatchingAlert
                ? "Notificando..."
                : `Notificar Gerentes (${affectedClients.length})`}
            </span>
          </CrmButton>

          {/* Botón de Refresco Manual */}
          <button
            type="button"
            onClick={() => void fetchIncidentsData(true)}
            disabled={isRefreshing}
            aria-label="Refrescar datos de incidencias"
            title="Actualizar estado de red"
            className={`flex size-9 items-center justify-center rounded-2xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white/70 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin text-rose-500")}
            />
          </button>
        </div>
      </header>

      {/* =========================================================================
          2. BANNER DE ALERTA PUSH EN VIVO DE INNOVERCORP
          ========================================================================= */}
      {activePushAlert ? (
        <section
          aria-live="polite"
          aria-label="Alerta de incidencia recibida en tiempo real"
          className="relative overflow-hidden rounded-3xl border border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-red-500/10 to-amber-500/10 p-4 shadow-lg backdrop-blur-md dark:border-rose-500/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-md animate-bounce">
                <AlertOctagon className="size-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Push Recibido desde InnoverCorp
                  </span>
                  <Badge variant="destructive" className="py-0 text-[10px]">
                    Tarjeta {activePushAlert.board} • PON {activePushAlert.port}
                  </Badge>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lastPushReceivedAt ? `Recibido a las ${lastPushReceivedAt.toLocaleTimeString()}` : "En vivo"}
                  </span>
                </div>
                <h3 className={`text-sm font-semibold md:text-base ${CRM_SURFACES.textPrimary}`}>
                  {activePushAlert.title}
                </h3>
                <p className={`text-xs md:text-sm ${CRM_SURFACES.textSecondary}`}>
                  {activePushAlert.body}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <CrmButton
                variant="primary"
                onClick={() => handleFocusAlertPort(activePushAlert.board, activePushAlert.port)}
                className="gap-1.5 text-xs h-9">
                <span>Focalizar Tarjeta {activePushAlert.board} / P{activePushAlert.port}</span>
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
          3. TARJETAS DE MÉTRICAS KPI PARA GERENCIA
          ========================================================================= */}
      <section
        aria-label="Métricas clave de red"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
        {/* Clientes Desconectados */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${CRM_SURFACES.textMuted}`}>
              Clientes Caídos
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <WifiOff className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {affectedClients.length}
            </span>
            <span className={`text-xs ${CRM_SURFACES.textSecondary}`}>
              de {metrics.totalOnus} ONUs
            </span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1 text-[11px]">
            <span className="text-rose-500 font-medium">{metrics.totalLos} LOS</span>
            <span className="text-slate-400">•</span>
            <span className="text-amber-500 font-medium">{metrics.totalAlteredPower} Potencia</span>
            <span className="text-slate-400">•</span>
            <span className="text-purple-500 font-medium">{metrics.totalPowerFail} Energía</span>
          </div>
        </div>

        {/* Tarjetas OLT con Falla */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${CRM_SURFACES.textMuted}`}>
              Tarjetas Afectadas
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <Layers className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {availableBoards.filter((b) =>
                affectedClients.some((c) => c.board === b),
              ).length}
            </span>
            <span className={`text-xs ${CRM_SURFACES.textSecondary}`}>
              de {availableBoards.length || 1} activas
            </span>
          </div>
          <p className={`text-[11px] ${CRM_SURFACES.textSecondary}`}>
            Boards identificados en el chasis
          </p>
        </div>

        {/* Puertos PON en Corte Masivo */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${CRM_SURFACES.textMuted}`}>
              Puertos en Alerta
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
              <AlertTriangle className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
              {metrics.totalPortsInAlert}
            </span>
            <span className={`text-xs ${CRM_SURFACES.textSecondary}`}>
              con ≥ 3 caídos
            </span>
          </div>
          <p className={`text-[11px] ${CRM_SURFACES.textSecondary}`}>
            Requieren atención técnica urgente
          </p>
        </div>

        {/* Salud General de la Red */}
        <div
          className={`${CRM_SURFACES.card} rounded-3xl border ${CRM_SURFACES.border} p-4 space-y-1 transition hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${CRM_SURFACES.textMuted}`}>
              Red Operativa
            </span>
            <div className="flex size-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {metrics.totalOnus > 0
                ? `${Math.round((metrics.totalOnline / metrics.totalOnus) * 100)}%`
                : "100%"}
            </span>
            <span className={`text-xs ${CRM_SURFACES.textSecondary}`}>
              {metrics.totalOnline} online
            </span>
          </div>
          <p className={`text-[11px] ${CRM_SURFACES.textSecondary}`}>
            Disponibilidad estimada de fibra
          </p>
        </div>
      </section>

      {/* =========================================================================
          4. SELECTOR Y NAVEGADOR INTERACTIVO DE TARJETA Y PUERTO (OLT CHASSIS)
          ========================================================================= */}
      <section
        aria-label="Filtro interactivo por Tarjeta y Puerto"
        className={`${CRM_PANEL} p-4 md:p-5 space-y-4`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-slate-500 dark:text-slate-400" />
            <h2 className={`text-sm font-semibold md:text-base ${CRM_SURFACES.textPrimary}`}>
              Segmentación por Tarjeta y Puerto PON
            </h2>
          </div>
          {(selectedBoard !== "all" || selectedPort !== "all") ? (
            <button
              type="button"
              onClick={() => {
                setSelectedBoard("all");
                setSelectedPort("all");
              }}
              className="text-xs font-medium text-rose-500 hover:text-rose-600 dark:hover:text-rose-400">
              Limpiar filtros de tarjeta/puerto
            </button>
          ) : null}
        </div>

        {/* Fila A: Selector de Tarjeta (Board) */}
        <div className="space-y-1.5">
          <span className={`text-xs font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
            1. Seleccionar Tarjeta (Board)
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedBoard("all");
                setSelectedPort("all");
              }}
              className={`rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                selectedBoard === "all"
                  ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                  : "border-white/40 bg-white/30 text-slate-700 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}>
              Todas las Tarjetas ({affectedClients.length} caídos)
            </button>

            {availableBoards.map((board) => {
              const clientsOnBoard = affectedClients.filter((c) => c.board === board);
              const hasAlert = clientsOnBoard.length >= 3;
              const isSelected = selectedBoard === board;

              return (
                <button
                  key={`board-${board}`}
                  type="button"
                  onClick={() => {
                    setSelectedBoard(board);
                    setSelectedPort("all");
                  }}
                  className={`flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                    isSelected
                      ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                      : hasAlert
                        ? "border-rose-300 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:border-rose-500/30 dark:text-rose-300"
                        : "border-white/40 bg-white/30 text-slate-700 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}>
                  <span>Tarjeta {board}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : hasAlert
                          ? "bg-rose-500 text-white"
                          : "bg-black/5 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                    }`}>
                    {clientsOnBoard.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fila B: Selector de Puertos PON de la tarjeta activa */}
        <div className="space-y-1.5 pt-1">
          <span className={`text-xs font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
            2. Seleccionar Puerto PON {selectedBoard !== "all" ? `(Tarjeta ${selectedBoard})` : "(Global)"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedPort("all")}
              className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                selectedPort === "all"
                  ? "border-slate-800 bg-slate-800 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-white/40 bg-white/20 text-slate-600 hover:bg-white/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              }`}>
              Todos los puertos
            </button>

            {availablePortsForSelectedBoard.map((p) => {
              const isSelected = selectedPort === p.port && (selectedBoard === "all" || selectedBoard === p.board);
              const isCritical = p.affected >= 3;
              const hasAffected = p.affected > 0;

              return (
                <button
                  key={`port-${p.board}-${p.port}`}
                  type="button"
                  onClick={() => {
                    setSelectedBoard(p.board);
                    setSelectedPort(p.port);
                  }}
                  className={`flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-medium transition ${CRM_FOCUS_RING} ${
                    isSelected
                      ? "border-rose-600 bg-rose-600 text-white shadow-sm"
                      : isCritical
                        ? "border-red-500/40 bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:text-red-300"
                        : hasAffected
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                          : "border-white/30 bg-white/10 text-slate-500 hover:bg-white/30 dark:border-white/10 dark:text-slate-400"
                  }`}>
                  <span>T{p.board}/P{p.port}</span>
                  {p.affected > 0 ? (
                    <span
                      className={`rounded-full px-1.2 py-0.2 text-[9px] font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : isCritical
                            ? "bg-red-500 text-white"
                            : "bg-amber-500 text-white"
                      }`}>
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
          5. BARRA DE HERRAMIENTAS Y BÚSQUEDA
          ========================================================================= */}
      <div
        ref={tableSectionRef}
        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Buscador de cliente / cédula / SN / zona */}
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

        {/* Filtros de estado y vista agrupada vs tabla continua */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por tipo de falla */}
          <div className="flex items-center rounded-2xl border border-white/40 bg-white/30 p-1 dark:border-white/10 dark:bg-white/5">
            {(
              [
                { id: "all", label: "Todos" },
                { id: "LOS", label: "LOS" },
                { id: "Potencia alterada", label: "Potencia" },
                { id: "Power fail", label: "Energía" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                  statusFilter === f.id
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
              title="Agrupar por Tarjeta y Puerto"
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
          6. LISTADO DE INCIDENCIAS: VISTA AGRUPADA (POR DEFECTO)
          ========================================================================= */}
      {viewMode === "grouped" ? (
        <div className="space-y-5">
          {groupedClients.length === 0 ? (
            <div
              className={`${CRM_PANEL} flex flex-col items-center justify-center p-12 text-center space-y-3`}>
              <div className="flex size-14 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
                <CheckCircle2 className="size-8" />
              </div>
              <h3 className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
                No se registran clientes desconectados
              </h3>
              <p className={`max-w-md text-xs md:text-sm ${CRM_SURFACES.textSecondary}`}>
                {searchQuery || selectedBoard !== "all" || selectedPort !== "all" || statusFilter !== "all"
                  ? "No hay clientes que coincidan con los filtros seleccionados."
                  : "La red de fibra óptica se encuentra 100% operativa en todos los puertos PON."}
              </p>
            </div>
          ) : (
            groupedClients.map((group) => {
              return (
                <div
                  key={`group-${group.board}-${group.port}`}
                  className={`${CRM_PANEL} overflow-hidden border ${
                    group.hasMassiveAlert
                      ? "border-rose-500/40 shadow-sm dark:border-rose-500/30"
                      : CRM_SURFACES.border
                  }`}>
                  {/* Encabezado del Grupo (Tarjeta & Puerto) */}
                  <div
                    className={`flex flex-col gap-2 border-b p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                      group.hasMassiveAlert
                        ? "border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10"
                        : "border-white/30 bg-white/20 dark:border-white/10 dark:bg-white/5"
                    }`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={`text-xs font-bold py-1 px-2.5 ${
                          group.hasMassiveAlert
                            ? "bg-rose-600 text-white"
                            : "bg-slate-800 text-white dark:bg-slate-700"
                        }`}>
                        Tarjeta {group.board} • Puerto PON {group.port}
                      </Badge>

                      {group.hasMassiveAlert ? (
                        <Badge
                          variant="destructive"
                          className="gap-1 text-[11px] font-semibold animate-pulse">
                          <AlertTriangle className="size-3" />
                          Corte Masivo ({group.clients.length} afectados)
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px]">
                          {group.clients.length} cliente(s) afectado(s)
                        </Badge>
                      )}

                      {group.portInfo?.healthRatio != null ? (
                        <span className={`text-xs ${CRM_SURFACES.textSecondary}`}>
                          Salud del puerto: {group.portInfo.healthRatio}% ({group.portInfo.online}/{group.portInfo.total} online)
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
                        Total ONUs en puerto: {group.portInfo?.total ?? group.clients.length}
                      </span>
                    </div>
                  </div>

                  {/* Tabla de Clientes en este Puerto */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs md:text-sm">
                      <thead className={`border-b border-white/20 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-400 bg-black/[.02] dark:bg-white/[.02]`}>
                        <tr>
                          <th scope="col" className="px-4 py-3">Cliente</th>
                          <th scope="col" className="px-4 py-3">Zona / Sector</th>
                          <th scope="col" className="px-4 py-3">ONU (SN)</th>
                          <th scope="col" className="px-4 py-3">Falla / Estado</th>
                          <th scope="col" className="px-4 py-3">Señal Óptica (RX)</th>
                          <th scope="col" className="px-4 py-3">Tiempo Desconectado</th>
                          <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/15 dark:divide-white/5">
                        {group.clients.map((client) => {
                          const signalQuality = getSignalQuality(client.rxSignal);
                          const isDiagnosing = diagnosingClientSn === client.sn;

                          return (
                            <tr
                              key={client.id}
                              className={`transition hover:bg-white/40 dark:hover:bg-white/[.04]`}>
                              {/* Cliente */}
                              <td className="px-4 py-3 font-medium">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-semibold ${CRM_SURFACES.textPrimary}`}>
                                      {client.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                    {client.cedula ? <span>CI: {client.cedula}</span> : null}
                                    {client.phone ? <span>Tel: {client.phone}</span> : null}
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
                                    onClick={() => handleCopyText(client.sn, "Número de serie")}
                                    aria-label="Copiar SN"
                                    title="Copiar número de serie"
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                    <Copy className="size-3" />
                                  </button>
                                </div>
                              </td>

                              {/* Estado / Falla */}
                              <td className="px-4 py-3">
                                {client.incidentType === "LOS" ? (
                                  <Badge variant="destructive" className="gap-1 font-medium">
                                    <ZapOff className="size-3" />
                                    <span>Alarma LOS</span>
                                  </Badge>
                                ) : client.incidentType === "Potencia alterada" ? (
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
                                    <Signal className={`size-3.5 ${signalQuality.colorClass}`} />
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                      {client.rxSignal != null ? `${client.rxSignal.toFixed(2)} dBm` : "N/D"}
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
                                                  ((client.rxSignal + 35) / 20) * 100,
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
                                  <span>{client.durationText}</span>
                                </div>
                              </td>

                              {/* Acciones */}
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
                                      className={cn("size-3.5", isDiagnosing && "animate-spin text-rose-500")}
                                    />
                                  </button>

                                  {/* Crear ticket */}
                                  <button
                                    type="button"
                                    onClick={() => handleCreateTicketForClient(client)}
                                    aria-label={`Crear ticket para ${client.name}`}
                                    title="Crear ticket de soporte de campo"
                                    className={`flex size-8 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
                                    <Ticket className="size-3.5 text-amber-600 dark:text-amber-400" />
                                  </button>

                                  {/* Abrir chat si existe handler */}
                                  {onOpenClientChat ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenClientChat(client.clientId)}
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
            7. LISTADO DE INCIDENCIAS: VISTA DE TABLA CONTINUA (PLANA)
            ========================================================================= */
        <div className={`${CRM_TABLE} overflow-hidden border ${CRM_SURFACES.border}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className={`border-b border-white/30 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-400 bg-black/[.02] dark:bg-white/[.02]`}>
                <tr>
                  <th scope="col" className="px-4 py-3.5">Tarjeta / Puerto</th>
                  <th scope="col" className="px-4 py-3.5">Cliente</th>
                  <th scope="col" className="px-4 py-3.5">Zona</th>
                  <th scope="col" className="px-4 py-3.5">ONU (SN)</th>
                  <th scope="col" className="px-4 py-3.5">Falla</th>
                  <th scope="col" className="px-4 py-3.5">Señal (RX)</th>
                  <th scope="col" className="px-4 py-3.5">Tiempo Caído</th>
                  <th scope="col" className="px-4 py-3.5 text-right">Acciones</th>
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
                        key={`flat-${client.id}`}
                        className="transition hover:bg-white/40 dark:hover:bg-white/[.04]">
                        {/* Tarjeta y Puerto PON destacados */}
                        <td className="px-4 py-3 font-medium">
                          <Badge
                            className={`font-mono text-xs font-bold py-0.5 px-2 ${
                              client.incidentType === "LOS"
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                            }`}>
                            Tarjeta {client.board} • PON {client.port}
                          </Badge>
                        </td>

                        {/* Cliente */}
                        <td className="px-4 py-3 font-medium">
                          <div className="space-y-0.5">
                            <span className={`font-semibold ${CRM_SURFACES.textPrimary}`}>
                              {client.name}
                            </span>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {client.cedula || client.phone || "Sin documento"}
                            </div>
                          </div>
                        </td>

                        {/* Zona */}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {client.zone || "N/A"}
                        </td>

                        {/* SN */}
                        <td className="px-4 py-3 font-mono text-xs">
                          {client.sn}
                        </td>

                        {/* Falla */}
                        <td className="px-4 py-3">
                          {client.incidentType === "LOS" ? (
                            <Badge variant="destructive" className="gap-1 font-medium">
                              <ZapOff className="size-3" />
                              <span>LOS</span>
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 gap-1 font-medium">
                              <AlertCircle className="size-3" />
                              <span>{client.incidentType}</span>
                            </Badge>
                          )}
                        </td>

                        {/* Señal RX */}
                        <td className="px-4 py-3">
                          <span className={`font-mono font-semibold ${signalQuality.colorClass}`}>
                            {client.rxSignal != null ? `${client.rxSignal.toFixed(2)} dBm` : "Sin señal"}
                          </span>
                        </td>

                        {/* Tiempo */}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {client.durationText}
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDiagnoseClient(client)}
                              disabled={isDiagnosing}
                              aria-label={`Diagnosticar ${client.name}`}
                              title="Diagnosticar OLT"
                              className={`flex size-7 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 ${CRM_FOCUS_RING}`}>
                              <RefreshCw
                                className={cn("size-3", isDiagnosing && "animate-spin text-rose-500")}
                              />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCreateTicketForClient(client)}
                              aria-label={`Crear ticket para ${client.name}`}
                              title="Crear ticket"
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
    </div>
  );
};
