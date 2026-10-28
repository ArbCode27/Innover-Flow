"use client";

import { useEffect, useState, useCallback } from "react";
import { Radio, RefreshCw, Server, Send, Users, Wifi } from "lucide-react";
import { toast } from "sonner";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { BoardPortTarget } from "../../_lib/types";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import { NewMassNotificationForm } from "@/app/crm/notifications/NewMassNotificationForm";

interface NotificationsViewProps {
  organizationId?: string;
}

export const NotificationsView = ({ organizationId }: NotificationsViewProps) => {
  const [targets, setTargets] = useState<BoardPortTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTargets = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/crm/smartolt/targets", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.targets)) {
        setTargets(data.targets);
      }
    } catch (err) {
      console.warn("[NOTIFICATIONS_VIEW] error cargando targets:", err);
      toast.error("No se pudieron cargar los puertos de Smart OLT");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTargets();
  }, [fetchTargets]);

  const totalClientsWithOnu = targets.reduce((acc, t) => acc + t.clientCount, 0);

  return (
    <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-6 text-emerald-500" />
            <h2 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
              Notificaciones masivas
            </h2>
          </div>
          <p className={`text-sm mt-1 ${CRM_SURFACES.textMuted}`}>
            Segmentación técnica por Smart OLT (Board y Port) para difusiones push a clientes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CrmButton
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => void fetchTargets()}
            disabled={isLoading}
            aria-label="Refrescar puertos">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </CrmButton>

          <NewMassNotificationForm
            targetOptions={targets}
            organizationId={organizationId}
            onSuccess={() => void fetchTargets()}
          />
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={`rounded-xl border p-4 shadow-sm ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Puertos activos
            </span>
            <Server className="size-4 text-emerald-500" />
          </div>
          <p className={`mt-2 text-2xl font-bold ${CRM_SURFACES.textPrimary}`}>
            {targets.length}
          </p>
          <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
            Combinaciones Board & Port con ONUs registradas
          </p>
        </div>

        <div className={`rounded-xl border p-4 shadow-sm ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Clientes vinculados a OLT
            </span>
            <Users className="size-4 text-blue-500" />
          </div>
          <p className={`mt-2 text-2xl font-bold ${CRM_SURFACES.textPrimary}`}>
            {totalClientsWithOnu}
          </p>
          <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
            Equipos ONU asociados a clientes de tu organización
          </p>
        </div>

        <div className={`rounded-xl border p-4 shadow-sm ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
              Canal de entrega
            </span>
            <Wifi className="size-4 text-purple-500" />
          </div>
          <p className={`mt-2 text-2xl font-bold ${CRM_SURFACES.textPrimary}`}>
            Expo Push
          </p>
          <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
            Notificación directa a los smartphones con sesión activa
          </p>
        </div>
      </div>

      {/* Lista de Puertos detectados */}
      <div className={`rounded-xl border shadow-sm ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div>
            <h3 className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
              Puertos Smart OLT detectados
            </h3>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Puedes enviar una notificación directa haciendo clic en cualquier puerto registrado.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8">
            <LoadingState label="Cargando puertos de la OLT..." />
          </div>
        ) : targets.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Server className="size-8 mx-auto text-muted-foreground/60" />
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
              No hay ONUs registradas aún
            </p>
            <p className={`text-xs max-w-md mx-auto ${CRM_SURFACES.textMuted}`}>
              Al registrar clientes y vincular su ONU mediante el SN consultado en Smart OLT,
              aparecerán automáticamente sus Tarjetas (Boards) y Puertos PON para segmentación.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={`border-b text-xs uppercase tracking-wider ${CRM_SURFACES.border} ${CRM_SURFACES.textMuted}`}>
                <tr>
                  <th className="px-4 py-3">Board (Tarjeta)</th>
                  <th className="px-4 py-3">Port (Puerto PON)</th>
                  <th className="px-4 py-3">Clientes vinculados</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {targets.map((tgt) => (
                  <tr
                    key={`${tgt.board}-${tgt.port}`}
                    className={`transition-colors ${CRM_SURFACES.hover}`}>
                    <td className="px-4 py-3 font-mono font-medium">
                      Tarjeta {tgt.board}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">
                      Puerto {tgt.port}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {tgt.clientCount} {tgt.clientCount === 1 ? "cliente" : "clientes"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <NewMassNotificationForm
                        targetOptions={[tgt]}
                        organizationId={organizationId}
                        onSuccess={() => void fetchTargets()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
