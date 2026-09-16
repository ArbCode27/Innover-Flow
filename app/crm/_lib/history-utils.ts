import { formatCrmDayLabel, getCrmDateKey, groupMessagesByDay } from "./formatters";
import type { ConversationHistory, HistoryMessage, Message } from "./types";

export interface HistoryDateGroup {
  dateKey: string;
  label: string;
  entries: ConversationHistory[];
}

export type { MessageDayGroupOf as MessageDayGroup } from "./formatters";
export { groupMessagesByDay };

export const getHistoryMessageCount = (entry: ConversationHistory) =>
  entry.history_messages?.length ?? entry.total_messages ?? 0;

export const getHistorySourceConversationId = (entry: ConversationHistory) =>
  entry.history_messages?.find((message) => message.source_conversation_id)
    ?.source_conversation_id ?? null;

export const historyMessageToDisplayMessage = (
  message: HistoryMessage,
): Message => ({
  conversation_id: message.source_conversation_id ?? 0,
  id: message.source_message_id ?? message.id,
  type: message.type,
  content: message.content,
  sender_type: message.sender_type,
  sent_by: message.sent_by,
  media_url: message.media_url,
  media_type: message.media_type,
  latitude: message.latitude,
  longitude: message.longitude,
  location_name: message.location_name,
  location_address: message.location_address,
  wa_message_id: message.wa_message_id,
  status: message.status,
  created_at: message.created_at,
});

export const groupHistoryByResolvedDate = (
  entries: ConversationHistory[],
): HistoryDateGroup[] => {
  const groups = new Map<string, HistoryDateGroup>();

  for (const entry of entries) {
    const dateKey = getCrmDateKey(entry.resolved_at);
    const existing = groups.get(dateKey);

    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    groups.set(dateKey, {
      dateKey,
      label: formatCrmDayLabel(entry.resolved_at),
      entries: [entry],
    });
  }

  return Array.from(groups.values());
};

export const matchesHistorySearch = (
  entry: ConversationHistory,
  searchTerm: string,
) => {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return true;

  const fields = [
    entry.client_name,
    entry.client_phone,
    entry.client_plan,
    entry.client_zone,
    entry.summary,
    String(getHistorySourceConversationId(entry) ?? ""),
  ];

  if (fields.some((field) => field?.toLowerCase().includes(normalized))) {
    return true;
  }

  return (entry.history_messages ?? []).some((message) =>
    message.content.toLowerCase().includes(normalized),
  );
};
