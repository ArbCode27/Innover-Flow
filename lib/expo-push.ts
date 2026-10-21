export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_BATCH_SIZE = 100;
export const EXPO_DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

export type ExpoChatPushData = {
  kind: "chat_message";
  conversationId: string;
  messageId: string;
  direction: "out";
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  channelId: "star-chat";
  priority: "high";
  collapseId: string;
  data: ExpoChatPushData;
};

export type ExpoPushTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

export const buildExpoChatPushMessage = (input: {
  token: string;
  conversationId: number | string;
  messageId: number | string;
  body: string;
}): ExpoPushMessage => ({
  to: input.token,
  title: "Star Conectados",
  body: input.body,
  sound: "default",
  channelId: "star-chat",
  priority: "high",
  collapseId: `chat-${input.conversationId}`,
  data: {
    kind: "chat_message",
    conversationId: String(input.conversationId),
    messageId: String(input.messageId),
    direction: "out",
  },
});

export const normalizeExpoTickets = (payload: unknown): ExpoPushTicket[] => {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) return data as ExpoPushTicket[];
  if (data && typeof data === "object") return [data as ExpoPushTicket];
  return [];
};

export const collectUnregisteredExpoTokens = (
  tokens: string[],
  tickets: ExpoPushTicket[],
): string[] => {
  const stale = new Set<string>();
  tickets.forEach((ticket, index) => {
    if (
      ticket?.status === "error" &&
      ticket.details?.error === EXPO_DEVICE_NOT_REGISTERED
    ) {
      const token = tokens[index];
      if (token) stale.add(token);
    }
  });
  return [...stale];
};

const expoPushHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
};

export const sendExpoPushMessages = async (
  messages: ExpoPushMessage[],
): Promise<{ tickets: ExpoPushTicket[] }> => {
  if (!messages.length) return { tickets: [] };

  const headers = expoPushHeaders();
  const tickets: ExpoPushTicket[] = [];

  for (let index = 0; index < messages.length; index += EXPO_PUSH_BATCH_SIZE) {
    const batch = messages.slice(index, index + EXPO_PUSH_BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    const payload = await response.json().catch(() => null);
    tickets.push(...normalizeExpoTickets(payload));
    if (!response.ok) {
      console.warn("[EXPO_PUSH] send_failed", {
        status: response.status,
        errors:
          payload && typeof payload === "object"
            ? (payload as { errors?: unknown }).errors
            : null,
      });
    }
  }

  return { tickets };
};
