"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardPayload } from "../_lib/types";
import { topPerformerByRole, type FieldTeamRow, type OfficeTeamRow, type TeamRow } from "@/lib/scoring";

export const useTeamScores = (periodDays: number) => {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - (Number(periodDays) - 1) * 86_400_000);
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
        const payload = (await response.json()) as DashboardPayload & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "No se pudieron cargar las métricas");
        }
        setData(payload);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar las métricas",
        );
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [periodDays, reloadKey]);

  const team: TeamRow[] = data?.team ?? [];
  const topOffice = useMemo((): OfficeTeamRow | null => {
    const row = topPerformerByRole(team, "office");
    return row?.role === "office" ? row : null;
  }, [team]);
  const topField = useMemo((): FieldTeamRow | null => {
    const row = topPerformerByRole(team, "field");
    return row?.role === "field" ? row : null;
  }, [team]);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  return {
    data,
    team,
    topOffice,
    topField,
    isLoading,
    error,
    reload,
  };
};
