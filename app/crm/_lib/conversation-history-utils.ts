import type { ConversationHistory, HistoryMessage } from "./types";

type RawConversationHistory = ConversationHistory & {
  history_messages?: HistoryMessage[] | null;
};

export const normalizeConversationHistoryEntry = (
  entry: RawConversationHistory,
): ConversationHistory => {
  const historyMessages = [...(entry.history_messages ?? [])].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const { history_messages: _historyMessages, ...rest } = entry;

  return {
    ...rest,
    label_ids: rest.label_ids || [],
    human_mode: Boolean(rest.human_mode),
    history_messages: historyMessages,
    total_messages: Math.max(rest.total_messages ?? 0, historyMessages.length),
  };
};
