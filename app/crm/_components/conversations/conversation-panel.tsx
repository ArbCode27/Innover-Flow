"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { CrmButton } from "../shared/crm-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import { getManualPaymentBlockReason } from "../../_lib/client-profile-utils";
import type { Agent, Client, Conversation, Label, Message, QuickReply, Ticket, WisproCustomer, WisproSearchResult } from "../../_lib/types";
import { AssignAgentDialog } from "../agents/assign-agent-dialog";
import { LabelPickerDialog } from "../labels/label-picker-dialog";
import { UnknownClientBanner } from "../wispro/unknown-client-banner";
import { WisproSearchDialog } from "../wispro/wispro-search-dialog";
import { ResolveConversationDialog } from "./resolve-conversation-dialog";
import { ConversationDetails } from "./conversation-details";
import { ConversationHeader } from "./conversation-header";
import { ConversationMessages } from "./conversation-messages";
import { ConversationWelcomePanel } from "./conversation-welcome-panel";
import { MessageComposer } from "./message-composer";

interface ConversationPanelProps {
  conversation: Conversation | null;
  client: Client | null;
  wisproSnapshot?: WisproCustomer | null;
  allLabels: Label[];
  quickReplies: QuickReply[];
  messages: Message[];
  agents: Agent[];
  conversations: Conversation[];
  currentAgent: Agent;
  tickets: Ticket[];
  isMessagesLoading: boolean;
  isSendingMessage: boolean;
  isResolvingConversation?: boolean;
  onBackToList?: () => void;
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
}

export const ConversationPanel = ({
  conversation,
  client,
  wisproSnapshot,
  allLabels,
  quickReplies,
  messages,
  agents,
  conversations,
  currentAgent,
  tickets,
  isMessagesLoading,
  isSendingMessage,
  isResolvingConversation = false,
  onBackToList,
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
}: ConversationPanelProps) => {
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isWisproDialogOpen, setIsWisproDialogOpen] = useState(false);
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false);
  const [isUnlinkingWispro, setIsUnlinkingWispro] = useState(false);
  const [isPromiseDialogOpen, setIsPromiseDialogOpen] = useState(false);
  const [isCreatingPaymentPromise, setIsCreatingPaymentPromise] = useState(false);
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [isDetailsSheetOpen, setIsDetailsSheetOpen] = useState(false);
  const [note, setNote] = useState("");

  const clientDisplayName = client?.name || "Número desconocido";
  const isWisproLinked = Boolean(client?.wispro_id);
  const wisproDialogMode = isWisproLinked ? "relink" : "link";
  const manualPaymentBlockReason = getManualPaymentBlockReason(client);

  if (!conversation) {
    return (
      <ConversationWelcomePanel
        conversations={conversations}
        labels={allLabels}
        currentAgent={currentAgent}
      />
    );
  }

  const handleSendMessage = async (content: string) => {
    try {
      await onSendMessage(content);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el mensaje");
      throw error;
    }
  };

  const handleSubmitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = note.trim();
    if (!content) return;

    await onAddNote(content);
    setNote("");
    setIsNoteDialogOpen(false);
  };

  const handleAssignAgent = async (agentId: number) => {
    await onAssignAgent(conversation.id, agentId);
  };

  const handleAssociateWispro = async (result: WisproSearchResult) => {
    await onAssociateWispro(result);
  };

  const handleConfirmUnlinkWispro = async () => {
    setIsUnlinkingWispro(true);
    try {
      await onUnlinkWispro();
      setIsUnlinkDialogOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo desvincular Wispro",
      );
    } finally {
      setIsUnlinkingWispro(false);
    }
  };

  const handleConfirmPaymentPromise = async () => {
    setIsCreatingPaymentPromise(true);
    try {
      await onCreatePaymentPromise();
      setIsPromiseDialogOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo crear la promesa de pago",
      );
    } finally {
      setIsCreatingPaymentPromise(false);
    }
  };

  const handleSendVoiceNote = async (
    audioBlob: Blob,
    meta: { durationMs: number; mimeType: string },
  ) => {
    try {
      await onSendVoiceNote(audioBlob, meta);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la nota de voz",
      );
      throw error;
    }
  };

  const handleSendImage = async (imageFile: File, caption?: string) => {
    try {
      await onSendImage(imageFile, caption);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la imagen",
      );
      throw error;
    }
  };

  const showUnknownBanner = !client || !client.wispro_id;

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader
          conversation={conversation}
          client={client}
          currentAgent={currentAgent}
          onOpenDetails={() => setIsDetailsSheetOpen(true)}
          onBackToList={onBackToList}
          onOpenLabels={() => setIsLabelDialogOpen(true)}
          onTakeControl={onTakeControl}
          onReactivateBot={onReactivateBot}
          onResolve={() => setIsResolveDialogOpen(true)}
          isResolving={isResolvingConversation}
          onOpenNote={() => setIsNoteDialogOpen(true)}
          onOpenAssign={() => setIsAssignDialogOpen(true)}
        />
        {showUnknownBanner ? (
          <UnknownClientBanner onOpenWispro={() => setIsWisproDialogOpen(true)} />
        ) : null}
        <ConversationMessages
          messages={messages}
          isLoading={isMessagesLoading}
          onProcessPaymentReceipt={onProcessPaymentReceipt}
          onResendMessage={onResendMessage}
          canRegisterManualPayment={!manualPaymentBlockReason}
          manualPaymentBlockReason={manualPaymentBlockReason}
        />
        <MessageComposer
          disabled={isSendingMessage}
          readOnly={!conversation.human_mode}
          placeholder={
            conversation.human_mode
              ? "Responde como agente..."
              : "Toma control de la conversación para responder..."
          }
          onSend={handleSendMessage}
          onSendVoiceNote={handleSendVoiceNote}
          onSendImage={handleSendImage}
          quickReplies={quickReplies}
        />
      </div>
      <Sheet open={isDetailsSheetOpen} onOpenChange={setIsDetailsSheetOpen}>
        <SheetContent className={`inset-y-2 right-2 h-auto w-[min(88vw,24rem)] rounded-3xl border-0 p-0 sm:max-w-sm ${CRM_SURFACES.elevatedTranslucent} ${CRM_SURFACES.textPrimary}`}>
          <SheetHeader className={`border-b p-4 text-left ${CRM_SURFACES.border}`}>
            <SheetTitle className={CRM_SURFACES.textPrimary}>Ficha de conversación</SheetTitle>
            <SheetDescription className={CRM_SURFACES.textMuted}>
              Cliente, etiquetas, tickets y agentes disponibles.
            </SheetDescription>
          </SheetHeader>
          <ConversationDetails
            conversation={conversation}
            client={client}
            wisproSnapshot={wisproSnapshot}
            labels={allLabels}
            tickets={tickets}
            agents={agents}
            className="block h-full w-full border-l-0 bg-transparent lg:hidden"
            onToggleLabel={onQuickToggleLabel}
            onOpenWispro={() => setIsWisproDialogOpen(true)}
            onUnlinkWispro={
              isWisproLinked ? () => setIsUnlinkDialogOpen(true) : undefined
            }
            isUnlinkingWispro={isUnlinkingWispro}
            onCreatePaymentPromise={
              isWisproLinked ? () => setIsPromiseDialogOpen(true) : undefined
            }
            isCreatingPaymentPromise={isCreatingPaymentPromise}
          />
        </SheetContent>
      </Sheet>
      <ConversationDetails
        conversation={conversation}
        client={client}
        wisproSnapshot={wisproSnapshot}
        labels={allLabels}
        tickets={tickets}
        agents={agents}
        onToggleLabel={onQuickToggleLabel}
        onOpenWispro={() => setIsWisproDialogOpen(true)}
        onUnlinkWispro={
          isWisproLinked ? () => setIsUnlinkDialogOpen(true) : undefined
        }
        isUnlinkingWispro={isUnlinkingWispro}
        onCreatePaymentPromise={
          isWisproLinked ? () => setIsPromiseDialogOpen(true) : undefined
        }
        isCreatingPaymentPromise={isCreatingPaymentPromise}
      />

      <WisproSearchDialog
        open={isWisproDialogOpen}
        onOpenChange={setIsWisproDialogOpen}
        onAssociate={handleAssociateWispro}
        mode={wisproDialogMode}
        currentLink={
          client
            ? {
                name: client.name,
                cedula: wisproSnapshot?.national_identification_number,
                wisproSnapshot,
              }
            : null
        }
      />

      <AlertDialog
        open={isUnlinkDialogOpen}
        onOpenChange={(open) => {
          if (!isUnlinkingWispro) setIsUnlinkDialogOpen(open);
        }}>
        <AlertDialogContent className={CRM_DIALOG}>
          <AlertDialogHeader>
            <AlertDialogTitle className={CRM_SURFACES.textPrimary}>
              ¿Desvincular de Wispro?
            </AlertDialogTitle>
            <AlertDialogDescription className={CRM_SURFACES.textMuted}>
              Se quitará la ficha Wispro de{" "}
              <span className={`font-medium ${CRM_SURFACES.textPrimary}`}>
                {clientDisplayName}
              </span>
              . El chat de WhatsApp se mantiene y podrás vincular otra cédula
              después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnlinkingWispro}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isUnlinkingWispro}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmUnlinkWispro();
              }}
              className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500">
              {isUnlinkingWispro ? "Desvinculando..." : "Desvincular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isPromiseDialogOpen}
        onOpenChange={(open) => {
          if (!isCreatingPaymentPromise) setIsPromiseDialogOpen(open);
        }}>
        <AlertDialogContent className={CRM_DIALOG}>
          <AlertDialogHeader>
            <AlertDialogTitle className={CRM_SURFACES.textPrimary}>
              ¿Crear promesa de pago (48h)?
            </AlertDialogTitle>
            <AlertDialogDescription className={CRM_SURFACES.textMuted}>
              Se creará una promesa de pago en Wispro para{" "}
              <span className={`font-medium ${CRM_SURFACES.textPrimary}`}>
                {clientDisplayName}
              </span>
              , válida por 48 horas, solo si el servicio está suspendido. Si el
              servicio está activo, no se crea. El cliente no recibirá ningún
              mensaje de WhatsApp sobre esta acción.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreatingPaymentPromise}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isCreatingPaymentPromise}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmPaymentPromise();
              }}>
              {isCreatingPaymentPromise ? "Creando..." : "Crear promesa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LabelPickerDialog
        open={isLabelDialogOpen}
        labels={allLabels}
        selectedLabelIds={conversation.label_ids}
        onOpenChange={setIsLabelDialogOpen}
        onSave={onUpdateLabels}
      />

      <AssignAgentDialog
        open={isAssignDialogOpen}
        agents={agents}
        conversations={conversations}
        onOpenChange={setIsAssignDialogOpen}
        onAssign={handleAssignAgent}
      />

      <ResolveConversationDialog
        open={isResolveDialogOpen}
        onOpenChange={setIsResolveDialogOpen}
        clientName={clientDisplayName}
        isSubmitting={isResolvingConversation}
        onConfirm={onResolve}
      />

      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className={CRM_DIALOG}>
          <form onSubmit={handleSubmitNote}>
            <DialogHeader>
              <DialogTitle>Nota interna</DialogTitle>
            </DialogHeader>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Solo visible para agentes"
              className={`mt-4 min-h-28 ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
            />
            <DialogFooter className="mt-4">
              <CrmButton
                type="button"
                variant="secondary"
                onClick={() => setIsNoteDialogOpen(false)}>
                Cancelar
              </CrmButton>
              <CrmButton type="submit">Agregar nota</CrmButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};
