import type {
  AfterHoursPaymentsConfig,
  OfficeHoursConfig,
} from "./office-hours";

export type AgentRole = "admin" | "agent";

export type AgentStatus = "online" | "busy" | "offline" | "inactive";

export type OrganizationRole = "owner" | "admin" | "supervisor" | "advisor";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  timezone: string;
  currency: string;
  status: "active" | "suspended" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface OrganizationAccess extends Organization {
  membership_role: OrganizationRole;
  is_current: boolean;
}

export interface OrganizationIntegration {
  provider: "wispro" | "whatsapp";
  status: "disconnected" | "pending" | "connected" | "error";
  config: Record<string, unknown>;
  has_credentials: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export type ClientAccountStatus =
  | "Al día"
  | "Con deuda"
  | "Suspendido"
  | "Prospecto";

export type ConversationStatus = "abierto" | "proceso" | "resuelto";

export type MessageType = "in" | "out" | "note";

export type MessageSenderType = "client" | "agent" | "bot";

export type MessageMediaType =
  | "audio"
  | "image"
  | "video"
  | "document"
  | "location";

export type TicketStatus = "Abierto" | "En proceso" | "Resuelto";

export type CrmView =
  | "dashboard"
  | "conversations"
  | "my-conversations"
  | "history"
  | "quick-replies"
  | "clients"
  | "payments"
  | "tickets"
  | "labels"
  | "agents"
  | "settings";

export type ConversationFilter = "all" | "unread" | "bot" | "human";

export type BotEngine = "ai";

export interface CrmSettings {
  id: number;
  bot_engine: BotEngine;
  ai_model: string;
  ai_system_prompt: string | null;
  payment_success_message: string | null;
  ai_recovery_messages?: import("./ai-recovery-messages").AiRecoveryMessages;
  office_hours?: OfficeHoursConfig;
  after_hours_payments?: AfterHoursPaymentsConfig;
  ui_accent?: import("./crm-accents").CrmAccentId | null;
  updated_at: string | null;
  updated_by: number | null;
}

export interface Agent {
  id: number;
  organization_id: string;
  name: string;
  email: string;
  password?: string;
  role: AgentRole;
  status: AgentStatus;
  initials: string | null;
  avatar_color: string | null;
  avatar_bg: string | null;
  max_conversations: number | null;
  ui_accent?: string | null;
  ui_mode?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Client {
  id: number;
  organization_id?: string;
  name: string;
  phone: string;
  plan: string | null;
  zone: string | null;
  account: ClientAccountStatus | null;
  wispro_id?: string | null;
  whatsapp_id?: string | null;
  wa_name?: string | null;
  color: string | null;
  bg: string | null;
  initials: string | null;
  envoicing?: string | null;
  created_at: string | null;
}

export interface WisproInvoicingSummary {
  debt: number;
  hasDebt: boolean;
  accountStatus: ClientAccountStatus;
  /** True when any Wispro contract is `disabled` (service cut). */
  serviceSuspended: boolean;
  /** Primary contract state used for messaging (disabled preferred if present). */
  contractState: string | null;
  /** Preferred contract UUID used for plan / PPP snapshot. */
  contractId?: string | null;
  /** Commercial plan name from Wispro `/plans`. */
  planName?: string | null;
  /** PPP profile name from Wispro (`ppp_profiles.name`). */
  pppProfile?: string | null;
  snapshot: {
    invoiceIndex: number;
    itemIndex: number;
    gross_amount: number;
    amount: number;
  } | null;
}

export interface WisproSearchResult {
  customer: WisproCustomer;
  invoicing: WisproInvoicingSummary;
}

export interface WisproCustomer {
  id: string;
  name: string;
  national_identification_number: string;
  phone_mobile?: string | null;
  zone_name?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface AssociateWisproInput {
  organizationId: string;
  conversationId: number;
  customer: WisproCustomer;
  invoicing: WisproInvoicingSummary;
  existingClientsCount?: number;
  existingClientId?: number | null;
  conversationPhone?: string | null;
  whatsappId?: string | null;
  waName?: string | null;
  /** Correlation id for server logs (optional). */
  linkId?: string | null;
}

export interface Conversation {
  id: number;
  organization_id: string;
  client_id: number | null;
  status: ConversationStatus;
  human_mode: boolean;
  bot_engine?: BotEngine | null;
  label_ids: number[];
  preview: string | null;
  unread: number | null;
  agent_id: number | null;
  agent_control?: string | null;
  customer_phone?: string | null;
  wa_phone_number_id?: string | null;
  last_message_at?: string | null;
  updated_at: string | null;
  created_at: string | null;
}

export interface Message {
  id: number;
  organization_id?: string;
  conversation_id: number;
  wa_message_id?: string | null;
  type: MessageType;
  content: string;
  media_url?: string | null;
  media_type?: MessageMediaType | null;
  mime_type?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_address?: string | null;
  sender_type: MessageSenderType;
  sent_by?: string | null;
  status?: "sent" | "delivered" | "read" | "failed" | null;
  created_at: string | null;
}

export interface MessageSnapshot {
  id: number;
  type: MessageType;
  content: string;
  sender_type: MessageSenderType;
  sent_by?: string | null;
  media_url?: string | null;
  media_type?: MessageMediaType | null;
  mime_type?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_address?: string | null;
  wa_message_id?: string | null;
  status?: "sent" | "delivered" | "read" | "failed" | null;
  created_at: string | null;
}

export interface HistoryMessage {
  id: number;
  history_id: number;
  source_message_id: number | null;
  source_conversation_id: number | null;
  type: MessageType;
  content: string;
  sender_type: MessageSenderType;
  sent_by?: string | null;
  media_url?: string | null;
  media_type?: MessageMediaType | null;
  mime_type?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_address?: string | null;
  wa_message_id?: string | null;
  status?: "sent" | "delivered" | "read" | "failed" | null;
  created_at: string;
  archived_at?: string | null;
}

export interface ConversationHistory {
  id: number;
  organization_id?: string;
  client_id: number | null;
  agent_id: number | null;
  client_name: string | null;
  client_phone: string | null;
  client_plan: string | null;
  client_zone: string | null;
  client_account: string | null;
  resolved_at: string;
  resolved_by: number | null;
  human_mode: boolean;
  label_ids: number[];
  wa_phone_number_id: string | null;
  total_messages: number;
  first_message_at: string | null;
  last_message_at: string | null;
  summary: string | null;
  created_at: string;
  history_messages?: HistoryMessage[];
}

export interface Label {
  id: number;
  organization_id?: string;
  name: string;
  color: string;
  bg: string;
  created_at: string | null;
}

export interface QuickReply {
  id: number;
  organization_id?: string;
  title: string;
  shortcut: string | null;
  content: string;
  category: string | null;
  is_active: boolean;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Ticket {
  id: string;
  organization_id?: string;
  client_id: number;
  type: string;
  status: TicketStatus;
  agent: string;
  description: string | null;
  created_at: string | null;
}

export interface CrmData {
  agents: Agent[];
  clients: Client[];
  conversations: Conversation[];
  labels: Label[];
  quickReplies: QuickReply[];
  tickets: Ticket[];
  settings: CrmSettings;
}

export interface CreateClientInput {
  name: string;
  phone: string;
  plan: string;
  zone: string;
  account: ClientAccountStatus;
}

export interface CreateTicketInput {
  clientId: number;
  type: string;
  agent: string;
  description: string;
}

export interface CreateLabelInput {
  name: string;
  color: string;
  bg: string;
}

export interface CreateQuickReplyInput {
  title: string;
  shortcut?: string;
  content: string;
  category?: string;
}

export interface UpdateQuickReplyInput {
  title: string;
  shortcut?: string;
  content: string;
  category?: string;
  is_active?: boolean;
}

export interface UpsertAgentInput {
  id?: number;
  name: string;
  email: string;
  password?: string;
  role: AgentRole;
  initials: string;
  maxConversations: number;
}
