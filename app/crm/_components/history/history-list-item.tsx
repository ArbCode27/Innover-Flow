"use client";

import { Archive, Bot, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CRM_BADGE_TONES,
  CRM_FOCUS_RING,
  CRM_HISTORY_ITEM,
  CRM_SURFACES,
} from "../../_lib/crm-theme";
import { formatCrmTime } from "../../_lib/formatters";
import { getHistoryMessageCount } from "../../_lib/history-utils";
import type { ConversationHistory } from "../../_lib/types";
import { AvatarInitials } from "../shared/avatar-initials";

interface HistoryListItemProps {
  entry: ConversationHistory;
  isActive: boolean;
  onSelect: (id: number) => void;
}

export const HistoryListItem = ({
  entry,
  isActive,
  onSelect,
}: HistoryListItemProps) => {
  const displayName = entry.client_name || "Número desconocido";
  const preview = entry.summary || "Conversación archivada";
  const isHuman = entry.human_mode;

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.id)}
      className={cn(
        CRM_FOCUS_RING,
        "group w-full rounded-2xl p-3 text-left transition",
        isActive
          ? CRM_HISTORY_ITEM.active
          : cn(CRM_HISTORY_ITEM.default, CRM_SURFACES.hover),
      )}>
      <div className="flex gap-3">
        <AvatarInitials
          name={displayName}
          color="#64748b"
          bg="rgba(100,116,139,.15)"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              {displayName}
            </p>
            <time
              dateTime={entry.resolved_at}
              className={`shrink-0 text-[11px] ${CRM_SURFACES.textMuted}`}>
              {formatCrmTime(entry.resolved_at)}
            </time>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                isHuman ? CRM_BADGE_TONES.rose : CRM_BADGE_TONES.violet,
              )}>
              {isHuman ? (
                <Headphones className="size-3" aria-hidden="true" />
              ) : (
                <Bot className="size-3" aria-hidden="true" />
              )}
              {isHuman ? "Humano" : "Bot"}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                CRM_BADGE_TONES.emerald,
              )}>
              <Archive className="size-3" aria-hidden="true" />
              Resuelta
            </span>
            <span className={`text-[10px] ${CRM_SURFACES.textMuted}`}>
              {getHistoryMessageCount(entry)} msg
            </span>
          </div>

          <p
            className={`mt-2 line-clamp-2 text-xs leading-5 ${CRM_SURFACES.textMuted} group-hover:text-slate-600 dark:group-hover:text-slate-300`}>
            {preview}
          </p>
        </div>
      </div>
    </button>
  );
};
