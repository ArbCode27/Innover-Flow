"use client";

import { useEffect, useRef } from "react";
import { Archive, MessageCircle } from "lucide-react";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { formatCrmResolvedLabel } from "../../_lib/formatters";
import {
  getHistoryMessageCount,
  getHistorySourceConversationId,
  groupMessagesByDay,
  historyMessageToDisplayMessage,
} from "../../_lib/history-utils";
import type { Agent, ConversationHistory, Label } from "../../_lib/types";
import { EmptyState } from "../shared/empty-state";
import { DateDivider } from "../shared/date-divider";
import { MessageBubble } from "../conversations/message-bubble";
import { LabelChip } from "../shared/label-chip";

interface HistoryMessagesProps {
  entry: ConversationHistory;
  resolvedByAgent: Agent | null;
  labels: Label[];
}

const ResolvedSessionBanner = ({
  entry,
  resolvedByAgent,
}: {
  entry: ConversationHistory;
  resolvedByAgent: Agent | null;
}) => {
  const resolverName = resolvedByAgent?.name || "Agente desconocido";
  const sourceConversationId = getHistorySourceConversationId(entry);

  return (
    <aside
      className={`rounded-2xl border px-4 py-3 text-center ${CRM_SURFACES.border} bg-emerald-50/80 dark:bg-emerald-950/20`}
      aria-label="Información de resolución">
      <div className="mx-auto flex max-w-md flex-col items-center gap-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          <Archive className="size-3.5" aria-hidden="true" />
          Historial acumulado del cliente
        </span>
        <time
          dateTime={entry.resolved_at}
          className={`text-[11px] leading-5 ${CRM_SURFACES.textMuted}`}>
          Última resolución: {formatCrmResolvedLabel(entry.resolved_at)}
        </time>
        <p className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
          Última resolución por {resolverName}
          {sourceConversationId ? ` · Sesión #${sourceConversationId}` : null}
        </p>
      </div>
    </aside>
  );
};

export const HistoryMessages = ({
  entry,
  resolvedByAgent,
  labels,
}: HistoryMessagesProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = entry.history_messages ?? [];
  const messageGroups = groupMessagesByDay(messages);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [entry.id]);

  if (!messages.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EmptyState
          icon={MessageCircle}
          title="Sin mensajes archivados"
          description={
            entry.summary?.trim()
              ? "Esta conversación se resolvió antes de guardar el historial de mensajes. Solo quedó el resumen."
              : "Esta conversación se resolvió sin mensajes guardados en el historial."
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="crm-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.05),_transparent_28rem)]">
        <article
          aria-label={`Historial de ${entry.client_name || "cliente desconocido"}`}
          className="flex flex-col gap-4 p-5">
          <ResolvedSessionBanner entry={entry} resolvedByAgent={resolvedByAgent} />

          {labels.length ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {labels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
            </div>
          ) : null}

          {messageGroups.map((group) => (
            <section
              key={group.dateKey}
              aria-labelledby={`history-messages-${entry.id}-${group.dateKey}`}
              className="flex flex-col gap-4">
              <h3 id={`history-messages-${entry.id}-${group.dateKey}`} className="sr-only">
                Mensajes del {group.label}
              </h3>
              <DateDivider label={group.label} />

              {group.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={historyMessageToDisplayMessage(message)}
                />
              ))}
            </section>
          ))}

          <div
            role="separator"
            aria-label="Fin de la conversación archivada"
            className={`flex items-center gap-3 text-[11px] ${CRM_SURFACES.textLabel}`}>
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            Fin de conversación · {getHistoryMessageCount(entry)} mensajes
            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          </div>
        </article>
      </div>
    </div>
  );
};
