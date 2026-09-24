"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { crmService } from "../_lib/crm-service";
import { getSupabaseClient } from "../_lib/supabase";
import {
  filterConversations,
  getConversationFilterCounts,
  matchesConversationLabel,
  matchesConversationSearch,
} from "../_lib/conversation-filter-utils";
import { resolveRecipientPhone } from "../_lib/conversation-recipient";
import {
  applyInboundMessageToConversation,
  sortConversationsForInbox,
} from "../_lib/conversation-inbox-utils";
import { wisproService } from "../_lib/wispro-service";
import { isAdminRole } from "../_lib/agent-role-utils";
import { parseWisproCustomerFromEnvoicing } from "../_lib/wispro-webhook";
import { getManualPaymentBlockReason } from "../_lib/client-profile-utils";
import {
  didClientGainWisproLink,
  syncWisproSnapshotFromClient,
  upsertClientInList,
} from "../_lib/client-realtime-utils";
import { useSendMessage } from "./use-send-message";
import type {
  Agent,
  Client,
  Conversation,
  ConversationFilter,
  CreateClientInput,
  CreateLabelInput,
  CreateQuickReplyInput,
  CreateTicketInput,
  CrmData,
  Label,
  Message,
  QuickReply,
  Ticket,
  UpdateQuickReplyInput,
  UpsertAgentInput,
  WisproCustomer,
  WisproSearchResult,
} from "../_lib/types";
import { DEFAULT_BOT_ENGINE } from "../_lib/bot-engine";
import { DEFAULT_AI_MODEL } from "../_lib/ai-models";

const emptyData: CrmData = {
  agents: [],
  clients: [],
  conversations: [],
  labels: [],
  quickReplies: [],
  tickets: [],
  settings: {
    id: 1,
    bot_engine: DEFAULT_BOT_ENGINE,
    ai_model: DEFAULT_AI_MODEL,
    ai_system_prompt: null,
    payment_success_message: null,
    ai_recovery_messages: undefined,
    office_hours: undefined,
    after_hours_payments: undefined,
    ui_accent: undefined,
    updated_at: null,
    updated_by: null,
  },
};

const MAX_WHATSAPP_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_WHATSAPP_IMAGE_BYTES = 5 * 1024 * 1024;
const formatVoiceNotePreview = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `🎤 Nota de voz (${minutes}:${seconds})`;
};

export const useCrmData = (agent: Agent | null) => {
  const [data, setData] = useState<CrmData>(emptyData);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    number | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [conversationFilter, setConversationFilter] =
    useState<ConversationFilter>("all");
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null);
  const [myAssignedSearchTerm, setMyAssignedSearchTerm] = useState("");
  const [myAssignedIncludeResolved, setMyAssignedIncludeResolved] =
    useState(false);
  const [myAssignedSelectedLabelId, setMyAssignedSelectedLabelId] = useState<
    number | null
  >(null);
  const [wisproSnapshotsByClientId, setWisproSnapshotsByClientId] = useState<
    Record<number, WisproCustomer>
  >({});
  const {
    sendMessage: sendWhatsAppMessage,
    sendVoiceNote: sendWhatsAppVoiceNote,
    sendImageMessage: sendWhatsAppImageMessage,
    processPaymentReceipt: processPaymentReceiptRequest,
    resendMessage: resendWhatsAppMessage,
    isSending: isSendingMessage,
  } = useSendMessage();
  const [isResolvingConversation, setIsResolvingConversation] = useState(false);

  // Ref para acceder al selectedConversationId dentro de los listeners de Realtime
  const selectedConversationIdRef = useRef<number | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const clientsRef = useRef<Client[]>([]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    conversationsRef.current = data.conversations;
  }, [data.conversations]);

  useEffect(() => {
    clientsRef.current = data.clients;
  }, [data.clients]);

  const applyClientRealtimeRow = useCallback(
    (incoming: Client, options?: { previous?: Client | null }) => {
      const previous =
        options?.previous ??
        clientsRef.current.find((client) => client.id === incoming.id) ??
        null;

      clientsRef.current = upsertClientInList(clientsRef.current, incoming);

      setData((current) => ({
        ...current,
        clients: upsertClientInList(current.clients, incoming),
      }));

      setWisproSnapshotsByClientId((current) =>
        syncWisproSnapshotFromClient(current, incoming),
      );

      const selectedId = selectedConversationIdRef.current;
      if (!selectedId) return;

      const openConversation = conversationsRef.current.find(
        (conversation) => conversation.id === selectedId,
      );
      if (!openConversation || openConversation.client_id !== incoming.id) {
        return;
      }

      if (didClientGainWisproLink(previous, incoming)) {
        toast.success(
          incoming.name
            ? `Nova vinculó a ${incoming.name}`
            : "Nova vinculó el cliente Wispro",
        );
      }
    },
    [],
  );

  const ensureClientInMemory = useCallback(
    async (clientId: number) => {
      if (!clientId) return;
      if (clientsRef.current.some((client) => client.id === clientId)) return;

      try {
        if (!agent) return;
        const client = await crmService.getClientById(
          clientId,
          agent.organization_id,
        );
        if (!client) return;
        applyClientRealtimeRow(client);
      } catch (error) {
        console.warn("[CRM_REALTIME] ensure_client_failed", {
          clientId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [agent, applyClientRealtimeRow],
  );

  // ── REALTIME: mensajes nuevos ──────────────────────────
  useEffect(() => {
    if (!agent) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`realtime:messages:${agent.organization_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `organization_id=eq.${agent.organization_id}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          const isOpenConversation =
            newMessage.conversation_id === selectedConversationIdRef.current;

          if (isOpenConversation) {
            setMessages((current) => {
              const exists = current.some((m) => m.id === newMessage.id);
              if (exists) return current;
              return [...current, newMessage];
            });
            return;
          }

          if (newMessage.type !== "in") return;

          setData((current) => ({
            ...current,
            conversations: current.conversations.map((conversation) =>
              conversation.id === newMessage.conversation_id
                ? applyInboundMessageToConversation(conversation, newMessage, {
                    incrementUnread: true,
                  })
                : conversation,
            ),
          }));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Realtime mensajes conectado");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agent]);

  // ── REALTIME: conversaciones ───────────────────────────
  useEffect(() => {
    if (!agent) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`realtime:conversations:${agent.organization_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${agent.organization_id}`,
        },
        (payload) => {
          const newConv = payload.new as Conversation;
          setData((current) => ({
            ...current,
            conversations: [newConv, ...current.conversations],
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${agent.organization_id}`,
        },
        (payload) => {
          const updated = payload.new as Conversation;
          const previous = conversationsRef.current.find(
            (conversation) => conversation.id === updated.id,
          );

          setData((current) => ({
            ...current,
            conversations: current.conversations.map((conv) =>
              conv.id === updated.id ? { ...conv, ...updated } : conv,
            ),
          }));

          const nextClientId = Number(updated.client_id || 0);
          const prevClientId = Number(previous?.client_id || 0);
          if (nextClientId && nextClientId !== prevClientId) {
            void ensureClientInMemory(nextClientId);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${agent.organization_id}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: number }).id;
          if (!deletedId) return;

          setData((current) => ({
            ...current,
            conversations: current.conversations.filter(
              (conv) => conv.id !== deletedId,
            ),
          }));

          if (selectedConversationIdRef.current === deletedId) {
            setSelectedConversationId(null);
            setMessages([]);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Realtime conversaciones conectado");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agent, ensureClientInMemory]);

  // ── REALTIME: clientes ─────────────────────────────────
  useEffect(() => {
    if (!agent) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`realtime:clients:${agent.organization_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clients",
          filter: `organization_id=eq.${agent.organization_id}`,
        },
        (payload) => {
          applyClientRealtimeRow(payload.new as Client);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "clients",
          filter: `organization_id=eq.${agent.organization_id}`,
        },
        (payload) => {
          const updatedClient = payload.new as Client;
          const previous = clientsRef.current.find(
            (client) => client.id === updatedClient.id,
          );
          applyClientRealtimeRow(updatedClient, { previous });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Realtime clientes conectado");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agent, applyClientRealtimeRow]);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!agent) return;

    if (!options?.silent) setIsLoading(true);
    try {
      const nextData = await crmService.loadAll(agent);
      setData(nextData);

      // Rehydrate Wispro snapshots from persisted envoicing (survives reload).
      const snapshots: Record<number, WisproCustomer> = {};
      for (const client of nextData.clients) {
        if (!client.wispro_id) continue;
        const snapshot = parseWisproCustomerFromEnvoicing(client.envoicing);
        if (snapshot) {
          snapshots[client.id] = snapshot;
        }
      }
      setWisproSnapshotsByClientId(snapshots);
    } catch (error) {
      if (!options?.silent) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo cargar el CRM",
        );
      }
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!agent) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadData({ silent: true });
      }
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [agent, loadData]);

  useEffect(() => {
    if (!agent || !selectedConversationId) return;
    const interval = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const latestMessages = await crmService.loadMessages(
          selectedConversationId,
          agent.organization_id,
        );
        setMessages(latestMessages);
      } catch {
        // Keep the current transcript during transient polling failures.
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [agent, selectedConversationId]);

  const selectedConversation = useMemo(
    () =>
      data.conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ) || null,
    [data.conversations, selectedConversationId],
  );

  const clientsById = useMemo(
    () =>
      new Map<number, Client>(
        data.clients.map((client) => [client.id, client]),
      ),
    [data.clients],
  );

  const selectedClient = useMemo(() => {
    if (!selectedConversation?.client_id) return null;
    return clientsById.get(selectedConversation.client_id) ?? null;
  }, [clientsById, selectedConversation?.client_id]);

  const selectedWisproSnapshot = useMemo(() => {
    if (!selectedClient) return null;
    return wisproSnapshotsByClientId[selectedClient.id] ?? null;
  }, [selectedClient, wisproSnapshotsByClientId]);

  const myAssignedConversations = useMemo(() => {
    if (!agent) return [];

    const agentId = Number(agent.id);
    return data.conversations.filter(
      (conversation) => Number(conversation.agent_id) === agentId,
    );
  }, [agent, data.conversations]);

  const filteredMyAssignedConversations = useMemo(() => {
    return sortConversationsForInbox(
      myAssignedConversations.filter((conversation) => {
        if (
          !myAssignedIncludeResolved &&
          conversation.status === "resuelto"
        ) {
          return false;
        }

        if (
          !matchesConversationLabel(conversation, myAssignedSelectedLabelId)
        ) {
          return false;
        }

        return matchesConversationSearch(
          conversation,
          clientsById,
          myAssignedSearchTerm,
        );
      }),
    );
  }, [
    clientsById,
    myAssignedConversations,
    myAssignedIncludeResolved,
    myAssignedSearchTerm,
    myAssignedSelectedLabelId,
  ]);

  const myActiveAssignedCount = useMemo(
    () =>
      myAssignedConversations.filter(
        (conversation) => conversation.status !== "resuelto",
      ).length,
    [myAssignedConversations],
  );

  const unassignedConversations = useMemo(
    () => data.conversations.filter((conversation) => !conversation.agent_id),
    [data.conversations],
  );

  const filteredConversations = useMemo(
    () =>
      sortConversationsForInbox(
        filterConversations(unassignedConversations, clientsById, {
          searchTerm,
          selectedLabelId,
          modeFilter: conversationFilter,
        }),
      ),
    [
      clientsById,
      conversationFilter,
      searchTerm,
      selectedLabelId,
      unassignedConversations,
    ],
  );

  const conversationFilterCounts = useMemo(
    () =>
      getConversationFilterCounts(
        unassignedConversations,
        clientsById,
        searchTerm,
        selectedLabelId,
      ),
    [clientsById, searchTerm, selectedLabelId, unassignedConversations],
  );

  const selectConversation = async (conversationId: number | null) => {
    if (conversationId === null) {
      setSelectedConversationId(null);
      setMessages([]);
      return;
    }

    setSelectedConversationId(conversationId);

    const conversation = data.conversations.find(
      (item) => item.id === conversationId,
    );

    if (conversation?.unread) {
      setData((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item.id === conversationId ? { ...item, unread: 0 } : item,
        ),
      }));
    }

    setIsMessagesLoading(true);

    try {
      if (conversation?.unread) {
        if (!agent) return;
        await crmService.clearUnread(conversationId, agent.organization_id);
      }

      if (!agent) return;
      const loadedMessages = await crmService.loadMessages(
        conversationId,
        agent.organization_id,
      );
      setMessages(loadedMessages);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo abrir la conversación",
      );
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!selectedConversation) return;

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new Error("El mensaje no puede estar vacío");
    }

    const to = resolveRecipientPhone(selectedClient, selectedConversation);
    if (!to) {
      throw new Error(
        "No hay un número de WhatsApp disponible para responder esta conversación",
      );
    }

    const response = await sendWhatsAppMessage({
      to,
      message: trimmedContent,
      conversation_id: selectedConversation.id,
      agent_id: agent?.id,
    });

    // Agregar optimistamente — Realtime lo deduplicará si llega de nuevo
    setMessages((current) => {
      const exists = current.some((m) => m.id === response.message.id);
      if (exists) return current;
      return [...current, response.message];
    });

    setData((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === selectedConversation.id
          ? {
              ...conversation,
              preview: trimmedContent,
              updated_at: new Date().toISOString(),
            }
          : conversation,
      ),
    }));
  };

  const sendVoiceNote = async (
    audioBlob: Blob,
    meta: { durationMs: number; mimeType: string },
  ) => {
    if (!selectedConversation) return;
    if (!agent) {
      throw new Error("Debes iniciar sesión como agente para enviar notas de voz");
    }
    if (!selectedConversation.human_mode) {
      throw new Error(
        "Toma control de la conversación antes de enviar una nota de voz",
      );
    }

    if (!audioBlob || audioBlob.size <= 0) {
      throw new Error("Graba una nota de voz válida antes de enviarla");
    }

    if (audioBlob.size > MAX_WHATSAPP_AUDIO_BYTES) {
      throw new Error("La nota de voz supera el límite de 16 MB");
    }

    const normalizedAudio = new Blob([audioBlob], {
      type: meta.mimeType || audioBlob.type || "audio/webm",
    });

    const to = resolveRecipientPhone(selectedClient, selectedConversation);
    if (!to) {
      throw new Error(
        "No hay un número de WhatsApp disponible para responder esta conversación",
      );
    }

    const response = await sendWhatsAppVoiceNote({
      to,
      audio: normalizedAudio,
      conversation_id: selectedConversation.id,
      duration_ms: meta.durationMs,
      agent_id: agent.id,
    });

    const preview = response.message.content || formatVoiceNotePreview(meta.durationMs);

    setMessages((current) => {
      const exists = current.some((message) => message.id === response.message.id);
      if (exists) return current;
      return [...current, response.message];
    });

    setData((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === selectedConversation.id
          ? {
              ...conversation,
              preview,
              updated_at: new Date().toISOString(),
            }
          : conversation,
      ),
    }));
  };

  const sendImageMessage = async (imageFile: File, caption?: string) => {
    if (!selectedConversation) return;
    if (!agent) {
      throw new Error("Debes iniciar sesión como agente para enviar imágenes");
    }
    if (!selectedConversation.human_mode) {
      throw new Error(
        "Toma control de la conversación antes de enviar una imagen",
      );
    }

    if (!(imageFile instanceof File) || imageFile.size <= 0) {
      throw new Error("Selecciona una imagen válida antes de enviarla");
    }
    if (imageFile.size > MAX_WHATSAPP_IMAGE_BYTES) {
      throw new Error("La imagen supera el límite de 5 MB");
    }

    const to = resolveRecipientPhone(selectedClient, selectedConversation);
    if (!to) {
      throw new Error(
        "No hay un número de WhatsApp disponible para responder esta conversación",
      );
    }

    const trimmedCaption = caption?.trim();
    const response = await sendWhatsAppImageMessage({
      to,
      image: imageFile,
      conversation_id: selectedConversation.id,
      agent_id: agent.id,
      caption: trimmedCaption,
    });

    const preview = trimmedCaption || "Imagen";

    setMessages((current) => {
      const exists = current.some((message) => message.id === response.message.id);
      if (exists) return current;
      return [...current, response.message];
    });

    setData((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === selectedConversation.id
          ? {
              ...conversation,
              preview,
              updated_at: new Date().toISOString(),
            }
          : conversation,
      ),
    }));
  };

  const processPaymentReceipt = async (messageId: number) => {
    if (!selectedConversation || !agent) {
      throw new Error("No hay una conversación activa para procesar el comprobante");
    }

    const message = messages.find((item) => item.id === messageId);
    if (!message) {
      throw new Error("No se encontró el mensaje del comprobante");
    }

    if (message.type !== "in" || message.media_type !== "image") {
      throw new Error("Solo se pueden procesar imágenes enviadas por clientes");
    }

    const blockReason = getManualPaymentBlockReason(selectedClient);
    if (blockReason) {
      throw new Error(blockReason);
    }

    await processPaymentReceiptRequest({
      message_id: messageId,
      conversation_id: selectedConversation.id,
      agent_id: agent.id,
    });

    setMessages((current) =>
      current.map((item) => {
        if (item.id !== messageId) return item;
        return {
          ...item,
          metadata: {
            ...(item.metadata || {}),
            payment_receipt_requested: true,
            payment_receipt_requested_at: new Date().toISOString(),
            payment_receipt_requested_by: agent.id,
          },
        };
      }),
    );

  };

  const resendMessage = async (messageId: number) => {
    if (!selectedConversation || !agent) {
      throw new Error("No hay una conversación activa para reenviar el mensaje");
    }

    if (!selectedConversation.human_mode) {
      throw new Error("Toma control de la conversación antes de reenviar mensajes");
    }

    const message = messages.find((item) => item.id === messageId);
    if (!message) {
      throw new Error("No se encontró el mensaje a reenviar");
    }

    if (message.type !== "out" || message.status !== "failed") {
      throw new Error("Solo se pueden reenviar mensajes salientes fallidos");
    }

    if (message.media_type) {
      throw new Error("Por ahora solo se pueden reenviar mensajes de texto");
    }

    const response = await resendWhatsAppMessage({
      message_id: messageId,
      conversation_id: selectedConversation.id,
      agent_id: agent.id,
    });

    setMessages((current) =>
      current.map((item) =>
        item.id === messageId ? { ...item, ...response.message } : item,
      ),
    );

    setData((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === selectedConversation.id
          ? {
              ...conversation,
              preview: response.message.content || conversation.preview,
              updated_at: new Date().toISOString(),
            }
          : conversation,
      ),
    }));
  };

  const addNote = async (content: string) => {
    if (!selectedConversation || !agent) return;

    const saved = await crmService.addNote(
      selectedConversation.id,
      content,
      agent.organization_id,
    );
    setMessages((current) => [...current, saved]);
    toast.info("Nota agregada");
  };

  const updateConversationLocal = (conversation: Conversation) => {
    setData((current) => ({
      ...current,
      conversations: current.conversations.map((item) =>
        item.id === conversation.id ? conversation : item,
      ),
    }));
  };

  const takeControl = async () => {
    if (!selectedConversation || !agent) return;
    if (selectedConversation.agent_id && selectedConversation.agent_id !== agent.id) {
      toast.error("Esta conversación ya está asignada a otro asesor");
      return;
    }

    try {
      const updatedConversation = await crmService.takeControlConversation(
        selectedConversation.id,
        agent.organization_id,
        {
          id: agent.id,
          name: agent.name,
        },
      );
      updateConversationLocal(updatedConversation);
      toast.warning("Control tomado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo tomar control de la conversación",
      );
    }
  };

  const reactivateBot = async () => {
    if (!selectedConversation || !agent) return;

    await crmService.updateConversation(selectedConversation.id, agent.organization_id, {
      human_mode: false,
    });
    updateConversationLocal({
      ...selectedConversation,
      human_mode: false,
    });
    toast.success("Bot IA reactivado");
  };

  const updateAiSystemPrompt = async (prompt: string | null) => {
    if (!agent) return;
    if (!isAdminRole(agent.role)) {
      toast.error("Solo un administrador puede cambiar el prompt de IA");
      return;
    }

    const normalized =
      typeof prompt === "string" ? prompt.trim() || null : null;

    try {
      const settings = await crmService.updateCrmSettings(agent.id, {
        ai_system_prompt: normalized,
      });
      setData((current) => ({ ...current, settings }));
      toast.success(
        normalized
          ? "Prompt de IA actualizado"
          : "Prompt restaurado al predeterminado",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el prompt de IA",
      );
      throw error;
    }
  };

  const updateOfficeHoursSettings = async (input: {
    office_hours: import("../_lib/office-hours").OfficeHoursConfig;
    after_hours_payments: import("../_lib/office-hours").AfterHoursPaymentsConfig;
  }) => {
    if (!agent) return;
    if (!isAdminRole(agent.role)) {
      toast.error("Solo un administrador puede cambiar los horarios");
      return;
    }

    try {
      const settings = await crmService.updateCrmSettings(agent.id, {
        office_hours: input.office_hours,
        after_hours_payments: input.after_hours_payments,
      });
      setData((current) => ({ ...current, settings }));
      toast.success("Horario de oficina actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el horario de oficina",
      );
      throw error;
    }
  };

  const updatePaymentSuccessMessage = async (message: string | null) => {
    if (!agent) return;
    if (!isAdminRole(agent.role)) {
      toast.error("Solo un administrador puede cambiar el mensaje de pago");
      return;
    }

    const normalized =
      typeof message === "string" ? message.trim() || null : null;

    try {
      const settings = await crmService.updateCrmSettings(agent.id, {
        payment_success_message: normalized,
      });
      setData((current) => ({ ...current, settings }));
      toast.success(
        normalized
          ? "Mensaje de pago aprobado actualizado"
          : "Mensaje de pago aprobado restaurado al predeterminado",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el mensaje de pago aprobado",
      );
      throw error;
    }
  };

  const updateAiRecoveryMessages = async (
    messages: import("../_lib/ai-recovery-messages").AiRecoveryMessages,
  ) => {
    if (!agent) return;
    if (!isAdminRole(agent.role)) {
      toast.error("Solo un administrador puede cambiar los mensajes de recuperación");
      return;
    }

    try {
      const settings = await crmService.updateCrmSettings(agent.id, {
        ai_recovery_messages: messages,
      });
      setData((current) => ({ ...current, settings }));
      toast.success("Mensajes de recuperación de Nova actualizados");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los mensajes de recuperación",
      );
      throw error;
    }
  };

  const updateAppearance = async (input: {
    ui_accent?: import("../_lib/crm-accents").CrmAccentId;
    ui_mode?: import("../_lib/crm-accents").CrmColorMode;
    office_ui_accent?: import("../_lib/crm-accents").CrmAccentId;
  }) => {
    if (!agent) return null;

    try {
      const result = await crmService.updateAppearance(agent.id, input);
      setData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          ui_accent: result.office_ui_accent ?? current.settings.ui_accent,
        },
      }));
      return result;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la apariencia",
      );
      throw error;
    }
  };

  const resolveConversation = async () => {
    if (!selectedConversation || !agent) return;

    const resolvedConversationId = selectedConversation.id;

    setIsResolvingConversation(true);

    try {
      await crmService.archiveAndResolveConversation(
        resolvedConversationId,
        agent.id,
      );

      setData((current) => ({
        ...current,
        conversations: current.conversations.filter(
          (conversation) => conversation.id !== resolvedConversationId,
        ),
      }));

      if (selectedConversationId === resolvedConversationId) {
        setSelectedConversationId(null);
        setMessages([]);
      }

      toast.success("Conversación archivada y cerrada");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo archivar la conversación",
      );
    } finally {
      setIsResolvingConversation(false);
    }
  };

  const updateLabels = async (labelIds: number[]) => {
    if (!selectedConversation || !agent) return;

    await crmService.updateConversation(selectedConversation.id, agent.organization_id, {
      label_ids: labelIds,
    });
    updateConversationLocal({ ...selectedConversation, label_ids: labelIds });
    toast.success("Etiquetas actualizadas");
  };

  const quickToggleLabel = async (labelId: number) => {
    if (!selectedConversation) return;

    const exists = selectedConversation.label_ids.includes(labelId);
    const labelIds = exists
      ? selectedConversation.label_ids.filter((id) => id !== labelId)
      : [...selectedConversation.label_ids, labelId];

    await updateLabels(labelIds);
  };

  const assignAgent = async (conversationId: number, agentId: number) => {
    if (!agent) return;
    const assignedAgent = data.agents.find(
      (item) => Number(item.id) === Number(agentId),
    );
    await crmService.updateConversation(conversationId, agent.organization_id, {
      agent_id: agentId,
      human_mode: true,
      agent_control: assignedAgent?.name ?? null,
    });
    await loadData();
    toast.success("Conversación asignada");
  };

  /** Patch inbox assignment in memory — no full CRM reload. */
  const applyConversationClaimLocally = (
    conversationId: number,
    agentId: number,
  ) => {
    if (!agent) return;
    const assignedAgent =
      data.agents.find((item) => Number(item.id) === Number(agentId)) || agent;
    const agentName = assignedAgent?.name ?? null;

    setData((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        Number(conversation.id) === Number(conversationId)
          ? {
              ...conversation,
              agent_id: agentId,
              human_mode: true,
              agent_control: agentName,
            }
          : conversation,
      ),
    }));
  };

  /** Silent claim after payment review — local patch only (Realtime also syncs). */
  const claimConversationForAgent = async (
    conversationId: number,
    agentId: number,
  ) => {
    if (!agent) return;
    const assignedAgent =
      data.agents.find((item) => Number(item.id) === Number(agentId)) || agent;
    await crmService.updateConversation(conversationId, agent.organization_id, {
      agent_id: agentId,
      human_mode: true,
      agent_control: assignedAgent?.name ?? null,
    });
    applyConversationClaimLocally(conversationId, agentId);
  };

  const createClient = async (input: CreateClientInput) => {
    if (!agent) throw new Error("Sesión no válida");
    const saved = await crmService.createClient(
      input,
      data.clients.length,
      agent.organization_id,
    );
    setData((current) => ({
      ...current,
      clients: [...current.clients, saved],
    }));
    toast.success(`${saved.name} agregado`);
  };

  const associateWisproToConversation = async (result: WisproSearchResult) => {
    if (!selectedConversation) return;

    const { customer, invoicing } = result;
    const wasRelink = Boolean(selectedClient?.wispro_id);
    const linkId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `link_${Date.now()}`;

    console.log("[WISPRO_ASSOCIATE] ui_associate_start", {
      linkId,
      conversationId: selectedConversation.id,
      existingClientId: selectedConversation.client_id,
      wisproId: customer.id,
      cedula: customer.national_identification_number,
      wasRelink,
      conversationPhone: selectedConversation.customer_phone || null,
      clientWhatsappId: selectedClient?.whatsapp_id || null,
    });

    try {
      const saved = await wisproService.associateToConversation({
        conversationId: selectedConversation.id,
        customer,
        invoicing,
        existingClientId: selectedConversation.client_id,
        conversationPhone:
          selectedConversation.customer_phone ??
          selectedClient?.phone ??
          selectedClient?.whatsapp_id ??
          null,
        whatsappId:
          selectedClient?.whatsapp_id ??
          selectedConversation.customer_phone ??
          null,
        waName: selectedClient?.wa_name ?? null,
        linkId,
      });

      console.log("[WISPRO_ASSOCIATE] ui_associate_ok", {
        linkId,
        conversationId: selectedConversation.id,
        clientId: saved.id,
        wisproId: saved.wispro_id || null,
        hasWhatsappId: Boolean(saved.whatsapp_id),
        hasEnvoicing: Boolean(saved.envoicing),
        account: saved.account,
      });

      if (!saved.wispro_id) {
        console.error("[WISPRO_ASSOCIATE] ui_verify_failed_wispro_id_null", {
          linkId,
          clientId: saved.id,
          expectedWisproId: customer.id,
        });
      }

      setData((current) => {
        const clientExists = current.clients.some((client) => client.id === saved.id);

        return {
          ...current,
          clients: clientExists
            ? current.clients.map((client) => {
                if (client.id === saved.id) return saved;
                // Another row may have been cleared of this wispro_id on the server.
                if (client.wispro_id === customer.id && client.id !== saved.id) {
                  return {
                    ...client,
                    wispro_id: null,
                    envoicing: null,
                    account: "Prospecto",
                  };
                }
                return client;
              })
            : [...current.clients, saved],
          conversations: current.conversations.map((conversation) =>
            conversation.id === selectedConversation.id
              ? { ...conversation, client_id: saved.id }
              : conversation,
          ),
        };
      });

      setWisproSnapshotsByClientId((current) => ({
        ...current,
        [saved.id]: customer,
      }));

      toast.success(
        wasRelink
          ? `Vinculación actualizada: ${saved.name}`
          : `${saved.name} asociado a la conversación`,
      );
    } catch (error) {
      console.error("[WISPRO_ASSOCIATE] ui_associate_error", {
        linkId,
        conversationId: selectedConversation.id,
        wisproId: customer.id,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const unlinkWisproFromClient = async () => {
    if (!selectedClient?.id) return;

    const saved = await wisproService.unlinkFromClient(selectedClient.id);

    setData((current) => ({
      ...current,
      clients: current.clients.map((client) =>
        client.id === saved.id ? saved : client,
      ),
    }));

    setWisproSnapshotsByClientId((current) => {
      const next = { ...current };
      delete next[saved.id];
      return next;
    });

    toast.success("Cliente desvinculado de Wispro");
  };

  const createWisproPaymentPromise = async () => {
    if (!selectedClient?.id && !selectedConversation?.id) {
      throw new Error("Selecciona una conversación con cliente vinculado");
    }

    const result = await wisproService.createPaymentPromise({
      clientId: selectedClient?.id,
      conversationId: selectedConversation?.id,
      hours: 48,
    });

    toast.success(`Promesa de pago creada hasta ${result.validUntil}`);
    return result;
  };

  const createTicket = async (input: CreateTicketInput) => {
    if (!agent) throw new Error("Sesión no válida");
    const saved = await crmService.createTicket(input, agent.organization_id);
    setData((current) => ({
      ...current,
      tickets: [saved, ...current.tickets],
    }));
    toast.success(`${saved.id} creado`);
  };

  const createLabel = async (input: CreateLabelInput) => {
    if (!agent) throw new Error("Sesión no válida");
    const saved = await crmService.createLabel(input, agent.organization_id);
    setData((current) => ({ ...current, labels: [...current.labels, saved] }));
    toast.success(`"${saved.name}" creada`);
  };

  const deleteLabel = async (label: Label) => {
    if (!agent) return;
    await crmService.deleteLabel(
      label.id,
      data.conversations,
      agent.organization_id,
    );
    await loadData();
    toast.warning(`"${label.name}" eliminada`);
  };

  const createQuickReply = async (input: CreateQuickReplyInput) => {
    if (!agent) throw new Error("Debes iniciar sesión para crear respuestas rápidas");
    if (!isAdminRole(agent.role)) {
      throw new Error("Solo un administrador puede crear respuestas rápidas");
    }

    const saved = await crmService.createQuickReply(
      input,
      agent.id,
      agent.organization_id,
    );
    setData((current) => ({
      ...current,
      quickReplies: [...current.quickReplies, saved].sort((left, right) =>
        left.title.localeCompare(right.title, "es"),
      ),
    }));
    toast.success(`"${saved.title}" creada`);
  };

  const updateQuickReply = async (quickReplyId: number, input: UpdateQuickReplyInput) => {
    if (!agent) throw new Error("Debes iniciar sesión para actualizar respuestas rápidas");
    if (!isAdminRole(agent.role)) {
      throw new Error("Solo un administrador puede editar respuestas rápidas");
    }

    const saved = await crmService.updateQuickReply(
      quickReplyId,
      input,
      agent.organization_id,
    );
    setData((current) => ({
      ...current,
      quickReplies: current.quickReplies
        .map((item) => (item.id === quickReplyId ? saved : item))
        .sort((left, right) => left.title.localeCompare(right.title, "es")),
    }));
    toast.success(`"${saved.title}" actualizada`);
  };

  const toggleQuickReplyStatus = async (quickReply: QuickReply) => {
    if (!agent) throw new Error("Debes iniciar sesión para actualizar respuestas rápidas");
    if (!isAdminRole(agent.role)) {
      throw new Error("Solo un administrador puede editar respuestas rápidas");
    }

    const saved = await crmService.toggleQuickReplyStatus(
      quickReply.id,
      !quickReply.is_active,
      agent.organization_id,
    );

    setData((current) => ({
      ...current,
      quickReplies: current.quickReplies.map((item) =>
        item.id === quickReply.id ? saved : item,
      ),
    }));

    toast.info(
      saved.is_active
        ? `Respuesta "${saved.title}" activada`
        : `Respuesta "${saved.title}" desactivada`,
    );
  };

  const deleteQuickReply = async (quickReply: QuickReply) => {
    if (!agent) throw new Error("Debes iniciar sesión para eliminar respuestas rápidas");
    if (!isAdminRole(agent.role)) {
      throw new Error("Solo un administrador puede eliminar respuestas rápidas");
    }

    await crmService.deleteQuickReply(
      quickReply.id,
      agent.organization_id,
    );
    setData((current) => ({
      ...current,
      quickReplies: current.quickReplies.filter((item) => item.id !== quickReply.id),
    }));
    toast.warning(`"${quickReply.title}" eliminada`);
  };

  const upsertAgent = async (input: UpsertAgentInput) => {
    if (!agent) throw new Error("Sesión no válida");
    await crmService.upsertAgent(
      input,
      data.agents.length,
      agent.organization_id,
    );
    await loadData();
    toast.success(input.id ? "Agente actualizado" : "Agente creado");
  };

  const toggleAgentStatus = async (targetAgent: Agent) => {
    if (!agent) return;
    const nextStatus =
      targetAgent.status === "inactive" ? "offline" : "inactive";
    await crmService.updateAgentStatus(
      targetAgent.id,
      nextStatus,
      agent.organization_id,
    );
    await loadData();
    toast.info(
      nextStatus === "inactive" ? "Agente desactivado" : "Agente activado",
    );
  };

  const deleteAgent = async (targetAgent: Agent) => {
    if (!agent) return;
    await crmService.deleteAgent(targetAgent.id);
    await loadData();
    toast.success(`Asesor "${targetAgent.name}" desvinculado`);
  };

  const labelsById = useMemo(
    () => new Map<number, Label>(data.labels.map((label) => [label.id, label])),
    [data.labels],
  );

  const ticketsByClientId = useMemo(() => {
    const map = new Map<number, Ticket[]>();
    data.tickets.forEach((ticket) => {
      const list = map.get(ticket.client_id) || [];
      map.set(ticket.client_id, [...list, ticket]);
    });
    return map;
  }, [data.tickets]);

  return {
    ...data,
    messages,
    selectedConversation,
    selectedClient,
    selectedWisproSnapshot,
    selectedConversationId,
    filteredConversations,
    conversationFilterCounts,
    myAssignedConversations,
    filteredMyAssignedConversations,
    myActiveAssignedCount,
    myAssignedSearchTerm,
    myAssignedIncludeResolved,
    myAssignedSelectedLabelId,
    setMyAssignedSearchTerm,
    setMyAssignedIncludeResolved,
    setMyAssignedSelectedLabelId,
    clientsById,
    labelsById,
    ticketsByClientId,
    isLoading,
    isMessagesLoading,
    isSendingMessage,
    isResolvingConversation,
    searchTerm,
    conversationFilter,
    selectedLabelId,
    setSearchTerm,
    setConversationFilter,
    setSelectedLabelId,
    loadData,
    selectConversation,
    sendMessage,
    sendVoiceNote,
    sendImageMessage,
    processPaymentReceipt,
    resendMessage,
    addNote,
    takeControl,
    reactivateBot,
    updateAiSystemPrompt,
    updatePaymentSuccessMessage,
    updateAiRecoveryMessages,
    updateOfficeHoursSettings,
    updateAppearance,
    resolveConversation,
    updateLabels,
    quickToggleLabel,
    assignAgent,
    claimConversationForAgent,
    applyConversationClaimLocally,
    createClient,
    associateWisproToConversation,
    unlinkWisproFromClient,
    createWisproPaymentPromise,
    createTicket,
    createLabel,
    deleteLabel,
    createQuickReply,
    updateQuickReply,
    toggleQuickReplyStatus,
    deleteQuickReply,
    upsertAgent,
    toggleAgentStatus,
    deleteAgent,
  };
};
