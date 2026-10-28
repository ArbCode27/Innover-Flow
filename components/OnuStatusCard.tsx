"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Info,
  Radio,
  RefreshCw,
  Server,
  Signal,
  Wifi,
  ZapOff,
} from "lucide-react";
import { toast } from "sonner";
import { useOnuRealtime } from "@/hooks/useOnuRealtime";
import type { ClientOnu } from "@/types/smartolt";
import { CrmButton } from "@/app/crm/_components/shared/crm-button";
import { CRM_SURFACES } from "@/app/crm/_lib/crm-theme";
import { cn } from "@/lib/utils";

interface OnuStatusCardProps {
  clientId?: number;
  initialOnu?: ClientOnu | null;
  onOpenLinkModal?: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * Función auxiliar para clasificar la potencia óptica recibida ($RX$)
 * Reglas de semáforo:
 * -15.00 a -23.99 dBm -> Verde (Excelente / Óptimo)
 * -24.00 a -26.99 dBm -> Amarillo (Aceptable)
 * -27.00 a -28.99 dBm -> Naranja (Atenuación Alta / Crítico)
 * <= -29.00 dBm o null -> Rojo (Falla de Línea / Potencia Alterada)
 */
export const getSignalQuality = (rxSignal?: number | null) => {
  if (rxSignal == null) {
    return {
      label: "Sin señal",
      colorClass: "text-rose-500",
      bgClass: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
      barPercent: 0,
      status: "critical",
    };
  }

  if (rxSignal >= -23.99 && rxSignal <= -15.0) {
    return {
      label: "Excelente",
      colorClass: "text-emerald-500",
      bgClass: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
      barPercent: 100,
      status: "optimal",
    };
  }

  if (rxSignal >= -26.99 && rxSignal < -23.99) {
    return {
      label: "Aceptable",
      colorClass: "text-amber-500",
      bgClass: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
      barPercent: 75,
      status: "acceptable",
    };
  }

  if (rxSignal >= -28.99 && rxSignal < -26.99) {
    return {
      label: "Atenuación Alta",
      colorClass: "text-orange-500",
      bgClass: "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400",
      barPercent: 40,
      status: "warning",
    };
  }

  // rxSignal <= -29.00 dBm (o fuera de rango aceptable)
  return {
    label: "Potencia Alterada / Crítico",
    colorClass: "text-rose-500",
    bgClass: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
    barPercent: 15,
    status: "critical",
  };
};

/**
 * Función auxiliar para dar estilo al Badge de Estado de la ONU
 */
export const getOnuStatusBadge = (status?: string | null) => {
  const norm = (status || "").toLowerCase().trim();

  if (norm === "online") {
    return {
      label: "Online",
      color: "bg-emerald-500",
      badgeClass: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      icon: CheckCircle2,
    };
  }

  if (norm === "power fail" || norm.includes("power")) {
    return {
      label: "Power fail",
      color: "bg-amber-500",
      badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
      icon: ZapOff,
    };
  }

  if (norm === "los" || norm === "offline" || norm.includes("loss")) {
    return {
      label: norm === "los" ? "LOS (Sin Fibra)" : "Offline",
      color: "bg-rose-500",
      badgeClass: "border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400",
      icon: AlertCircle,
    };
  }

  return {
    label: status || "Desconocido",
    color: "bg-zinc-400",
    badgeClass: "border-zinc-500/30 bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
    icon: Info,
  };
};

export const OnuStatusCard = ({
  clientId,
  initialOnu,
  onOpenLinkModal,
  className,
  compact = false,
}: OnuStatusCardProps) => {
  const { onu, isDiagnosing, liveDiagnosis, refreshLiveStatus } = useOnuRealtime({
    clientId,
    initialOnu,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const handleRunLiveDiagnosis = async () => {
    const res = await refreshLiveStatus();
    if (res) {
      toast.success("Diagnóstico en vivo completado", {
        description: `Estado: ${res.onu_status} | RX: ${res.rx_power != null ? `${res.rx_power} dBm` : "N/D"} | Uptime: ${res.uptime || "N/D"}`,
      });
      setIsExpanded(true);
    } else {
      toast.error("No se pudo obtener el diagnóstico directo de la OLT");
    }
  };

  if (!onu) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border/70 p-3.5 text-center space-y-2", className)}>
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Server className="size-3.5" />
          <span>Sin ONU vinculada en Smart OLT</span>
        </div>
        {onOpenLinkModal ? (
          <CrmButton
            type="button"
            variant="secondary"
            size="sm"
            className="w-full text-xs h-7"
            onClick={onOpenLinkModal}>
            Vincular ONU
          </CrmButton>
        ) : null}
      </div>
    );
  }

  const statusBadge = getOnuStatusBadge(onu.status);
  const signalInfo = getSignalQuality(onu.rx_signal);
  const StatusIcon = statusBadge.icon;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/60 p-3 space-y-3 shadow-xs",
        onu.status?.toLowerCase() === "los" && "border-rose-500/40 bg-rose-500/[0.03]",
        signalInfo.status === "critical" && "border-rose-500/30",
        className,
      )}>
      {/* Encabezado: Título + Botón de Diagnóstico */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Radio className="size-3.5 text-emerald-500" />
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
            Datos OLT (Smart OLT)
          </span>
        </div>

        <button
          type="button"
          onClick={handleRunLiveDiagnosis}
          disabled={isDiagnosing}
          title="Ejecutar diagnóstico en vivo directo a la OLT"
          className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 disabled:opacity-50 transition-colors">
          <RefreshCw className={cn("size-3", isDiagnosing && "animate-spin")} />
          <span>{isDiagnosing ? "Consultando..." : "Diagnóstico en vivo"}</span>
        </button>
      </div>

      {/* Grid principal: Board, Port, Estado y Potencia RX */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-0.5">
          <p className={`text-[10px] uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
            Tarjeta (Board)
          </p>
          <p className={`font-mono text-xs font-semibold ${CRM_SURFACES.textPrimary}`}>
            {onu.board != null ? `Board ${onu.board}` : "—"}
          </p>
        </div>

        <div className="space-y-0.5">
          <p className={`text-[10px] uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
            Puerto PON (Port)
          </p>
          <p className={`font-mono text-xs font-semibold ${CRM_SURFACES.textPrimary}`}>
            {onu.port != null ? `Port ${onu.port}` : "—"}
          </p>
        </div>

        <div className="space-y-0.5">
          <p className={`text-[10px] uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
            Estado OLT
          </p>
          <div className="pt-0.5 flex items-center">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                statusBadge.badgeClass,
              )}>
              <span className={cn("size-1.5 rounded-full shrink-0", statusBadge.color)} />
              <StatusIcon className="size-3" />
              <span>{onu.status || "N/D"}</span>
            </span>
          </div>
        </div>

        <div className="space-y-0.5">
          <p className={`text-[10px] uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
            Potencia RX
          </p>
          <div className="flex items-center gap-1.5">
            <p className={cn("font-mono text-xs font-bold", signalInfo.colorClass)}>
              {onu.rx_signal != null ? `${onu.rx_signal} dBm` : "Sin señal"}
            </p>
          </div>
          <p className={cn("text-[9px] font-medium leading-none", signalInfo.colorClass)}>
            {signalInfo.label}
          </p>
        </div>
      </div>

      {/* Barra visual de potencia */}
      <div className="space-y-1">
        <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500 rounded-full",
              signalInfo.status === "optimal"
                ? "bg-emerald-500"
                : signalInfo.status === "acceptable"
                  ? "bg-amber-500"
                  : signalInfo.status === "warning"
                    ? "bg-orange-500"
                    : "bg-rose-500",
            )}
            style={{ width: `${signalInfo.barPercent}%` }}
          />
        </div>
      </div>

      {/* SN y acción de cambio */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20 text-[11px] text-muted-foreground">
        <span className="font-mono truncate" title={onu.sn}>
          SN: {onu.sn}
        </span>
        {onOpenLinkModal ? (
          <button
            type="button"
            onClick={onOpenLinkModal}
            className="text-[10px] text-muted-foreground hover:text-foreground underline">
            Cambiar ONU
          </button>
        ) : null}
      </div>

      {/* Diagnóstico en vivo desplegable con detalles técnicos si se ejecutó */}
      {liveDiagnosis ? (
        <div className="rounded-lg border border-border/40 bg-background/50 p-2 space-y-2 text-[11px]">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center justify-between w-full text-muted-foreground hover:text-foreground font-medium">
            <span className="flex items-center gap-1">
              <Activity className="size-3 text-emerald-500" />
              Detalles del Diagnóstico en Vivo
            </span>
            {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>

          {isExpanded ? (
            <div className="space-y-1.5 pt-1 border-t border-border/20 text-muted-foreground">
              {liveDiagnosis.uptime ? (
                <div className="flex justify-between">
                  <span>Uptime:</span>
                  <strong className="text-foreground font-mono">{liveDiagnosis.uptime}</strong>
                </div>
              ) : null}

              {liveDiagnosis.olt_rx_signal ? (
                <div className="flex justify-between">
                  <span>Potencia TX hacia OLT:</span>
                  <strong className="text-foreground font-mono">{liveDiagnosis.olt_rx_signal} dBm</strong>
                </div>
              ) : null}

              {liveDiagnosis.temperature ? (
                <div className="flex justify-between">
                  <span>Temperatura:</span>
                  <strong className="text-foreground font-mono">{liveDiagnosis.temperature}</strong>
                </div>
              ) : null}

              {liveDiagnosis.distance ? (
                <div className="flex justify-between">
                  <span>Distancia óptica:</span>
                  <strong className="text-foreground font-mono">{liveDiagnosis.distance}</strong>
                </div>
              ) : null}

              {liveDiagnosis.offline_reason ? (
                <div className="flex justify-between text-rose-500">
                  <span>Motivo último offline:</span>
                  <strong className="font-mono">{liveDiagnosis.offline_reason}</strong>
                </div>
              ) : null}

              {Array.isArray(liveDiagnosis.lan_ports) && liveDiagnosis.lan_ports.length > 0 ? (
                <div className="pt-1">
                  <span className="text-[10px] uppercase font-semibold">Puertos LAN:</span>
                  <div className="flex gap-1.5 mt-1">
                    {liveDiagnosis.lan_ports.map((lp, i) => (
                      <span
                        key={i}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-mono",
                          String(lp.status).toLowerCase() === "up"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}>
                        LAN {lp.port}: {lp.status}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
