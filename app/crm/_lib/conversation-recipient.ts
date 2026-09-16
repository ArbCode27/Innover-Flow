import type { Client, Conversation } from "./types";

export const resolveRecipientPhone = (
  client: Client | null | undefined,
  conversation: Conversation | null | undefined,
) => {
  const fromClient =
    client?.whatsapp_id?.trim() ||
    client?.phone?.trim() ||
    null;
  if (fromClient) return fromClient;

  const fromConversation = conversation?.customer_phone?.trim() || null;
  return fromConversation;
};
