"use client";

import type { Conversation, ConversationFilter, Label } from "../_lib/types";

interface UseConversationsInput {
  conversations: Conversation[];
  labels: Label[];
  filter: ConversationFilter;
  selectedLabelId: number | null;
}

export const useConversations = ({
  conversations,
  labels,
  filter,
  selectedLabelId,
}: UseConversationsInput) => ({
  conversations,
  labels,
  filter,
  selectedLabelId,
});
