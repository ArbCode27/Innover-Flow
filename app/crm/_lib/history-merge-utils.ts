import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCrmResolvedLabel } from "./formatters";
import type { ConversationHistory } from "./types";

export type ExistingHistoryRecord = Pick<
  ConversationHistory,
  "id" | "total_messages" | "first_message_at" | "last_message_at" | "client_id"
>;

export const normalizeHistoryPhone = (phone: string | null | undefined) =>
  phone?.replace(/\D/g, "") ?? "";

export const phonesMatch = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const normalizedLeft = normalizeHistoryPhone(left);
  const normalizedRight = normalizeHistoryPhone(right);

  if (!normalizedLeft || !normalizedRight) return false;

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(normalizedRight) ||
    normalizedRight.endsWith(normalizedLeft)
  );
};

export const findExistingHistory = async (
  supabase: SupabaseClient,
  clientId: number | null,
  clientPhone: string | null,
  organizationId: string,
): Promise<ExistingHistoryRecord | null> => {
  if (clientId) {
    const { data, error } = await supabase
      .from("conversation_history")
      .select("id, total_messages, first_message_at, last_message_at, client_id")
      .eq("client_id", clientId)
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle<ExistingHistoryRecord>();

    if (error) throw error;
    if (data) return data;
  }

  const normalizedPhone = normalizeHistoryPhone(clientPhone);
  if (!normalizedPhone) return null;

  const { data: phoneMatches, error: phoneError } = await supabase
    .from("conversation_history")
    .select(
      "id, total_messages, first_message_at, last_message_at, client_id, client_phone",
    )
    .eq("organization_id", organizationId)
    .not("client_phone", "is", null)
    .order("id", { ascending: true });

  if (phoneError) throw phoneError;

  const match = (phoneMatches ?? []).find((entry) => {
    if (!phonesMatch(entry.client_phone, normalizedPhone)) return false;
    if (clientId && entry.client_id && entry.client_id !== clientId) return false;
    return !entry.client_id || entry.client_id === clientId;
  });

  if (!match) return null;

  return {
    id: match.id,
    total_messages: match.total_messages,
    first_message_at: match.first_message_at,
    last_message_at: match.last_message_at,
    client_id: match.client_id,
  };
};

export const getLatestTimestamp = (
  current: string | null,
  next: string | null,
) => {
  if (!current) return next;
  if (!next) return current;

  return new Date(next).getTime() >= new Date(current).getTime()
    ? next
    : current;
};

export const buildSessionDividerContent = (
  resolvedAt: string,
  resolverName: string,
) =>
  `─── Conversación resuelta el ${formatCrmResolvedLabel(resolvedAt)} por ${resolverName} ───`;

export const buildSessionDividerRow = (
  historyId: number,
  conversationId: number,
  resolvedAt: string,
  resolverName: string,
  sortAt?: string,
) => ({
  history_id: historyId,
  source_message_id: null,
  source_conversation_id: conversationId,
  type: "note" as const,
  content: buildSessionDividerContent(resolvedAt, resolverName),
  sender_type: "agent" as const,
  media_url: null,
  media_type: null,
  wa_message_id: null,
  status: null,
  created_at: sortAt ?? resolvedAt,
});

export const getSessionDividerTimestamp = (
  messageRows: Array<{ created_at: string }>,
  fallback: string,
) => {
  const firstMessageAt = messageRows[0]?.created_at ?? fallback;
  const firstTimestamp = new Date(firstMessageAt).getTime();

  if (Number.isNaN(firstTimestamp)) {
    return fallback;
  }

  return new Date(firstTimestamp - 1000).toISOString();
};

export const hasSessionDividerForConversation = async (
  supabase: SupabaseClient,
  historyId: number,
  conversationId: number,
) => {
  const { data, error } = await supabase
    .from("history_messages")
    .select("id")
    .eq("history_id", historyId)
    .eq("source_conversation_id", conversationId)
    .eq("type", "note")
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
};

export const filterDuplicateHistoryMessages = <
  T extends {
    source_message_id: number | null;
    source_conversation_id: number;
  },
>(
  rows: T[],
  existingKeys: Set<string>,
) =>
  rows.filter((row) => {
    if (row.source_message_id == null) return true;

    const key = `${row.source_conversation_id}:${row.source_message_id}`;
    return !existingKeys.has(key);
  });

export const buildExistingMessageKeys = (
  rows: Array<{
    source_message_id: number | null;
    source_conversation_id: number | null;
  }>,
) =>
  new Set(
    rows
      .filter(
        (row) =>
          row.source_message_id != null && row.source_conversation_id != null,
      )
      .map(
        (row) => `${row.source_conversation_id}:${row.source_message_id}`,
      ),
  );
