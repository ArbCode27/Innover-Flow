export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

export type ExpoChatPushData = {
  kind: "chat_message";
  conversationId: number;
  messageId: number;
  direction: "out";
};

export type ExpoTicketPushData = {
  kind: "field_ticket";
  ticketId: string;
  publicId: number | null;
  title: string | null;
  conversationId: number;
};

export type ExpoIncidentPushData = {
  kind: "pon_incident";
  board: number;
  port: number;
  incidentType: "massive_outage" | "altered_power" | "mixed" | "resolved";
  affectedCount: number;
  losCount: number;
  alteredCount: number;
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  channelId: "star-chat" | "star-ticket" | "star-incident" | "default";
  priority: "high";
  collapseId: string;
  data: ExpoChatPushData | ExpoTicketPushData | ExpoIncidentPushData;
};

export type ExpoPushTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

const toPushNumber = (value: number | string) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildExpoChatPushMessage = (input: {
  token: string;
  conversationId: number | string;
  messageId: number | string;
  body: string;
}): ExpoPushMessage => {
  const conversationId = toPushNumber(input.conversationId);
  return {
    to: input.token,
    title: "Star Conectados",
    body: input.body,
    sound: "default",
    channelId: "star-chat",
    priority: "high",
    collapseId: String(conversationId),
    data: {
      kind: "chat_message",
      conversationId,
      messageId: toPushNumber(input.messageId),
      direction: "out",
    },
  };
};

export const buildExpoTicketPushMessage = (input: {
  token: string;
  ticketId: string;
  publicId: number | null;
  title: string | null;
  conversationId: number | string | null;
}): ExpoPushMessage => ({
  to: input.token,
  title: "Visita técnica registrada",
  body: "Hay un seguimiento de visita en tu cuenta. Ábrelo en Mi ticket.",
  sound: "default",
  channelId: "star-ticket",
  priority: "high",
  collapseId: input.ticketId,
  data: {
    kind: "field_ticket",
    ticketId: input.ticketId,
    publicId: input.publicId,
    title: input.title,
    conversationId: toPushNumber(input.conversationId ?? 0),
  },
});

export const buildExpoIncidentPushMessage = (input: {
  token: string;
  title: string;
  body: string;
  board: number;
  port: number;
  incidentType: "massive_outage" | "altered_power" | "mixed" | "resolved";
  affectedCount: number;
  losCount: number;
  alteredCount: number;
}): ExpoPushMessage => ({
  to: input.token,
  title: input.title,
  body: input.body,
  sound: "default",
  channelId: "star-incident",
  priority: "high",
  collapseId: `pon-${input.board}-${input.port}`,
  data: {
    kind: "pon_incident",
    board: input.board,
    port: input.port,
    incidentType: input.incidentType,
    affectedCount: input.affectedCount,
    losCount: input.losCount,
    alteredCount: input.alteredCount,
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

let warnedMissingExpoAccessToken = false;

const warnIfMissingExpoAccessToken = () => {
  if (warnedMissingExpoAccessToken) return;
  if (process.env.EXPO_ACCESS_TOKEN?.trim()) return;
  warnedMissingExpoAccessToken = true;
  console.warn(
    "[EXPO_PUSH] EXPO_ACCESS_TOKEN unset — sending without Authorization. " +
      "Required only if Expo Enhanced Security is enabled. Set it in Vercel Production.",
  );
};

export const sendExpoPushMessages = async (
  messages: ExpoPushMessage[],
): Promise<{ tickets: ExpoPushTicket[] }> => {
  if (!messages.length) return { tickets: [] };

  warnIfMissingExpoAccessToken();
  const headers = expoPushHeaders();
  const tickets: ExpoPushTicket[] = [];

  for (const message of messages) {
    try {
      const response = await fetch(EXPO_PUSH_SEND_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
      });
      const payload = await response.json().catch(() => null);
      const parsed = normalizeExpoTickets(payload);
      const ticket = parsed[0] || {
        status: response.ok ? "ok" : "error",
        message: response.ok ? undefined : `HTTP ${response.status}`,
      };
      tickets.push(ticket);

      if (!response.ok) {
        console.warn("[EXPO_PUSH] send_failed", {
          kind: message.data.kind,
          status: response.status,
          expoTicketId: ticket.id ?? null,
          errors:
            payload && typeof payload === "object"
              ? (payload as { errors?: unknown }).errors
              : null,
        });
        continue;
      }

      console.log("[EXPO_PUSH] sent", {
        kind: message.data.kind,
        status: response.status,
        expoTicketId: ticket.id ?? null,
        expoStatus: ticket.status ?? null,
      });
    } catch (error) {
      console.warn("[EXPO_PUSH] send_failed", {
        kind: message.data.kind,
        error: error instanceof Error ? error.message : "unknown",
      });
      tickets.push({
        status: "error",
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return { tickets };
};
