"use client";

import { Inbox } from "lucide-react";
import type {
  Agent,
  Client,
  Conversation,
  CrmView,
  Label,
  Message,
  QuickReply,
  Ticket,
  WisproCustomer,
  WisproSearchResult,
} from "../../_lib/types";
import { CRM_PANEL, CRM_SURFACES } from "../../_lib/crm-theme";
import { EmptyState } from "../shared/empty-state";
import { CrmMobileSettingsMenu } from "../shell/crm-mobile-settings-menu";
import { CrmThemeToggle } from "../shell/crm-theme-toggle";
import { ConversationList } from "./conversation-list";
import { ConversationPanel } from "./conversation-panel";
import { MyConversationsFilters } from "./my-conversations-filters";

interface MyConversationsViewProps {
  currentAgent: Agent;
  assignedConversations: Conversation[];
  filteredConversations: Conversation[];
  clientsById: Map<number, Client>;
  labelsById: Map<number, Label>;
  labels: Label[];
  quickReplies: QuickReply[];
  agents: Agent[];
  ticketsByClientId: Map<number, Ticket[]>;
  messages: Message[];
  selectedConversation: Conversation | null;
  selectedClient: Client | null;
  selectedWisproSnapshot: WisproCustomer | null;
  selectedConversationId: number | null;
  isMessagesLoading: boolean;
  isSendingMessage: boolean;
  isResolvingConversation?: boolean;
  searchTerm: string;
  includeResolved: boolean;
  selectedLabelId: number | null;
  onSearchChange: (value: string) => void;
  onIncludeResolvedChange: (value: boolean) => void;
  onLabelFilterChange: (value: number | null) => void;
  onSelectConversation: (id: number | null) => void;
  onSendMessage: (content: string) => Promise<void>;
  onSendVoiceNote: (
    audioBlob: Blob,
    meta: { durationMs: number; mimeType: string },
  ) => Promise<void>;
  onSendImage: (imageFile: File, caption?: string) => Promise<void>;
  onProcessPaymentReceipt: (messageId: number) => Promise<void>;
  onResendMessage: (messageId: number) => Promise<void>;
  onAddNote: (content: string) => Promise<void>;
  onTakeControl: () => Promise<void>;
  onReactivateBot: () => Promise<void>;
  onResolve: () => Promise<void>;
  onUpdateLabels: (labelIds: number[]) => Promise<void>;
  onQuickToggleLabel: (labelId: number) => Promise<void>;
  onAssignAgent: (conversationId: number, agentId: number) => Promise<void>;
  onAssociateWispro: (result: WisproSearchResult) => Promise<void>;
  onUnlinkWispro: () => Promise<void>;
  onCreatePaymentPromise: () => Promise<void>;
  onOpenSettingsView: (view: CrmView) => void;
}

export const MyConversationsView = ({
  currentAgent,
  assignedConversations,
  filteredConversations,
  clientsById,
  labelsById,
  labels,
  quickReplies,
  agents,
  ticketsByClientId,
  messages,
  selectedConversation,
  selectedClient,
  selectedWisproSnapshot,
  selectedConversationId,
  isMessagesLoading,
  isSendingMessage,
  isResolvingConversation,
  searchTerm,
  includeResolved,
  selectedLabelId,
  onSearchChange,
  onIncludeResolvedChange,
  onLabelFilterChange,
  onSelectConversation,
  onSendMessage,
  onSendVoiceNote,
  onSendImage,
  onProcessPaymentReceipt,
  onResendMessage,
  onAddNote,
  onTakeControl,
  onReactivateBot,
  onResolve,
  onUpdateLabels,
  onQuickToggleLabel,
  onAssignAgent,
  onAssociateWispro,
  onUnlinkWispro,
  onCreatePaymentPromise,
  onOpenSettingsView,
}: MyConversationsViewProps) => {
  const selectedTickets =
    selectedConversation?.client_id
      ? ticketsByClientId.get(selectedConversation.client_id) || []
      : [];

  const scopeConversations = includeResolved
    ? assignedConversations
    : assignedConversations.filter(
        (conversation) => conversation.status !== "resuelto",
      );
  const isConversationOpen = selectedConversationId !== null;

  return (
    <div className="flex min-h-0 flex-1 gap-2 md:gap-3">
      <aside
        className={`${
          isConversationOpen ? "hidden md:flex" : "flex"
        } min-h-0 w-full shrink-0 flex-col md:w-80 ${CRM_PANEL}`}>
        <div className={`border-b p-4 ${CRM_SURFACES.border}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              Mis asignadas
            </h2>
            <div className="flex items-center gap-1 md:hidden">
              <CrmThemeToggle className="size-8" />
              <CrmMobileSettingsMenu onSelectView={onOpenSettingsView} />
            </div>
          </div>
          <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
            {filteredConversations.length} de {scopeConversations.length}{" "}
            {includeResolved ? "asignadas" : "activas"}
            {selectedLabelId !== null ? " · filtro de etiqueta" : ""}
          </p>
        </div>

        <MyConversationsFilters
          searchTerm={searchTerm}
          includeResolved={includeResolved}
          labels={labels}
          selectedLabelId={selectedLabelId}
          onSearchChange={onSearchChange}
          onIncludeResolvedChange={onIncludeResolvedChange}
          onLabelChange={onLabelFilterChange}
        />

        {assignedConversations.length ? (
          <ConversationList
            conversations={filteredConversations}
            clientsById={clientsById}
            labelsById={labelsById}
            selectedConversationId={selectedConversationId}
            onSelect={onSelectConversation}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="No tienes conversaciones asignadas"
            description="Cuando un administrador te asigne chats, aparecerán aquí."
          />
        )}
      </aside>

      <div
        className={`${
          isConversationOpen ? "flex" : "hidden md:flex"
        } min-h-0 min-w-0 flex-1 ${CRM_PANEL}`}>
        <ConversationPanel
          conversation={selectedConversation}
          client={selectedClient}
          wisproSnapshot={selectedWisproSnapshot}
          allLabels={labels}
          quickReplies={quickReplies}
          messages={messages}
          agents={agents}
          conversations={assignedConversations}
          currentAgent={currentAgent}
          tickets={selectedTickets}
          isMessagesLoading={isMessagesLoading}
          isSendingMessage={isSendingMessage}
          isResolvingConversation={isResolvingConversation}
          onSendMessage={onSendMessage}
          onSendVoiceNote={onSendVoiceNote}
          onSendImage={onSendImage}
          onProcessPaymentReceipt={onProcessPaymentReceipt}
          onResendMessage={onResendMessage}
          onBackToList={() => onSelectConversation(null)}
          onAddNote={onAddNote}
          onTakeControl={onTakeControl}
          onReactivateBot={onReactivateBot}
          onResolve={onResolve}
          onUpdateLabels={onUpdateLabels}
          onQuickToggleLabel={onQuickToggleLabel}
          onAssignAgent={onAssignAgent}
          onAssociateWispro={onAssociateWispro}
          onUnlinkWispro={onUnlinkWispro}
          onCreatePaymentPromise={onCreatePaymentPromise}
        />
      </div>
    </div>
  );
};
