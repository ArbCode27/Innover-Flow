"use client";

import type { Agent, ConversationHistory, Label } from "../../_lib/types";
import { HistoryHeader } from "./history-header";
import { HistoryMessages } from "./history-messages";
import { HistoryWelcomePanel } from "./history-welcome-panel";

interface HistoryDetailPanelProps {
  entry: ConversationHistory | null;
  resolvedByAgent: Agent | null;
  assignedAgent: Agent | null;
  labels: Label[];
  totalEntries: number;
  onBackToList?: () => void;
}

export const HistoryDetailPanel = ({
  entry,
  resolvedByAgent,
  assignedAgent,
  labels,
  totalEntries,
  onBackToList,
}: HistoryDetailPanelProps) => {
  if (!entry) {
    return (
      <section
        aria-label="Detalle del historial"
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <HistoryWelcomePanel totalEntries={totalEntries} />
      </section>
    );
  }

  return (
    <section
      aria-label="Detalle del historial"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <HistoryHeader
        entry={entry}
        resolvedByAgent={resolvedByAgent}
        assignedAgent={assignedAgent}
        labels={labels}
        onBackToList={onBackToList}
      />
      <HistoryMessages
        entry={entry}
        resolvedByAgent={resolvedByAgent}
        labels={labels}
      />
    </section>
  );
};
