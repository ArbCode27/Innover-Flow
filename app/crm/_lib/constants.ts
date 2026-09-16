import type { AgentStatus, ClientAccountStatus, ConversationFilter, CrmView, TicketStatus } from "./types";

export const CRM_STORAGE_KEY = "innover_crm_agent";

export const CRM_NAV_ITEMS: Array<{
  id: CrmView;
  label: string;
}> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "conversations", label: "Conversaciones" },
  { id: "my-conversations", label: "Mis asignadas" },
  { id: "history", label: "Historial" },
  { id: "quick-replies", label: "Respuestas rápidas" },
  { id: "clients", label: "Clientes" },
  { id: "payments", label: "Pagos" },
  { id: "tickets", label: "Tickets" },
  { id: "labels", label: "Etiquetas" },
  { id: "agents", label: "Agentes" },
  { id: "settings", label: "Ajustes" },
];

export const CONVERSATION_FILTERS: Array<{
  id: ConversationFilter;
  label: string;
}> = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "No leídas" },
  { id: "bot", label: "Bot" },
  { id: "human", label: "Humano" },
];

export const AGENT_STATUSES: AgentStatus[] = ["online", "busy", "offline"];

export const ACCOUNT_STATUSES: ClientAccountStatus[] = [
  "Al día",
  "Con deuda",
  "Suspendido",
  "Prospecto",
];

export const TICKET_STATUSES: TicketStatus[] = [
  "Abierto",
  "En proceso",
  "Resuelto",
];

export const INTERNET_PLANS = [
  "Internet 10 Mbps",
  "Internet 20 Mbps",
  "Internet 30 Mbps",
  "Internet 50 Mbps",
  "Internet 100 Mbps",
];

export const TICKET_TYPES = [
  "Falla de conexión",
  "Consulta factura",
  "Cambio de plan",
  "Instalación",
  "Consulta comercial",
  "Otro",
];

export const CRM_COLORS = [
  { color: "#4f8ef7", bg: "rgba(79,142,247,.15)" },
  { color: "#3ecf8e", bg: "rgba(62,207,142,.15)" },
  { color: "#f5a524", bg: "rgba(245,165,36,.15)" },
  { color: "#f04444", bg: "rgba(240,68,68,.15)" },
  { color: "#a78bfa", bg: "rgba(167,139,250,.15)" },
  { color: "#f472b6", bg: "rgba(244,114,182,.15)" },
  { color: "#34d399", bg: "rgba(52,211,153,.15)" },
  { color: "#fb923c", bg: "rgba(251,146,60,.15)" },
  { color: "#22d3ee", bg: "rgba(34,211,238,.15)" },
  { color: "#a3e635", bg: "rgba(163,230,53,.15)" },
];

export const STATUS_LABELS: Record<string, string> = {
  abierto: "Abierto",
  proceso: "En proceso",
  resuelto: "Resuelto",
  bot: "Bot",
  human: "Humano",
  online: "En línea",
  busy: "Ocupado",
  offline: "Desconectado",
  inactive: "Inactivo",
  RECIBIDO: "Recibido",
  EN_PROCESO: "En proceso",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  DUPLICADO: "Duplicado",
  ERROR: "Error",
};
