"use client";

import { useEffect, useState } from "react";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { LoadingState } from "../shared/loading-state";
import { CrmLogin } from "../auth/crm-login";
import { useCrmAuth } from "../../_hooks/use-crm-auth";
import { useCrmData } from "../../_hooks/use-crm-data";
import type { Agent, CrmView } from "../../_lib/types";
import {
  getDefaultViewForAgent,
  isViewAllowed,
} from "../../_lib/crm-permissions";
import { AgentsView } from "../agents/agents-view";
import { ClientsView } from "../clients/clients-view";
import { MyConversationsView } from "../conversations/my-conversations-view";
import { ConversationsView } from "../conversations/conversations-view";
import { HistoryView } from "../history/history-view";
import { LabelsView } from "../labels/labels-view";
import { QuickRepliesView } from "../quick-replies/quick-replies-view";
import { SettingsView } from "../settings/settings-view";
import { PaymentsView } from "../payments/payments-view";
import { TicketsView } from "../tickets/tickets-view";
import { DashboardView } from "../dashboard/dashboard-view";
import { CrmAppearanceHydrator } from "./crm-appearance-hydrator";
import { CrmMobileNav, CrmSidebar } from "./crm-sidebar";
import { parseCrmAccentId, type CrmAccentId, type CrmColorMode } from "../../_lib/crm-accents";

export const CrmShell = () => {
  const [activeView, setActiveView] = useState<CrmView>("dashboard");
  const auth = useCrmAuth();
  const crm = useCrmData(auth.agent);

  useEffect(() => {
    if (!auth.agent) return;
    if (!isViewAllowed(activeView, auth.agent, auth.organizationRole)) {
      setActiveView(getDefaultViewForAgent(auth.agent, auth.organizationRole));
    }
  }, [activeView, auth.agent, auth.organizationRole]);

  if (auth.isLoading) {
    return (
      <main className={`flex h-full items-center justify-center ${CRM_SURFACES.page}`}>
        <LoadingState label="Preparando CRM..." />
      </main>
    );
  }

  if (!auth.agent) {
    return (
      <CrmLogin
        isSubmitting={auth.isSubmitting}
        onLogin={auth.login}
        onRegister={auth.register}
      />
    );
  }

  const handleSelectView = (view: CrmView) => {
    if (!isViewAllowed(view, auth.agent, auth.organizationRole)) return;
    setActiveView(view);
  };
  const handleUpdateAppearance = async (patch: {
    ui_accent?: CrmAccentId;
    ui_mode?: CrmColorMode;
    office_ui_accent?: CrmAccentId;
  }) => {
    const result = await crm.updateAppearance(patch);
    if (!result) return null;
    const latestAgent = auth.agent;
    if (!latestAgent) return result;
    const nextAgent: Agent = {
      ...latestAgent,
      ui_accent: result.ui_accent ?? latestAgent.ui_accent,
      ui_mode: result.ui_mode ?? latestAgent.ui_mode,
    };
    auth.replaceAgent(nextAgent);
    return result;
  };
  const isConversationView =
    activeView === "conversations" || activeView === "my-conversations";
  const shouldHideMobileNav =
    isConversationView && crm.selectedConversationId !== null;

  return (
    <main className={`flex h-full gap-2 overflow-hidden p-2 md:gap-3 md:p-3 ${CRM_SURFACES.page}`}>
      <CrmAppearanceHydrator
        agent={auth.agent}
        officeAccent={parseCrmAccentId(crm.settings.ui_accent)}
      />
      <CrmSidebar
        agent={auth.agent}
        organization={auth.organization}
        organizations={auth.organizations}
        organizationRole={auth.organizationRole}
        activeView={activeView}
        myAssignedCount={crm.myActiveAssignedCount}
        onSelectView={handleSelectView}
        onToggleStatus={auth.updateStatus}
        onLogout={auth.logout}
        onSwitchOrganization={auth.switchOrganization}
        onCreateOrganization={auth.createOrganization}
      />
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
          shouldHideMobileNav ? "pb-0" : "pb-24"
        } md:pb-0`}>
        {crm.isLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <LoadingState label="Conectando con Supabase..." />
          </div>
        ) : (
          <>
            {activeView === "dashboard" && isViewAllowed("dashboard", auth.agent, auth.organizationRole) ? (
              <DashboardView organization={auth.organization} />
            ) : null}
            {activeView === "conversations" && isViewAllowed("conversations", auth.agent, auth.organizationRole) ? (
              <ConversationsView
                currentAgent={auth.agent}
                conversations={crm.conversations}
                filteredConversations={crm.filteredConversations}
                clientsById={crm.clientsById}
                labelsById={crm.labelsById}
                labels={crm.labels}
                agents={crm.agents}
                ticketsByClientId={crm.ticketsByClientId}
                messages={crm.messages}
                selectedConversation={crm.selectedConversation}
                selectedClient={crm.selectedClient}
                selectedWisproSnapshot={crm.selectedWisproSnapshot}
                selectedConversationId={crm.selectedConversationId}
                isMessagesLoading={crm.isMessagesLoading}
                isSendingMessage={crm.isSendingMessage}
                isResolvingConversation={crm.isResolvingConversation}
                searchTerm={crm.searchTerm}
                conversationFilter={crm.conversationFilter}
                conversationFilterCounts={crm.conversationFilterCounts}
                selectedLabelId={crm.selectedLabelId}
                onSearchChange={crm.setSearchTerm}
                onFilterChange={crm.setConversationFilter}
                onLabelFilterChange={crm.setSelectedLabelId}
                onSelectConversation={crm.selectConversation}
                onSendMessage={crm.sendMessage}
                onSendVoiceNote={crm.sendVoiceNote}
                onSendImage={crm.sendImageMessage}
                onProcessPaymentReceipt={crm.processPaymentReceipt}
                onResendMessage={crm.resendMessage}
                quickReplies={crm.quickReplies}
                onAddNote={crm.addNote}
                onTakeControl={crm.takeControl}
                onReactivateBot={crm.reactivateBot}
                onResolve={crm.resolveConversation}
                onUpdateLabels={crm.updateLabels}
                onQuickToggleLabel={crm.quickToggleLabel}
                onAssignAgent={crm.assignAgent}
                onAssociateWispro={crm.associateWisproToConversation}
                onUnlinkWispro={crm.unlinkWisproFromClient}
                onCreatePaymentPromise={async () => {
                  await crm.createWisproPaymentPromise();
                }}
                onOpenSettingsView={handleSelectView}
              />
            ) : null}
            {activeView === "my-conversations" && isViewAllowed("my-conversations", auth.agent, auth.organizationRole) ? (
              <MyConversationsView
                currentAgent={auth.agent}
                assignedConversations={crm.myAssignedConversations}
                filteredConversations={crm.filteredMyAssignedConversations}
                clientsById={crm.clientsById}
                labelsById={crm.labelsById}
                labels={crm.labels}
                agents={crm.agents}
                ticketsByClientId={crm.ticketsByClientId}
                messages={crm.messages}
                selectedConversation={crm.selectedConversation}
                selectedClient={crm.selectedClient}
                selectedWisproSnapshot={crm.selectedWisproSnapshot}
                selectedConversationId={crm.selectedConversationId}
                isMessagesLoading={crm.isMessagesLoading}
                isSendingMessage={crm.isSendingMessage}
                isResolvingConversation={crm.isResolvingConversation}
                searchTerm={crm.myAssignedSearchTerm}
                includeResolved={crm.myAssignedIncludeResolved}
                selectedLabelId={crm.myAssignedSelectedLabelId}
                onSearchChange={crm.setMyAssignedSearchTerm}
                onIncludeResolvedChange={crm.setMyAssignedIncludeResolved}
                onLabelFilterChange={crm.setMyAssignedSelectedLabelId}
                onSelectConversation={crm.selectConversation}
                onSendMessage={crm.sendMessage}
                onSendVoiceNote={crm.sendVoiceNote}
                onSendImage={crm.sendImageMessage}
                onProcessPaymentReceipt={crm.processPaymentReceipt}
                onResendMessage={crm.resendMessage}
                quickReplies={crm.quickReplies}
                onAddNote={crm.addNote}
                onTakeControl={crm.takeControl}
                onReactivateBot={crm.reactivateBot}
                onResolve={crm.resolveConversation}
                onUpdateLabels={crm.updateLabels}
                onQuickToggleLabel={crm.quickToggleLabel}
                onAssignAgent={crm.assignAgent}
                onAssociateWispro={crm.associateWisproToConversation}
                onUnlinkWispro={crm.unlinkWisproFromClient}
                onCreatePaymentPromise={async () => {
                  await crm.createWisproPaymentPromise();
                }}
                onOpenSettingsView={handleSelectView}
              />
            ) : null}
            {activeView === "history" && isViewAllowed("history", auth.agent, auth.organizationRole) ? (
              <HistoryView
                currentAgent={auth.agent}
                agents={crm.agents}
                labels={crm.labels}
                onOpenSettingsView={handleSelectView}
              />
            ) : null}
            {activeView === "clients" && isViewAllowed("clients", auth.agent, auth.organizationRole) ? (
              <ClientsView
                clients={crm.clients}
                tickets={crm.tickets}
                onCreateClient={crm.createClient}
              />
            ) : null}
            {activeView === "payments" && isViewAllowed("payments", auth.agent, auth.organizationRole) ? (
              <PaymentsView
                currentAgent={auth.agent}
                onPaymentReviewed={async ({
                  conversationId,
                  agentId,
                  assigned,
                }) => {
                  // API already assigned → patch inbox locally (Realtime will confirm).
                  if (assigned) {
                    crm.applyConversationClaimLocally(conversationId, agentId);
                    return;
                  }
                  try {
                    await crm.claimConversationForAgent(
                      conversationId,
                      agentId,
                    );
                  } catch (assignError) {
                    console.warn(
                      "[CRM_SHELL] reinforce_assign_after_payment_failed",
                      assignError,
                    );
                  }
                }}
                onOpenClientChat={(conversationId: number) => {
                  // Navigate immediately; inbox Realtime + select keep UI fresh.
                  setActiveView("my-conversations");
                  void crm.selectConversation(conversationId);
                }}
              />
            ) : null}
            {activeView === "quick-replies" && isViewAllowed("quick-replies", auth.agent, auth.organizationRole) ? (
              <QuickRepliesView
                currentAgent={auth.agent}
                quickReplies={crm.quickReplies}
                onCreateQuickReply={crm.createQuickReply}
                onUpdateQuickReply={crm.updateQuickReply}
                onToggleQuickReplyStatus={crm.toggleQuickReplyStatus}
                onDeleteQuickReply={crm.deleteQuickReply}
              />
            ) : null}
            {activeView === "tickets" && isViewAllowed("tickets", auth.agent, auth.organizationRole) ? (
              <TicketsView
                tickets={crm.tickets}
                clients={crm.clients}
                clientsById={crm.clientsById}
                agents={crm.agents}
                onCreateTicket={crm.createTicket}
              />
            ) : null}
            {activeView === "labels" && isViewAllowed("labels", auth.agent, auth.organizationRole) ? (
              <LabelsView
                labels={crm.labels}
                conversations={crm.conversations}
                onCreateLabel={crm.createLabel}
                onDeleteLabel={crm.deleteLabel}
              />
            ) : null}
            {activeView === "agents" && isViewAllowed("agents", auth.agent, auth.organizationRole) ? (
              <AgentsView
                currentAgent={auth.agent}
                agents={crm.agents}
                conversations={crm.conversations}
                onSaveAgent={crm.upsertAgent}
                onToggleAgentStatus={crm.toggleAgentStatus}
                onDeleteAgent={crm.deleteAgent}
              />
            ) : null}
            {activeView === "settings" && auth.organization && isViewAllowed("settings", auth.agent, auth.organizationRole) ? (
              <SettingsView
                currentAgent={auth.agent}
                organization={auth.organization}
                organizationRole={auth.organizationRole}
                settings={crm.settings}
                onOrganizationUpdated={auth.replaceOrganization}
                onUpdateAiSystemPrompt={crm.updateAiSystemPrompt}
                onUpdatePaymentSuccessMessage={crm.updatePaymentSuccessMessage}
                onUpdateAiRecoveryMessages={crm.updateAiRecoveryMessages}
                onUpdateOfficeHours={crm.updateOfficeHoursSettings}
                onUpdateAppearance={handleUpdateAppearance}
              />
            ) : null}
          </>
        )}
      </div>
      {!shouldHideMobileNav ? (
        <CrmMobileNav
          agent={auth.agent}
          organizationRole={auth.organizationRole}
          activeView={activeView}
          myAssignedCount={crm.myActiveAssignedCount}
          onSelectView={handleSelectView}
        />
      ) : null}
    </main>
  );
};
