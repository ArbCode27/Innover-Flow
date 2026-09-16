"use client";

import { Bot, CheckCircle2, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getConversationActivityTimestamp,
  getUnreadCount,
  hasUnreadMessages,
} from "../../_lib/conversation-inbox-utils";
import type { Client, Conversation, Label } from "../../_lib/types";
import { formatCrmTime } from "../../_lib/formatters";
import { CRM_BADGE_TONES, CRM_FOCUS_RING, CRM_INBOX_ITEM, CRM_SURFACES } from "../../_lib/crm-theme";
import { AvatarInitials } from "../shared/avatar-initials";
import { LabelChip } from "../shared/label-chip";
import { StatusBadge } from "../shared/status-badge";
import { UnreadCountBadge } from "../shared/unread-count-badge";

interface ConversationListItemProps {
  conversation: Conversation;
  client: Client | null;
  labels: Label[];
  isActive: boolean;
  onSelect: (id: number) => void;
}

export const ConversationListItem = ({
  conversation,
  client,
  labels,
  isActive,
  onSelect,
}: ConversationListItemProps) => {
  const displayName =
    client?.name || conversation.customer_phone || "Número desconocido";
  const isResolved = conversation.status === "resuelto";
  const isHuman = conversation.human_mode;
  const preview = conversation.preview || "Sin mensajes";
  const unreadCount = getUnreadCount(conversation);
  const hasUnread = hasUnreadMessages(conversation);
  const activityTimestamp = getConversationActivityTimestamp(conversation);
  const agentControlName = conversation.agent_control?.trim() || null;
  const shouldShowStatusBadge = conversation.status !== "abierto";

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-label={
        hasUnread
          ? `${displayName}, ${unreadCount} mensajes sin leer`
          : displayName
      }
      className={cn(
        CRM_FOCUS_RING,
        "group w-full rounded-2xl p-3 text-left transition",
        isActive
          ? CRM_INBOX_ITEM.active
          : hasUnread
            ? CRM_INBOX_ITEM.unread
            : cn(CRM_INBOX_ITEM.default, CRM_SURFACES.hover),
      )}>
      <div className="flex gap-3">
        <AvatarInitials
          name={displayName}
          initials={client?.initials}
          color={client?.color || "#f5a524"}
          bg={client?.bg || "rgba(245,165,36,.15)"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm",
                hasUnread || isActive
                  ? `font-semibold ${CRM_SURFACES.textPrimary}`
                  : `font-medium ${CRM_SURFACES.textPrimary}`,
              )}>
              {displayName}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "text-[11px]",
                  hasUnread
                    ? "font-semibold text-amber-700 dark:text-amber-300"
                    : CRM_SURFACES.textMuted,
                )}>
                {formatCrmTime(activityTimestamp || conversation.updated_at)}
              </span>
              <UnreadCountBadge count={unreadCount} />
            </div>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
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
            {isResolved ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  CRM_BADGE_TONES.emerald,
                )}>
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Resuelto
              </span>
            ) : shouldShowStatusBadge ? (
              <StatusBadge status={conversation.status} />
            ) : null}
            {agentControlName ? (
              <span
                className={cn(
                  "inline-flex max-w-[9rem] items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  CRM_BADGE_TONES.slate,
                )}
                title={agentControlName}>
                <span className="truncate">{agentControlName}</span>
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-2 line-clamp-2 text-xs leading-5",
              hasUnread
                ? "font-medium text-slate-700 dark:text-slate-200"
                : `${CRM_SURFACES.textMuted} group-hover:text-slate-600 dark:group-hover:text-slate-300`,
            )}>
            {preview}
          </p>
        </div>
      </div>

      {labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1 pl-12">
          {labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      ) : null}
    </button>
  );
};
