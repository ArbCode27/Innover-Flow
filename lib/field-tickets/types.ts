export const FIELD_TICKET_STATUSES = ["open", "scheduled", "done", "cancelled"] as const;
export const FIELD_TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const FIELD_TICKET_KINDS = [
  "technical",
  "installation",
  "resignation",
  "feasibility",
] as const;
export const FIELD_TICKET_OPEN_STATUSES = ["open", "scheduled"] as const;

export type FieldTicketStatus = (typeof FIELD_TICKET_STATUSES)[number];
export type FieldTicketPriority = (typeof FIELD_TICKET_PRIORITIES)[number];
export type FieldTicketKind = (typeof FIELD_TICKET_KINDS)[number];

export type FieldTicket = {
  id: string;
  organizationId: string;
  issueId: string;
  publicId: number;
  conversationId: number | null;
  crmClientId: number | null;
  employeeId: string | null;
  employeeName: string | null;
  employeePhone: string | null;
  employeeDocument: string | null;
  status: FieldTicketStatus;
  priority: FieldTicketPriority;
  kind: FieldTicketKind;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  cause: string | null;
  description: string | null;
  clientName: string | null;
  clientPhone: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  addressText: string | null;
  facadeMediaUrl: string | null;
  facadeMessageId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  lastTechnicianReportAt: string | null;
  lastTechnicianReportKey: string | null;
  closedAt: string | null;
  resolutionObservation: string | null;
  wisproIssueId: string | null;
  wisproOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FieldTicketListItem = Omit<FieldTicket, "facadeMediaUrl"> & {
  facadeMediaUrl?: string | null;
};

export type Technician = {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  document: string | null;
  isSupervisor: boolean;
  appEnabled: boolean;
  sourceEmployeeId: string | null;
};

export const isOpenFieldTicketStatus = (
  status: string | null | undefined,
): status is (typeof FIELD_TICKET_OPEN_STATUSES)[number] =>
  status === "open" || status === "scheduled";
