"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseClient, ensureCrmRealtimeAuth } from "@/app/crm/_lib/supabase";
import type { ClientOnu, SmartOltFullStatusInfo } from "@/types/smartolt";

interface UseOnuRealtimeOptions {
  clientId?: number | null;
  onuExternalId?: string | null;
  initialOnu?: ClientOnu | null;
}

export const useOnuRealtime = ({
  clientId,
  onuExternalId,
  initialOnu = null,
}: UseOnuRealtimeOptions) => {
  const [onu, setOnu] = useState<ClientOnu | null>(initialOnu);
  const [isLoading, setIsLoading] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [liveDiagnosis, setLiveDiagnosis] = useState<SmartOltFullStatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onuRef = useRef<ClientOnu | null>(initialOnu);
  useEffect(() => {
    onuRef.current = onu;
  }, [onu]);

  // Actualizar cuando cambie el initialOnu desde las props
  useEffect(() => {
    if (initialOnu) {
      setOnu(initialOnu);
    }
  }, [initialOnu]);

  // Carga inicial desde Supabase si no se suministró initialOnu
  useEffect(() => {
    let isCancelled = false;

    const fetchInitial = async () => {
      if (!clientId && !onuExternalId) return;
      if (initialOnu && (initialOnu.client_id === clientId || initialOnu.onu_external_id === onuExternalId)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseClient();
        let query = supabase.from("client_onus").select("*");

        if (clientId) {
          query = query.eq("client_id", clientId);
        } else if (onuExternalId) {
          query = query.eq("onu_external_id", onuExternalId);
        }

        const { data, error: dbError } = await query.maybeSingle();
        if (dbError) throw dbError;

        if (!isCancelled && data) {
          setOnu(data as ClientOnu);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar datos de la ONU");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void fetchInitial();

    return () => {
      isCancelled = true;
    };
  }, [clientId, onuExternalId, initialOnu]);

  // Suscripción Realtime a cambios en client_onus
  useEffect(() => {
    if (!clientId && !onuExternalId) return;

    let channelName = `realtime:onu:${clientId || onuExternalId}:${Date.now()}`;
    const supabase = getSupabaseClient();

    void ensureCrmRealtimeAuth();

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "client_onus",
          ...(clientId ? { filter: `client_id=eq.${clientId}` } : {}),
        },
        (payload) => {
          const updated = payload.new as ClientOnu;
          // Validar que corresponda al externalId si se filtró por él
          if (onuExternalId && updated.onu_external_id !== onuExternalId) return;

          setOnu((prev) => ({
            ...prev,
            ...updated,
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_onus",
          ...(clientId ? { filter: `client_id=eq.${clientId}` } : {}),
        },
        (payload) => {
          const inserted = payload.new as ClientOnu;
          if (onuExternalId && inserted.onu_external_id !== onuExternalId) return;
          setOnu(inserted);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, onuExternalId]);

  // Consulta de diagnóstico en vivo bajo demanda
  const refreshLiveStatus = useCallback(async (): Promise<SmartOltFullStatusInfo | null> => {
    const targetExternalId = onuRef.current?.onu_external_id || onuExternalId;
    if (!targetExternalId && !clientId) {
      setError("No hay ONU vinculada para diagnosticar.");
      return null;
    }

    setIsDiagnosing(true);
    setError(null);

    try {
      const response = await fetch("/api/crm/smartolt/live-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onu_external_id: targetExternalId,
          clientId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudo consultar el estado en la OLT");
      }

      const info = result.data as SmartOltFullStatusInfo;
      setLiveDiagnosis(info);

      // Actualizar estado local optimistamente
      setOnu((prev) => ({
        ...prev,
        onu_external_id: targetExternalId || prev?.onu_external_id || "",
        sn: prev?.sn || "",
        status: info.onu_status,
        rx_signal: info.rx_power ?? prev?.rx_signal ?? null,
        board: info.board ?? prev?.board ?? null,
        port: info.port ?? prev?.port ?? null,
        updated_at: new Date().toISOString(),
      }));

      return info;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al consultar SmartOLT";
      setError(msg);
      return null;
    } finally {
      setIsDiagnosing(false);
    }
  }, [clientId, onuExternalId]);

  return {
    onu,
    isLoading,
    isDiagnosing,
    liveDiagnosis,
    error,
    refreshLiveStatus,
  };
};
