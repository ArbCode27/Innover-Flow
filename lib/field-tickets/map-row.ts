import type {
  FieldTicket,
  FieldTicketKind,
  FieldTicketPriority,
  FieldTicketStatus,
} from "./types";

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIntOrNull = (value: unknown) => {
  const parsed = toNumberOrNull(value);
  return parsed == null ? null : Math.trunc(parsed);
};

export const mapFieldTicketRow = (
  row: Record<string, unknown>,
): FieldTicket => ({
  id: String(row.id),
  organizationId: String(row.organization_id || ""),
  issueId: String(row.issue_id || ""),
  publicId: Number(row.public_id || 0),
  conversationId: toIntOrNull(row.conversation_id),
  crmClientId: toIntOrNull(row.crm_client_id),
  employeeId: row.employee_id ? String(row.employee_id) : null,
  employeeName: row.employee_name ? String(row.employee_name) : null,
  employeePhone: row.employee_phone ? String(row.employee_phone) : null,
  employeeDocument: row.employee_document ? String(row.employee_document) : null,
  status: row.status as FieldTicketStatus,
  priority: row.priority as FieldTicketPriority,
  kind: row.kind as FieldTicketKind,
  categoryId: row.category_id ? String(row.category_id) : null,
  categoryName: row.category_name ? String(row.category_name) : null,
  title: String(row.title || ""),
  cause: row.cause ? String(row.cause) : null,
  description: row.description ? String(row.description) : null,
  clientName: row.client_name ? String(row.client_name) : null,
  clientPhone: row.client_phone ? String(row.client_phone) : null,
  mapsUrl: row.maps_url ? String(row.maps_url) : null,
  latitude: toNumberOrNull(row.latitude),
  longitude: toNumberOrNull(row.longitude),
  addressText: row.address_text ? String(row.address_text) : null,
  facadeMediaUrl: row.facade_media_url ? String(row.facade_media_url) : null,
  facadeMessageId: row.facade_message_id ? String(row.facade_message_id) : null,
  windowStart: row.window_start ? String(row.window_start) : null,
  windowEnd: row.window_end ? String(row.window_end) : null,
  lastTechnicianReportAt: row.last_technician_report_at
    ? String(row.last_technician_report_at)
    : null,
  lastTechnicianReportKey: row.last_technician_report_key
    ? String(row.last_technician_report_key)
    : null,
  closedAt: row.closed_at ? String(row.closed_at) : null,
  resolutionObservation: row.resolution_observation
    ? String(row.resolution_observation)
    : null,
  wisproIssueId: row.wispro_issue_id ? String(row.wispro_issue_id) : null,
  wisproOrderId: row.wispro_order_id ? String(row.wispro_order_id) : null,
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});
