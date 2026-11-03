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

export type ExpoNetworkAlertClientData = {
  name: string;
  pon: string;
};

export type ExpoNetworkAlertPushData = {
  kind: "network_alert";
  severity: "critical" | "warning" | "normal";
  scope: "olt_pon_loss" | "altered_power" | "restored";
  card: string;
  pons: string[];
  affectedCount: number;
  clients: ExpoNetworkAlertClientData[];
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  subtitle?: string;
  body: string;
  sound?: "default" | null | string;
  channelId?:
    | "star-chat"
    | "star-ticket"
    | "star-incident"
    | "innover-critical"
    | "innover-warning"
    | "innover-success"
    | "default"
    | string;
  priority?: "high" | "default" | "normal";
  color?: string;
  collapseId?: string;
  badge?: number;
  data?:
    | ExpoChatPushData
    | ExpoTicketPushData
    | ExpoIncidentPushData
    | ExpoNetworkAlertPushData
    | Record<string, unknown>;
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

/* -------------------------------------------------------------------------- */
/* Utilidades de Formateo Tipográfico y de Nombres para Notificaciones Push   */
/* -------------------------------------------------------------------------- */

const LOWERCASE_SPANISH_PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "e",
  "en",
  "da",
  "do",
  "van",
  "von",
]);

/**
 * Convierte un nombre en ALL CAPS o mixto a Title Case respetando partículas en español.
 * Ej: "GERANGEL SOLORZANO GIL" -> "Gerangel Solórzano Gil"
 */
export const formatClientName = (rawName: string): string => {
  if (!rawName || typeof rawName !== "string") return "Cliente sin registrar";
  const trimmed = rawName.trim();
  if (!trimmed) return "Cliente sin registrar";

  const words = trimmed.toLowerCase().split(/\s+/);
  return words
    .map((word, index) => {
      if (!word) return "";
      if (index > 0 && LOWERCASE_SPANISH_PARTICLES.has(word)) {
        return word;
      }
      return word.charAt(0).toLocaleUpperCase("es-ES") + word.slice(1);
    })
    .join(" ");
};

/**
 * Obtiene el nombre compacto para uso en cuerpos de texto push sin exceder límites de visualización.
 * Ej: "Gerangel Solórzano Gil" -> "Gerangel Solórzano"
 */
export const getShortClientName = (rawName: string): string => {
  const formatted = formatClientName(rawName);
  const words = formatted.split(/\s+/);
  if (words.length <= 2) return formatted;

  // Si la segunda palabra es partícula (ej. "de"), incluimos hasta el siguiente apellido
  if (words.length >= 3 && LOWERCASE_SPANISH_PARTICLES.has(words[1].toLowerCase())) {
    return words.slice(0, 3).join(" ");
  }

  return words.slice(0, 2).join(" ");
};

/* -------------------------------------------------------------------------- */
/* Constructores de Mensajes Push                                             */
/* -------------------------------------------------------------------------- */

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

export interface NetworkAlertClientItem {
  name: string;
  board?: number | null;
  port?: number | null;
  incidentType?: "LOS" | "Potencia alterada" | "Power fail" | "Offline" | string;
  status?: string | null;
  rxSignal?: number | null;
}

export interface BuildNetworkIncidentAlertInput {
  token: string;
  clients?: NetworkAlertClientItem[];
  oltName?: string;
  fallbackBoard?: number;
  fallbackPort?: number;
  forcedSeverity?: "critical" | "warning" | "normal";
}

/**
 * Generador optimizado de notificaciones push de incidencias de red para Expo / FCM v1.
 * Estructura tipográfica limpia, sin ALL CAPS, con canales nativos Android y colores de severidad.
 */
export const buildExpoNetworkAlertPushMessage = (
  input: BuildNetworkIncidentAlertInput,
): ExpoPushMessage => {
  const clients = input.clients || [];
  const affectedCount = clients.length;

  // 1. Determinar severidad y scope
  let severity: "critical" | "warning" | "normal" = "critical";
  let scope: "olt_pon_loss" | "altered_power" | "restored" = "olt_pon_loss";

  if (input.forcedSeverity) {
    severity = input.forcedSeverity;
    scope =
      severity === "normal"
        ? "restored"
        : severity === "warning"
          ? "altered_power"
          : "olt_pon_loss";
  } else if (affectedCount === 0) {
    severity = "normal";
    scope = "restored";
  } else {
    const isAllAltered = clients.every(
      (c) =>
        c.incidentType === "Potencia alterada" ||
        (c.rxSignal != null &&
          c.rxSignal <= -29.0 &&
          c.incidentType !== "LOS" &&
          c.incidentType !== "Offline" &&
          c.incidentType !== "Power fail"),
    );

    if (isAllAltered) {
      severity = "warning";
      scope = "altered_power";
    } else {
      severity = "critical";
      scope = "olt_pon_loss";
    }
  }

  // 2. Canal nativo, color de acento y prioridad según severidad
  let channelId: "innover-critical" | "innover-warning" | "innover-success";
  let color: "#EF4444" | "#F59E0B" | "#10B981";
  let priority: "high" | "default";

  if (severity === "critical") {
    channelId = "innover-critical";
    color = "#EF4444";
    priority = "high";
  } else if (severity === "warning") {
    channelId = "innover-warning";
    color = "#F59E0B";
    priority = "high";
  } else {
    channelId = "innover-success";
    color = "#10B981";
    priority = "default";
  }

  // 3. Extracción y formateo de Tarjeta (Board) y Puertos PON
  const boardNums = Array.from(
    new Set(
      clients
        .map((c) => (c.board != null ? Number(c.board) : input.fallbackBoard ?? 1))
        .filter((b) => !isNaN(b) && b >= 0),
    ),
  ).sort((a, b) => a - b);
  const representativeBoards = boardNums.length > 0 ? boardNums : [input.fallbackBoard ?? 1];

  const cardText =
    representativeBoards.length === 1
      ? `Tarjeta ${representativeBoards[0]}`
      : `Tarjetas ${representativeBoards.join(", ")}`;

  const portNums = Array.from(
    new Set(
      clients
        .map((c) => (c.port != null ? Number(c.port) : input.fallbackPort ?? 1))
        .filter((p) => !isNaN(p) && p >= 0),
    ),
  ).sort((a, b) => a - b);
  const representativePorts = portNums.length > 0 ? portNums : [input.fallbackPort ?? 1];
  const ponsList = representativePorts.map((p) => `P${p}`);

  // 4. Redacción del Título (máximo 45 caracteres para evitar truncamiento)
  let title = "";
  if (severity === "normal") {
    title = "Servicio restablecido · Red operativa";
  } else if (severity === "warning") {
    if (affectedCount === 1) {
      title = "Potencia alterada · 1 abonado degradado";
    } else if (affectedCount <= 4) {
      title = `Atenuación óptica · ${affectedCount} abonados`;
    } else {
      title = `Degradación masiva · ${affectedCount} abonados`;
    }
  } else {
    // Corte de red / LOS / outage
    if (affectedCount === 1) {
      title = "Corte de fibra · 1 abonado sin señal";
    } else if (affectedCount <= 4) {
      title = `Corte de red · ${affectedCount} abonados sin servicio`;
    } else {
      title = `Alerta masiva · ${affectedCount} abonados desconectados`;
    }
  }

  // 5. Subtítulo (compatible con iOS y Android API 26+)
  const olt = input.oltName || "OLT Central";
  const subtitle = `${olt} · ${cardText}`;

  // 6. Redacción del Cuerpo (body) con nombres compactos en Title Case
  let body = "";
  if (affectedCount === 0) {
    body = "Monitoreo en tiempo real: Todos los abonados y puertos PON operan con normalidad.";
  } else if (affectedCount === 1) {
    const c = clients[0];
    const name = getShortClientName(c.name);
    const pon = `PON ${c.port != null ? c.port : input.fallbackPort ?? 1}`;
    if (severity === "warning") {
      body = `${name} (${pon}) registra atenuación óptica crítica (≤ -29 dBm).`;
    } else {
      body = `${name} (${pon}) presenta alarma LOS por desconexión de fibra.`;
    }
  } else if (affectedCount === 2) {
    const c1 = clients[0];
    const c2 = clients[1];
    const n1 = getShortClientName(c1.name);
    const p1 = `PON ${c1.port != null ? c1.port : input.fallbackPort ?? 1}`;
    const n2 = getShortClientName(c2.name);
    const p2 = `PON ${c2.port != null ? c2.port : input.fallbackPort ?? 1}`;
    if (severity === "warning") {
      body = `${n1} (${p1}) y ${n2} (${p2}) registran atenuación óptica crítica.`;
    } else {
      body = `${n1} (${p1}) y ${n2} (${p2}) registran alarma LOS.`;
    }
  } else if (affectedCount === 3) {
    const c1 = clients[0];
    const c2 = clients[1];
    const c3 = clients[2];
    const n1 = getShortClientName(c1.name);
    const p1 = `PON ${c1.port != null ? c1.port : input.fallbackPort ?? 1}`;
    const n2 = getShortClientName(c2.name);
    const p2 = `PON ${c2.port != null ? c2.port : input.fallbackPort ?? 1}`;
    const n3 = getShortClientName(c3.name);
    const p3 = `PON ${c3.port != null ? c3.port : input.fallbackPort ?? 1}`;
    if (severity === "warning") {
      body = `${n1} (${p1}), ${n2} (${p2}) y ${n3} (${p3}) registran atenuación óptica crítica.`;
    } else {
      body = `${n1} (${p1}), ${n2} (${p2}) y ${n3} (${p3}) registran alarma LOS.`;
    }
  } else {
    // Más de 3 clientes: resumen compacto
    const c1 = clients[0];
    const c2 = clients[1];
    const n1 = getShortClientName(c1.name);
    const n2 = getShortClientName(c2.name);
    const remaining = affectedCount - 2;
    const ponsStr = ponsList.join(", ");
    if (severity === "warning") {
      body = `${n1}, ${n2} y ${remaining} clientes más con atenuación crítica en ${cardText} (${ponsStr}).`;
    } else {
      body = `${n1}, ${n2} y ${remaining} clientes más afectados en ${cardText} (${ponsStr}).`;
    }
  }

  // 7. Lista completa formateada para el payload data.clients
  const clientsData: ExpoNetworkAlertClientData[] = clients.map((c) => ({
    name: formatClientName(c.name),
    pon: `P${c.port != null ? c.port : input.fallbackPort ?? 1}`,
  }));

  return {
    to: input.token,
    title,
    subtitle,
    body,
    sound: "default",
    priority,
    channelId,
    color,
    collapseId: `star-network-${representativeBoards[0] || 1}`,
    data: {
      kind: "network_alert",
      severity,
      scope,
      card: cardText,
      pons: ponsList,
      affectedCount,
      clients: clientsData,
    },
  };
};

/**
 * Constructor de compatibilidad previa para alertas por puerto único.
 */
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
  channelId:
    input.incidentType === "resolved"
      ? "innover-success"
      : input.incidentType === "altered_power"
        ? "innover-warning"
        : "innover-critical",
  priority: input.incidentType === "resolved" ? "default" : "high",
  color:
    input.incidentType === "resolved"
      ? "#10B981"
      : input.incidentType === "altered_power"
        ? "#F59E0B"
        : "#EF4444",
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

const EXPO_CHUNK_SIZE = 100;
const EXPO_REQUEST_TIMEOUT_MS = 15_000;

export const sendExpoPushMessages = async (
  messages: ExpoPushMessage[],
): Promise<{ tickets: ExpoPushTicket[] }> => {
  if (!messages.length) return { tickets: [] };

  warnIfMissingExpoAccessToken();
  const headers = expoPushHeaders();
  const tickets: ExpoPushTicket[] = [];

  for (let i = 0; i < messages.length; i += EXPO_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + EXPO_CHUNK_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_SEND_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(EXPO_REQUEST_TIMEOUT_MS),
      });
      const payload = await response.json().catch(() => null);
      const parsed = normalizeExpoTickets(payload);

      if (!response.ok) {
        console.warn("[EXPO_PUSH] batch_send_failed", {
          chunkSize: chunk.length,
          status: response.status,
          errors:
            payload && typeof payload === "object"
              ? (payload as { errors?: unknown }).errors
              : null,
        });
      }

      for (let j = 0; j < chunk.length; j++) {
        const ticket = parsed[j] || {
          status: response.ok ? "ok" : "error",
          message: response.ok ? undefined : `HTTP ${response.status}`,
        };
        tickets.push(ticket);
      }
    } catch (error) {
      console.warn("[EXPO_PUSH] chunk_send_error", {
        chunkSize: chunk.length,
        error: error instanceof Error ? error.message : "unknown",
      });
      for (let j = 0; j < chunk.length; j++) {
        tickets.push({
          status: "error",
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  return { tickets };
};
