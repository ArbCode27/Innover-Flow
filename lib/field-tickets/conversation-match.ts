export type ConversationMatchInput = {
  id: number;
  client_id: number | null;
  customer_phone?: string | null;
};

export type TicketConversationRef = {
  conversationId: number | null;
  crmClientId: number | null;
  clientPhone: string | null;
};

export type ClientTicketOwner = {
  id: number;
  phone?: string | null;
  conversationIds?: number[];
};

const last10 = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(-10);

export const ticketBelongsToClient = (
  ticket: TicketConversationRef,
  client: ClientTicketOwner,
): boolean => {
  if (ticket.crmClientId != null && ticket.crmClientId === client.id) {
    return true;
  }
  if (
    ticket.conversationId != null &&
    (client.conversationIds || []).includes(ticket.conversationId)
  ) {
    return true;
  }
  const ticketDigits = last10(ticket.clientPhone);
  const clientDigits = last10(client.phone);
  return ticketDigits.length >= 7 && ticketDigits === clientDigits;
};

export const resolveTicketConversationId = (
  ticket: TicketConversationRef,
  conversations: ConversationMatchInput[],
): number | null => {
  if (ticket.conversationId != null) {
    const byId = conversations.find((item) => item.id === ticket.conversationId);
    if (byId) return byId.id;
  }

  if (ticket.crmClientId != null) {
    const byClient = conversations.find(
      (item) => item.client_id === ticket.crmClientId,
    );
    if (byClient) return byClient.id;
  }

  const ticketDigits = last10(ticket.clientPhone);
  if (ticketDigits.length >= 7) {
    const byPhone = conversations.filter(
      (item) => last10(item.customer_phone) === ticketDigits,
    );
    if (byPhone.length === 1) return byPhone[0].id;
  }

  return null;
};

export const openCasosForConversation = <
  T extends {
    status: string;
    conversationId: number | null;
    crmClientId: number | null;
  },
>(
  tickets: T[],
  conversation: { id: number; client_id: number | null },
) =>
  tickets.filter(
    (ticket) =>
      (ticket.status === "open" || ticket.status === "scheduled") &&
      (ticket.conversationId === conversation.id ||
        (conversation.client_id != null &&
          ticket.crmClientId === conversation.client_id)),
  );

export const conversationHasOpenTicket = <
  T extends {
    status: string;
    conversationId: number | null;
    crmClientId: number | null;
  },
>(
  tickets: T[],
  conversation: { id: number; client_id: number | null },
) => openCasosForConversation(tickets, conversation).length > 0;
