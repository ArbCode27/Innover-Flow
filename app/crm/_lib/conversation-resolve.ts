import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agent, Client, Conversation, Message } from "./types";
import {
  formatArchiveStepError,
  normalizeHistoryMessageContent,
  normalizeMessageForHistory,
} from "./history-message-normalize";
import {
  buildExistingMessageKeys,
  buildSessionDividerRow,
  filterDuplicateHistoryMessages,
  findExistingHistory,
  getLatestTimestamp,
  getSessionDividerTimestamp,
  hasSessionDividerForConversation,
  type ExistingHistoryRecord,
} from "./history-merge-utils";

type HistoryMessageInsert = {
  organization_id: string;
  history_id: number;
  source_message_id: number | null;
  source_conversation_id: number;
  type: Message["type"];
  content: string;
  sender_type: Message["sender_type"];
  media_url: string | null;
  media_type: Message["media_type"] | null;
  wa_message_id: string | null;
  status: Message["status"] | null;
  created_at: string;
};

const buildClientSnapshot = (client: Client | null) => ({
  client_name: client?.name ?? null,
  client_phone: client?.phone ?? null,
  client_plan: client?.plan ?? null,
  client_zone: client?.zone ?? null,
  client_account: client?.account ?? null,
});

const getMessageStats = (messages: Message[]) => {
  if (!messages.length) {
    return {
      total_messages: 0,
      first_message_at: null as string | null,
      last_message_at: null as string | null,
    };
  }

  const sorted = [...messages].sort(
    (a, b) =>
      new Date(a.created_at || 0).getTime() -
      new Date(b.created_at || 0).getTime(),
  );

  return {
    total_messages: messages.length,
    first_message_at: sorted[0]?.created_at ?? null,
    last_message_at: sorted[sorted.length - 1]?.created_at ?? null,
  };
};

const buildHistoryMessageRows = (
  historyId: number,
  conversationId: number,
  organizationId: string,
  messages: Message[],
  fallbackPreview: string | null,
  fallbackCreatedAt: string | null,
): HistoryMessageInsert[] => {
  if (messages.length) {
    return messages.map((message) => {
      const normalized = normalizeMessageForHistory(message);

      return {
        organization_id: organizationId,
        history_id: historyId,
        source_message_id: message.id,
        source_conversation_id: conversationId,
        ...normalized,
      };
    });
  }

  const preview = normalizeHistoryMessageContent(fallbackPreview);
  if (!preview) return [];

  return [
    {
      organization_id: organizationId,
      history_id: historyId,
      source_message_id: null,
      source_conversation_id: conversationId,
      type: "in",
      content: preview,
      sender_type: "client",
      media_url: null,
      media_type: null,
      wa_message_id: null,
      status: null,
      created_at: fallbackCreatedAt ?? new Date().toISOString(),
    },
  ];
};

const insertHistoryMessages = async (
  supabase: SupabaseClient,
  historyId: number,
  rows: HistoryMessageInsert[],
) => {
  if (!rows.length) return;

  const { error } = await supabase
    .from("history_messages")
    .insert(rows as never[]);

  if (error) {
    console.error("history_messages insert:", error);
    throw new Error(
      formatArchiveStepError(
        "el archivado de mensajes en history_messages",
        historyId,
        error,
      ),
    );
  }
};

const createHistoryRecord = async (
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
) => {
  const { data, error } = await supabase
    .from("conversation_history")
    .insert(payload)
    .select("id, total_messages, first_message_at, last_message_at, client_id")
    .single<ExistingHistoryRecord>();

  if (error) throw error;
  return data;
};

const updateHistoryRecord = async (
  supabase: SupabaseClient,
  historyId: number,
  payload: Record<string, unknown>,
) => {
  const { error } = await supabase
    .from("conversation_history")
    .update(payload)
    .eq("id", historyId);

  if (error) throw error;
};

const getResolverName = async (
  supabase: SupabaseClient,
  resolvedBy: number,
) => {
  const { data, error } = await supabase
    .from("agents")
    .select("name")
    .eq("id", resolvedBy)
    .maybeSingle<Pick<Agent, "name">>();

  if (error) throw error;
  return data?.name ?? "Agente";
};

export const archiveConversationSequential = async (
  supabase: SupabaseClient,
  conversationId: number,
  resolvedBy: number,
): Promise<number> => {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle<Conversation>();

  if (conversationError) throw conversationError;
  if (!conversation) {
    throw new Error("La conversación no existe");
  }

  let client: Client | null = null;

  if (conversation.client_id) {
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", conversation.client_id)
      .maybeSingle<Client>();

    if (clientError) throw clientError;
    client = clientData;
  }

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at");

  if (messagesError) throw messagesError;

  const messageList = (messages || []) as Message[];
  const clientSnapshot = buildClientSnapshot(client);
  const fallbackCreatedAt =
    conversation.last_message_at ?? conversation.updated_at ?? null;
  const provisionalStats = getMessageStats(messageList);
  const hasFallbackPreview =
    !messageList.length && Boolean(conversation.preview?.trim());
  const sessionStats = hasFallbackPreview
    ? {
        total_messages: 1,
        first_message_at: fallbackCreatedAt,
        last_message_at: fallbackCreatedAt,
      }
    : provisionalStats;

  const resolvedAt = new Date().toISOString();
  const existingHistory = await findExistingHistory(
    supabase,
    conversation.client_id,
    clientSnapshot.client_phone,
    conversation.organization_id,
  );

  const historyPayload = {
    organization_id: conversation.organization_id,
    client_id: conversation.client_id,
    agent_id: conversation.agent_id,
    ...clientSnapshot,
    resolved_at: resolvedAt,
    resolved_by: resolvedBy,
    human_mode: Boolean(conversation.human_mode),
    label_ids: conversation.label_ids || [],
    wa_phone_number_id: conversation.wa_phone_number_id ?? null,
    summary: conversation.preview,
  };

  let history: ExistingHistoryRecord;

  if (existingHistory) {
    history = existingHistory;

    await updateHistoryRecord(supabase, history.id, {
      ...historyPayload,
      client_id: conversation.client_id ?? existingHistory.client_id,
      first_message_at: history.first_message_at ?? sessionStats.first_message_at,
      last_message_at: getLatestTimestamp(
        history.last_message_at,
        sessionStats.last_message_at,
      ),
    });
  } else {
    try {
      history = await createHistoryRecord(supabase, {
        ...historyPayload,
        total_messages: 0,
        first_message_at: sessionStats.first_message_at,
        last_message_at: sessionStats.last_message_at,
      });
    } catch (createError) {
      const errorRecord =
        createError && typeof createError === "object"
          ? (createError as { code?: string })
          : null;

      if (errorRecord?.code !== "23505" || !conversation.client_id) {
        throw createError;
      }

      const racedHistory = await findExistingHistory(
        supabase,
        conversation.client_id,
        clientSnapshot.client_phone,
        conversation.organization_id,
      );

      if (!racedHistory) throw createError;

      history = racedHistory;
      await updateHistoryRecord(supabase, history.id, {
        ...historyPayload,
        first_message_at: history.first_message_at ?? sessionStats.first_message_at,
        last_message_at: getLatestTimestamp(
          history.last_message_at,
          sessionStats.last_message_at,
        ),
      });
    }
  }

  const baseMessageRows = buildHistoryMessageRows(
    history.id,
    conversation.id,
    conversation.organization_id,
    messageList,
    conversation.preview,
    fallbackCreatedAt,
  );

  const { data: existingMessages, error: existingMessagesError } =
    await supabase
      .from("history_messages")
      .select("source_message_id, source_conversation_id")
      .eq("history_id", history.id);

  if (existingMessagesError) throw existingMessagesError;

  const rowsToInsert = filterDuplicateHistoryMessages(
    baseMessageRows,
    buildExistingMessageKeys(existingMessages ?? []),
  );

  const alreadyHasSessionDivider = await hasSessionDividerForConversation(
    supabase,
    history.id,
    conversation.id,
  );

  const shouldAddSessionDivider =
    rowsToInsert.length > 0 && !alreadyHasSessionDivider;

  if (shouldAddSessionDivider) {
    const resolverName = await getResolverName(supabase, resolvedBy);
    const dividerTimestamp = getSessionDividerTimestamp(
      rowsToInsert,
      sessionStats.first_message_at ?? resolvedAt,
    );

    await insertHistoryMessages(supabase, history.id, [
      {
        organization_id: conversation.organization_id,
        ...buildSessionDividerRow(
          history.id,
          conversation.id,
          resolvedAt,
          resolverName,
          dividerTimestamp,
        ),
      },
    ]);
  }

  await insertHistoryMessages(supabase, history.id, rowsToInsert);

  const appendedCount = rowsToInsert.length + (shouldAddSessionDivider ? 1 : 0);

  if (appendedCount > 0) {
    await updateHistoryRecord(supabase, history.id, {
      total_messages: history.total_messages + appendedCount,
    });
  }

  const { error: deleteMessagesError } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId);

  if (deleteMessagesError) {
    console.error("delete active messages:", deleteMessagesError);
    throw new Error(
      formatArchiveStepError(
        "la eliminación de mensajes activos",
        history.id,
        deleteMessagesError,
      ),
    );
  }

  const { error: deleteConversationError } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (deleteConversationError) {
    console.error("delete conversation:", deleteConversationError);
    throw new Error(
      formatArchiveStepError(
        "la eliminación de la conversación activa",
        history.id,
        deleteConversationError,
      ),
    );
  }

  return history.id;
};

export const archiveAndDeleteConversation = async (
  supabase: SupabaseClient,
  conversationId: number,
  resolvedBy: number,
): Promise<number> =>
  archiveConversationSequential(supabase, conversationId, resolvedBy);
