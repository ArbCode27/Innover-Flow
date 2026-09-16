"use client";

import { History } from "lucide-react";
import type { HistoryDateGroup } from "../../_lib/history-utils";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { EmptyState } from "../shared/empty-state";
import { HistoryListItem } from "./history-list-item";

interface HistoryListProps {
  groups: HistoryDateGroup[];
  selectedHistoryId: number | null;
  onSelect: (id: number) => void;
}

export const HistoryList = ({
  groups,
  selectedHistoryId,
  onSelect,
}: HistoryListProps) => {
  if (!groups.length) {
    return (
      <EmptyState
        icon={History}
        title="Sin historial"
        description="Las conversaciones resueltas aparecerán aquí agrupadas por fecha."
      />
    );
  }

  return (
    <div className="crm-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {groups.map((group) => (
        <section key={group.dateKey} aria-labelledby={`history-group-${group.dateKey}`}>
          <header
            id={`history-group-${group.dateKey}`}
            className={`sticky top-0 z-10 rounded-2xl px-3 py-2 ${CRM_SURFACES.elevatedTranslucent}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
              Resueltas · {group.label}
            </p>
            <p className={`text-[10px] ${CRM_SURFACES.textLabel}`}>
              {group.entries.length}{" "}
              {group.entries.length === 1 ? "conversación" : "conversaciones"}
            </p>
          </header>

          <ul role="list">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <HistoryListItem
                  entry={entry}
                  isActive={selectedHistoryId === entry.id}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
