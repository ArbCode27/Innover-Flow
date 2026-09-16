"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { crmService } from "../_lib/crm-service";
import {
  groupHistoryByResolvedDate,
  matchesHistorySearch,
} from "../_lib/history-utils";
import type { Agent, ConversationHistory, Label } from "../_lib/types";

export const useConversationHistory = (agents: Agent[], labels: Label[]) => {
  const [entries, setEntries] = useState<ConversationHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  const labelsById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels],
  );

  const loadHistory = useCallback(async () => {
    setIsLoading(true);

    try {
      const data = await crmService.loadConversationHistory();
      setEntries(data);
    } catch (error) {
      console.error("Load conversation history:", error);
      toast.error("No se pudo cargar el historial de conversaciones");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesHistorySearch(entry, searchTerm)),
    [entries, searchTerm],
  );

  const groupedEntries = useMemo(
    () => groupHistoryByResolvedDate(filteredEntries),
    [filteredEntries],
  );

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedHistoryId) ?? null,
    [entries, selectedHistoryId],
  );

  const selectHistoryEntry = useCallback<(id: number | null) => void>((id) => {
    setSelectedHistoryId(id);
  }, []);

  const clearSelectedHistory = useCallback(() => {
    setSelectedHistoryId(null);
  }, []);

  return {
    entries,
    filteredEntries,
    groupedEntries,
    selectedEntry,
    selectedHistoryId,
    isLoading,
    searchTerm,
    agentsById,
    labelsById,
    setSearchTerm,
    selectHistoryEntry,
    clearSelectedHistory,
    reloadHistory: loadHistory,
  };
};
