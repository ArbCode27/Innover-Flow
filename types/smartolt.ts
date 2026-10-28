export type SmartOltStatus = "Online" | "LOS" | "Power fail" | "Offline" | string;

export interface ClientOnu {
  id?: number;
  client_id?: number;
  onu_external_id: string;
  sn: string;
  olt_id?: string | null;
  board?: number | null;
  port?: number | null;
  onu_number?: number | null;
  rx_signal?: number | null;
  status?: SmartOltStatus | null;
  zone?: string | null;
  status_changed_at?: string | null;
  signal_changed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// ==========================================
// Webhook Payloads de SmartOLT
// ==========================================

export type SmartOltWebhookEventType =
  | "onu.status_changed"
  | "onu.signal_changed"
  | "onu.signal_reading"
  | "onu.rx1490_reading"
  | "onu.updated"
  | string;

export interface SmartOltWebhookPayload {
  event?: SmartOltWebhookEventType;
  action?: string;
  type?: string;
  onu_external_id?: string;
  unique_external_id?: string;
  sn?: string;
  status?: string;
  onu_status?: string;
  signal?: string | number;
  rx_signal?: string | number;
  rx_power?: string | number;
  rx1490?: string | number;
  board?: number | string;
  port?: number | string;
  zone?: string;
  olt_id?: string | number;
  timestamp?: string | number;
  [key: string]: unknown;
}

// ==========================================
// Diagnóstico en Vivo (get_onu_full_status_info)
// ==========================================

export interface SmartOltLanPortStatus {
  port: number | string;
  status: "Up" | "Down" | string;
  speed?: string;
  duplex?: string;
}

export interface SmartOltFullStatusInfo {
  status: boolean;
  onu_status: SmartOltStatus;
  onu_signal?: string | null;
  onu_signal_1310?: string | null;
  onu_signal_1490?: string | null;
  olt_rx_signal?: string | null;
  rx_power?: number | null;
  tx_power?: number | null;
  temperature?: string | null;
  voltage?: string | null;
  catv?: string | null;
  uptime?: string | null;
  distance?: string | null;
  lan_ports?: SmartOltLanPortStatus[];
  board?: number | null;
  port?: number | null;
  onu_number?: number | null;
  last_online?: string | null;
  last_offline?: string | null;
  offline_reason?: string | null;
  raw?: Record<string, unknown>;
}

// ==========================================
// Monitoreo e Incidencias en CRM
// ==========================================

export type IncidentCategory = "port_outage" | "altered_power" | "single_los";

export interface AffectedClient {
  id: number;
  clientId: number;
  name: string;
  phone: string | null;
  cedula: string | null;
  zone: string | null;
  board: number;
  port: number;
  sn: string;
  onuExternalId: string;
  status: string;
  rxSignal: number | null;
  incidentType: "LOS" | "Potencia alterada" | "Power fail" | "Offline";
  startedAt: string;
  durationMs: number;
  durationText: string;
}

export interface MonitoringIncident {
  id: string;
  category: IncidentCategory;
  title: string;
  description: string;
  board: number;
  port: number;
  affectedCount: number;
  severity: "critical" | "warning";
  startedAt: string;
  durationText: string;
  clients: AffectedClient[];
  managerAlertSent?: boolean;
  managerAlertSentAt?: string | null;
  managerAlertAgo?: string | null;
}

export interface MonitoringSummaryMetrics {
  totalOnus: number;
  totalOnline: number;
  totalLos: number;
  totalAlteredPower: number;
  totalPowerFail: number;
  totalOffline: number;
  totalPortsInAlert: number;
}
