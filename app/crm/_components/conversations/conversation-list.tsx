"use client";

import { MessageCircle } from "lucide-react";
import type { Client, Conversation, Label } from "../../_lib/types";
import { EmptyState } from "../shared/empty-state";
import { ConversationListItem } from "./conversation-list-item";

interface ConversationListProps {
  conversations: Conversation[];
  clientsById: Map<number, Client>;
  labelsById: Map<number, Label>;
  selectedConversationId: number | null;
  onSelect: (id: number) => void;
}

export const ConversationList = ({
  conversations,
  clientsById,
  labelsById,
  selectedConversationId,
  onSelect,
}: ConversationListProps) => {
  if (!conversations.length) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Sin conversaciones"
        description="No hay conversaciones con los filtros actuales."
      />
    );
  }

  return (
    <div className="crm-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {conversations.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          client={
            conversation.client_id
              ? clientsById.get(conversation.client_id) || null
              : null
          }
          labels={conversation.label_ids
            .map((id) => labelsById.get(id))
            .filter((label): label is Label => Boolean(label))}
          isActive={selectedConversationId === conversation.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};
