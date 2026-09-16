import type { Client, Conversation, ConversationFilter } from "./types";
import { hasUnreadMessages } from "./conversation-inbox-utils";

export type ConversationFilterCounts = Record<ConversationFilter, number>;

export interface ConversationListFilterParams {
  searchTerm: string;
  selectedLabelId: number | null;
  modeFilter: ConversationFilter;
}

const normalizeSearchQuery = (searchTerm: string) => searchTerm.trim().toLowerCase();

export const matchesConversationSearch = (
  conversation: Conversation,
  clientsById: Map<number, Client>,
  searchTerm: string,
) => {
  const query = normalizeSearchQuery(searchTerm);
  if (!query) return true;

  const client = conversation.client_id
    ? clientsById.get(conversation.client_id)
    : undefined;
  const name = client?.name || "Número desconocido";

  return (
    name.toLowerCase().includes(query) ||
    (client?.phone || "").toLowerCase().includes(query) ||
    (client?.whatsapp_id || "").toLowerCase().includes(query)
  );
};

export const matchesConversationLabel = (
  conversation: Conversation,
  selectedLabelId: number | null,
) => !selectedLabelId || conversation.label_ids.includes(selectedLabelId);

export const matchesConversationMode = (
  conversation: Conversation,
  modeFilter: ConversationFilter,
) => {
  if (modeFilter === "unread") return hasUnreadMessages(conversation);
  if (modeFilter === "bot") return !conversation.human_mode;
  if (modeFilter === "human") return conversation.human_mode;
  return true;
};

export const matchesConversationListFilters = (
  conversation: Conversation,
  clientsById: Map<number, Client>,
  params: ConversationListFilterParams,
  options: { applyModeFilter?: boolean } = {},
) => {
  const { searchTerm, selectedLabelId, modeFilter } = params;
  const applyModeFilter = options.applyModeFilter ?? true;

  if (!matchesConversationSearch(conversation, clientsById, searchTerm)) {
    return false;
  }

  if (!matchesConversationLabel(conversation, selectedLabelId)) {
    return false;
  }

  if (applyModeFilter && !matchesConversationMode(conversation, modeFilter)) {
    return false;
  }

  return true;
};

export const getConversationFilterCounts = (
  conversations: Conversation[],
  clientsById: Map<number, Client>,
  searchTerm: string,
  selectedLabelId: number | null,
): ConversationFilterCounts => {
  let all = 0;
  let unread = 0;
  let bot = 0;
  let human = 0;

  for (const conversation of conversations) {
    if (!matchesConversationSearch(conversation, clientsById, searchTerm)) {
      continue;
    }

    if (!matchesConversationLabel(conversation, selectedLabelId)) {
      continue;
    }

    all += 1;

    if (hasUnreadMessages(conversation)) {
      unread += 1;
    }

    if (conversation.human_mode) {
      human += 1;
    } else {
      bot += 1;
    }
  }

  return { all, unread, bot, human };
};

export const filterConversations = (
  conversations: Conversation[],
  clientsById: Map<number, Client>,
  params: ConversationListFilterParams,
) =>
  conversations.filter((conversation) =>
    matchesConversationListFilters(conversation, clientsById, params),
  );
