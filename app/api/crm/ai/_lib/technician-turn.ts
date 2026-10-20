import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASK_CLOSE_OBSERVATION,
  buildMapsUrl,
  extractObservationAfterCloseCue,
  fieldTicketKindLabel,
  fieldTicketStatusLabel,
  formatFinalizeConfirmation,
  looksLikeCloseIntent,
  looksLikeDetailRequest,
  looksLikeListRequest,
  matchTicketByPublicIdOrClientName,
  observationLooksSufficient,
  shouldSkipDetailFastPath,
  type FieldTicket,
  type Technician,
} from "@/lib/field-tickets";
import {
  finalizeFieldTicket,
  FieldTicketError,
  identifyTechnician,
  isTechnicianSupervisor,
  listPendingTicketsForEmployee,
  listTechnicians,
  upsertTechnician,
} from "@/app/api/crm/_lib/field-tickets";
import { DEFAULT_AI_MODEL, normalizeAiModelId } from "@/app/crm/_lib/ai-models";
import { generateAiWithRetry } from "./ai-retry";
import {
  FINALIZE_MY_TICKET_TOOL,
  GET_MY_TICKET_DETAIL_TOOL,
  GET_TECHNICIAN_ASSIGNED_TICKETS_TOOL,
  LIST_MY_PENDING_TICKETS_TOOL,
  TECHNICIAN_TOOL_NAMES,
  finalizeMyTicketArgsSchema,
  getMyTicketDetailArgsSchema,
  getTechnicianAssignedTicketsArgsSchema,
} from "./ai-tools";
import type { AgentHistoryMessage } from "./context-builder";
import { transcribeAudioWithGroq } from "./ai-client";
import { persistOutboundMessage } from "@/app/api/crm/_lib/channel-messages";

const LOG_PREFIX = "[FIELD_TICKETS_APP]";

export type TechnicianTurnResult = {
  handled: boolean;
  ok: boolean;
  reason: string;
  messageId?: string | null;
};

const formatVisitWindow = (ticket: FieldTicket) => {
  if (!ticket.windowStart && !ticket.windowEnd) return "Sin ventana agendada";
  const fmt = (value: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };
  if (ticket.windowStart && ticket.windowEnd) {
    return `${fmt(ticket.windowStart)} – ${fmt(ticket.windowEnd)}`;
  }
  return fmt(ticket.windowStart || ticket.windowEnd);
};

export const formatPendingTicketsList = (tickets: FieldTicket[]) => {
  if (!tickets.length) return "No tienes visitas pendientes.";
  const lines = tickets.map((ticket) => {
    const name = ticket.clientName?.trim() || "Cliente";
    const location = ticket.addressText?.trim() || "Sin dirección";
    return `#${ticket.publicId} ${name} — ${ticket.title} — ${location}`;
  });
  return `Pendientes:\n${lines.join("\n")}`;
};

export const formatTicketDetailText = (ticket: FieldTicket) => {
  const maps = buildMapsUrl({
    mapsUrl: ticket.mapsUrl,
    latitude: ticket.latitude,
    longitude: ticket.longitude,
  });
  const lines = [
    `#${ticket.publicId} — ${ticket.clientName || "Cliente"}`,
    `Categoría: ${fieldTicketKindLabel(ticket.kind, ticket.title)}`,
    `Estado: ${fieldTicketStatusLabel(ticket.status)}`,
    `Prioridad: ${ticket.priority}`,
    `Ventana: ${formatVisitWindow(ticket)}`,
    ticket.addressText ? `Dirección: ${ticket.addressText}` : null,
    maps ? `Mapa: ${maps}` : null,
    ticket.cause ? `Detalle: ${ticket.cause}` : null,
    ticket.description ? `Descripción: ${ticket.description}` : null,
    ticket.clientPhone ? `Teléfono: ${ticket.clientPhone}` : null,
  ].filter(Boolean);
  return lines.join("\n");
};

const replyTechnician = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: number;
    text: string;
    metadata?: Record<string, unknown>;
    facadeUrl?: string | null;
  },
): Promise<string | null> => {
  const saved = await persistOutboundMessage(supabase, {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    content: input.text,
    senderType: "bot",
    sentBy: "Bot IA",
    metadata: {
      engine: "field_tickets",
      ...(input.metadata || {}),
    },
  });

  if (input.facadeUrl) {
    await persistOutboundMessage(supabase, {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      content: "Foto de fachada",
      senderType: "bot",
      sentBy: "Bot IA",
      mediaUrl: input.facadeUrl,
      mediaType: "image",
      caption: "Foto de fachada",
      metadata: {
        engine: "field_tickets",
        ...(input.metadata || {}),
        kind: "facade",
      },
    });
  }

  return saved?.id != null ? String(saved.id) : null;
};

const inboundText = (message: AgentHistoryMessage | null) =>
  [message?.content, message?.caption]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

const lastBotMetadata = (messages: AgentHistoryMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type === "out" && message.sender_type === "bot") {
      return (message.metadata || {}) as Record<string, unknown>;
    }
  }
  return {} as Record<string, unknown>;
};

const transcribeIfNeeded = async (message: AgentHistoryMessage | null) => {
  if (!message || String(message.media_type || "") !== "audio") return null;
  const existing =
    typeof message.metadata?.transcript === "string"
      ? message.metadata.transcript.trim()
      : "";
  if (existing) return existing;
  if (!message.media_url) return null;
  try {
    const response = await fetch(message.media_url);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return await transcribeAudioWithGroq({
      bytes,
      mimeType: message.mime_type || "audio/ogg",
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} transcribe_failed`, error);
    return null;
  }
};

const resolveTicketFromUtterance = (
  text: string,
  tickets: FieldTicket[],
  awaitingTicketId?: string | null,
) => {
  if (awaitingTicketId) {
    const awaiting = tickets.find((ticket) => ticket.id === awaitingTicketId);
    if (awaiting) return awaiting;
  }
  const matched = matchTicketByPublicIdOrClientName(text, tickets);
  if (matched) return tickets.find((ticket) => ticket.publicId === matched.publicId) || null;
  if (tickets.length === 1) return tickets[0];
  return null;
};

type TechnicianToolContext = {
  supabase: SupabaseClient;
  organizationId?: string | null;
  technicianId?: string | null;
  technicianIsSupervisor?: boolean;
};

export const handleTechnicianTool = async (
  ctx: TechnicianToolContext,
  toolName: string,
  rawArgs: unknown,
) => {
  const organizationId = ctx.organizationId;
  const technicianId = ctx.technicianId;
  if (!organizationId || !technicianId) {
    return {
      name: toolName,
      ok: false,
      response: { ok: false, error: "Técnico no identificado" },
    };
  }

  const pending = await listPendingTicketsForEmployee(
    ctx.supabase,
    organizationId,
    technicianId,
  );

  if (toolName === LIST_MY_PENDING_TICKETS_TOOL) {
    const text = formatPendingTicketsList(pending);
    return {
      name: toolName,
      ok: true,
      stopAgent: true,
      response: { ok: true, delivered: true, text, count: pending.length },
    };
  }

  if (toolName === GET_MY_TICKET_DETAIL_TOOL) {
    const parsed = getMyTicketDetailArgsSchema.safeParse(rawArgs || {});
    const query = [
      parsed.success && parsed.data.public_id ? `#${parsed.data.public_id}` : "",
      parsed.success ? parsed.data.client_name || "" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const ticket = resolveTicketFromUtterance(query, pending);
    if (!ticket) {
      return {
        name: toolName,
        ok: false,
        response: {
          ok: false,
          error: pending.length
            ? "Indica el número o el nombre del cliente."
            : "No tienes visitas pendientes.",
        },
      };
    }
    return {
      name: toolName,
      ok: true,
      stopAgent: true,
      response: {
        ok: true,
        delivered: true,
        text: formatTicketDetailText(ticket),
        facade_media_url: ticket.facadeMediaUrl,
        send_facade: Boolean(ticket.facadeMediaUrl),
      },
    };
  }

  if (toolName === FINALIZE_MY_TICKET_TOOL) {
    const parsed = finalizeMyTicketArgsSchema.safeParse(rawArgs || {});
    if (!parsed.success) {
      return {
        name: toolName,
        ok: false,
        response: { ok: false, error: ASK_CLOSE_OBSERVATION },
      };
    }
    const query = [
      parsed.data.public_id ? `#${parsed.data.public_id}` : "",
      parsed.data.client_name || "",
    ]
      .filter(Boolean)
      .join(" ");
    const ticket = resolveTicketFromUtterance(query, pending);
    if (!ticket) {
      return {
        name: toolName,
        ok: false,
        response: {
          ok: false,
          error: "Indica cuál visita cerrar (número o nombre).",
        },
      };
    }
    try {
      const closed = await finalizeFieldTicket(
        ctx.supabase,
        organizationId,
        ticket.id,
        {
          observation: parsed.data.observation,
          source: "technician",
          technicianEmployeeId: technicianId,
        },
      );
      return {
        name: toolName,
        ok: true,
        stopAgent: true,
        response: {
          ok: true,
          delivered: true,
          text: formatFinalizeConfirmation(closed.publicId, closed.clientName),
        },
      };
    } catch (error) {
      if (error instanceof FieldTicketError) {
        const message =
          error.code === "already_closed"
            ? `El caso #${ticket.publicId} ya estaba cerrado.`
            : error.code === "forbidden"
              ? "Ese caso no está asignado a ti."
              : ASK_CLOSE_OBSERVATION;
        return {
          name: toolName,
          ok: false,
          response: { ok: false, code: error.code, error: message },
        };
      }
      throw error;
    }
  }

  if (toolName === GET_TECHNICIAN_ASSIGNED_TICKETS_TOOL) {
    if (!ctx.technicianIsSupervisor) {
      return {
        name: toolName,
        ok: false,
        response: { ok: false, error: "No autorizado." },
      };
    }
    const parsed = getTechnicianAssignedTicketsArgsSchema.safeParse(rawArgs || {});
    if (!parsed.success) {
      return {
        name: toolName,
        ok: false,
        response: { ok: false, error: "Dime el nombre del técnico." },
      };
    }
    const technicians = await listTechnicians(ctx.supabase, organizationId);
    const needle = parsed.data.technician_name.trim().toLowerCase();
    const matches = technicians.filter((item) =>
      item.name.toLowerCase().includes(needle),
    );
    if (matches.length !== 1) {
      return {
        name: toolName,
        ok: false,
        response: {
          ok: false,
          error:
            matches.length === 0
              ? "No encontré a ese técnico."
              : "Hay varios con ese nombre. Sé más específico.",
        },
      };
    }
    const assigned = await listPendingTicketsForEmployee(
      ctx.supabase,
      organizationId,
      matches[0].id,
    );
    return {
      name: toolName,
      ok: true,
      stopAgent: true,
      response: {
        ok: true,
        delivered: true,
        text: `${matches[0].name}:\n${formatPendingTicketsList(assigned)}`,
      },
    };
  }

  return {
    name: toolName,
    ok: false,
    response: { ok: false, error: "Tool no soportada" },
  };
};

const runTechnicianLlm = async (input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: number;
  technician: Technician;
  pending: FieldTicket[];
  messages: AgentHistoryMessage[];
  latestText: string;
}) => {
  const queue = formatPendingTicketsList(input.pending);
  const supervisorNote = isTechnicianSupervisor(input.technician)
    ? "Eres supervisor: puedes consultar pendientes de otro técnico por el nombre que te den."
    : "No puedes ver casos de otros técnicos.";

  const allowedToolNames = isTechnicianSupervisor(input.technician)
    ? [...TECHNICIAN_TOOL_NAMES]
    : TECHNICIAN_TOOL_NAMES.filter(
        (name) => name !== GET_TECHNICIAN_ASSIGNED_TICKETS_TOOL,
      );

  const ctx: TechnicianToolContext = {
    supabase: input.supabase,
    organizationId: input.organizationId,
    technicianId: input.technician.id,
    technicianIsSupervisor: isTechnicianSupervisor(input.technician),
  };

  const generated = await generateAiWithRetry({
    systemPrompt: [
      "Eres el asistente de visitas de campo del canal de la app.",
      "Habla en español, breve. Nunca nombres APIs, helpdesk ni sistemas internos.",
      supervisorNote,
      "La cola inyectada es la fuente de verdad. No reenvíes el listado salvo que lo pida.",
      "Para cerrar un caso necesitas UNA observación (mínimo 3 caracteres). Si no la da, pídela en una frase.",
      "Cola pendiente:",
      queue,
    ].join("\n"),
    contents: [
      {
        role: "user",
        parts: [{ text: input.latestText || "Hola" }],
      },
    ],
    model:
      normalizeAiModelId(process.env.GROQ_TECHNICIAN_MODEL || "") ||
      DEFAULT_AI_MODEL,
    enableTools: true,
    allowedToolNames,
    timeoutsMs: [18000, 25000],
    backoffMs: 800,
    logContext: {
      conversationId: input.conversationId,
      technicianId: input.technician.id,
    },
  });

  if (generated.functionCalls.length) {
    const call = generated.functionCalls[0];
    const result = await handleTechnicianTool(ctx, call.name, call.args);
    return result.response;
  }

  return {
    ok: true,
    delivered: false,
    text: generated.text.trim(),
  };
};

export const tryHandleTechnicianTurn = async (input: {
  supabase: SupabaseClient;
  conversation: {
    id: number;
    organization_id: string;
    customer_phone: string | null;
  };
  messages: AgentHistoryMessage[];
  latestInbound: AgentHistoryMessage | null;
  recipientPhone: string | null;
}): Promise<TechnicianTurnResult> => {
  const phone = input.recipientPhone || input.conversation.customer_phone;
  const inbound = inboundText(input.latestInbound);
  const inboundIsAudio =
    String(input.latestInbound?.media_type || "") === "audio";
  const transcript = await transcribeIfNeeded(input.latestInbound);
  const documentGuess = inbound.replace(/\D/g, "");
  const technician = await identifyTechnician(
    input.supabase,
    input.conversation.organization_id,
    {
      phone,
      document: documentGuess.length >= 5 && documentGuess.length <= 12 ? documentGuess : null,
    },
  );

  if (!technician) {
    return { handled: false, ok: true, reason: "not_technician" };
  }

  if (phone && last10Missing(technician.phone, phone)) {
    await upsertTechnician(input.supabase, input.conversation.organization_id, {
      id: technician.id,
      name: technician.name,
      phone,
      document: technician.document,
      isSupervisor: technician.isSupervisor,
      sourceEmployeeId: technician.sourceEmployeeId,
    });
  }

  const pending = await listPendingTicketsForEmployee(
    input.supabase,
    input.conversation.organization_id,
    technician.id,
  );
  const metadata = lastBotMetadata(input.messages);
  const awaitingCloseObservation = Boolean(
    metadata.awaiting_close_observation,
  );
  const awaitingTicketId =
    typeof metadata.awaiting_ticket_id === "string"
      ? metadata.awaiting_ticket_id
      : null;
  const workingText = transcript || inbound;
  const skipDetail = shouldSkipDetailFastPath({
    awaitingCloseObservation,
    inboundIsAudio,
    text: workingText,
  });

  const send = (text: string, extra?: { facadeUrl?: string | null; meta?: Record<string, unknown> }) =>
    replyTechnician(input.supabase, {
      organizationId: input.conversation.organization_id,
      conversationId: input.conversation.id,
      text,
      facadeUrl: extra?.facadeUrl,
      metadata: extra?.meta,
    });

  if (awaitingCloseObservation || (inboundIsAudio && looksLikeCloseIntent(workingText))) {
    const observation = observationLooksSufficient(workingText)
      ? workingText.trim()
      : "";
    if (!observation) {
      const wa = await send(ASK_CLOSE_OBSERVATION, {
        meta: {
          awaiting_close_observation: true,
          awaiting_ticket_id: awaitingTicketId,
        },
      });
      return { handled: true, ok: true, reason: "ask_observation", messageId: wa };
    }
    const ticket = resolveTicketFromUtterance(workingText, pending, awaitingTicketId);
    if (!ticket) {
      const wa = await send(
        pending.length
          ? "¿Cuál visita cierro? Dime el número o el nombre del cliente."
          : "No tienes visitas pendientes para cerrar.",
        {
          meta: {
            awaiting_close_observation: true,
            awaiting_ticket_id: awaitingTicketId,
          },
        },
      );
      return { handled: true, ok: true, reason: "ask_which_ticket", messageId: wa };
    }
    try {
      const closed = await finalizeFieldTicket(
        input.supabase,
        input.conversation.organization_id,
        ticket.id,
        {
          observation,
          source: "technician",
          technicianEmployeeId: technician.id,
        },
      );
      const wa = await send(
        formatFinalizeConfirmation(closed.publicId, closed.clientName),
      );
      return { handled: true, ok: true, reason: "finalized", messageId: wa };
    } catch (error) {
      if (error instanceof FieldTicketError && error.code === "already_closed") {
        const wa = await send(`El caso #${ticket.publicId} ya estaba cerrado.`);
        return { handled: true, ok: true, reason: "already_closed", messageId: wa };
      }
      throw error;
    }
  }

  if (looksLikeCloseIntent(workingText)) {
    const leftover = extractObservationAfterCloseCue(workingText);
    if (!observationLooksSufficient(leftover) && !transcript) {
      const matched = resolveTicketFromUtterance(workingText, pending);
      const wa = await send(ASK_CLOSE_OBSERVATION, {
        meta: {
          awaiting_close_observation: true,
          awaiting_ticket_id: matched?.id || null,
        },
      });
      return { handled: true, ok: true, reason: "ask_observation", messageId: wa };
    }
    if (observationLooksSufficient(leftover) || (transcript && observationLooksSufficient(transcript))) {
      const observation = observationLooksSufficient(leftover) ? leftover : String(transcript);
      const ticket = resolveTicketFromUtterance(workingText, pending);
      if (!ticket) {
        const wa = await send(
          "¿Cuál visita cierro? Dime el número o el nombre del cliente.",
          { meta: { awaiting_close_observation: true } },
        );
        return { handled: true, ok: true, reason: "ask_which_ticket", messageId: wa };
      }
      const closed = await finalizeFieldTicket(
        input.supabase,
        input.conversation.organization_id,
        ticket.id,
        {
          observation,
          source: "technician",
          technicianEmployeeId: technician.id,
        },
      );
      const wa = await send(
        formatFinalizeConfirmation(closed.publicId, closed.clientName),
      );
      return { handled: true, ok: true, reason: "finalized", messageId: wa };
    }
  }

  if (looksLikeDetailRequest(workingText) && !skipDetail) {
    const ticket = resolveTicketFromUtterance(workingText, pending);
    if (!ticket) {
      const wa = await send(
        pending.length
          ? `${formatPendingTicketsList(pending)}\n\nDime el número para ver la ficha.`
          : "No tienes visitas pendientes.",
      );
      return { handled: true, ok: true, reason: "detail_need_id", messageId: wa };
    }
    const wa = await send(formatTicketDetailText(ticket), {
      facadeUrl: ticket.facadeMediaUrl,
    });
    return { handled: true, ok: true, reason: "detail", messageId: wa };
  }

  if (looksLikeListRequest(workingText)) {
    const wa = await send(formatPendingTicketsList(pending));
    return { handled: true, ok: true, reason: "list", messageId: wa };
  }

  try {
    const llm = await runTechnicianLlm({
      supabase: input.supabase,
      organizationId: input.conversation.organization_id,
      conversationId: input.conversation.id,
      technician,
      pending,
      messages: input.messages,
      latestText: workingText,
    });
    const text = String(llm.text || "").trim();
    if (!text) {
      const wa = await send(formatPendingTicketsList(pending));
      return { handled: true, ok: true, reason: "queue_fallback", messageId: wa };
    }
    const facadeUrl =
      llm.send_facade && typeof llm.facade_media_url === "string"
        ? llm.facade_media_url
        : null;
    const wa = await send(text, { facadeUrl });
    return { handled: true, ok: true, reason: "llm", messageId: wa };
  } catch (error) {
    console.warn(`${LOG_PREFIX} llm_failed`, error);
    const wa = await send(formatPendingTicketsList(pending));
    return { handled: true, ok: true, reason: "queue_injected", messageId: wa };
  }
};

const last10Missing = (stored: string | null, incoming: string) => {
  const a = String(stored || "").replace(/\D/g, "").slice(-10);
  const b = incoming.replace(/\D/g, "").slice(-10);
  return b.length >= 7 && a !== b;
};
