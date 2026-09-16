"use client";

import type { Agent, CrmView, Label } from "../../_lib/types";
import { CRM_PANEL, CRM_SURFACES } from "../../_lib/crm-theme";
import { useConversationHistory } from "../../_hooks/use-conversation-history";
import { LoadingState } from "../shared/loading-state";
import { CrmMobileSettingsMenu } from "../shell/crm-mobile-settings-menu";
import { CrmThemeToggle } from "../shell/crm-theme-toggle";
import { HistoryDetailPanel } from "./history-detail-panel";
import { HistoryFilters } from "./history-filters";
import { HistoryList } from "./history-list";

interface HistoryViewProps {
  agents: Agent[];
  labels: Label[];
  onOpenSettingsView: (view: CrmView) => void;
}

export const HistoryView = ({
  agents,
  labels,
  onOpenSettingsView,
}: HistoryViewProps) => {
  const history = useConversationHistory(agents, labels);

  const selectedLabels =
    history.selectedEntry?.label_ids
      .map((id) => history.labelsById.get(id))
      .filter((label): label is Label => Boolean(label)) ?? [];

  const resolvedByAgent = history.selectedEntry?.resolved_by
    ? (history.agentsById.get(history.selectedEntry.resolved_by) ?? null)
    : null;

  const assignedAgent = history.selectedEntry?.agent_id
    ? (history.agentsById.get(history.selectedEntry.agent_id) ?? null)
    : null;
  const isEntryOpen = history.selectedHistoryId !== null;

  if (history.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <LoadingState label="Cargando historial..." />
      </div>
    );
  }

  return (
    <div className="flex max-h-[100vh] min-h-0 flex-1 gap-2 overflow-hidden md:gap-3">
      <aside
        className={`${
          isEntryOpen ? "hidden md:flex" : "flex"
        } min-h-0 w-full shrink-0 flex-col overflow-hidden md:w-80 ${CRM_PANEL}`}>
        <div className={`border-b p-4 ${CRM_SURFACES.border}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              Historial
            </h2>
            <div className="flex items-center gap-1 md:hidden">
              <CrmThemeToggle className="size-8" />
              <CrmMobileSettingsMenu onSelectView={onOpenSettingsView} />
            </div>
          </div>
          <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
            {history.filteredEntries.length} de {history.entries.length}{" "}
            archivadas
          </p>
        </div>

        <HistoryFilters
          searchTerm={history.searchTerm}
          onSearchChange={history.setSearchTerm}
        />

        <HistoryList
          groups={history.groupedEntries}
          selectedHistoryId={history.selectedHistoryId}
          onSelect={history.selectHistoryEntry}
        />
      </aside>

      <div
        className={`${
          isEntryOpen ? "flex" : "hidden md:flex"
        } min-h-0 min-w-0 flex-1 ${CRM_PANEL}`}>
        <HistoryDetailPanel
          entry={history.selectedEntry}
          resolvedByAgent={resolvedByAgent}
          assignedAgent={assignedAgent}
          labels={selectedLabels}
          totalEntries={history.entries.length}
          onBackToList={history.clearSelectedHistory}
        />
      </div>
    </div>
  );
};
