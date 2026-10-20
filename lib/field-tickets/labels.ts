import type {
  FieldTicketKind,
  FieldTicketPriority,
  FieldTicketStatus,
} from "./types";

export const FIELD_TICKET_KIND_LABELS: Record<FieldTicketKind, string> = {
  technical: "Visita técnica por falla",
  installation: "Instalación nueva",
  resignation: "Baja de servicio",
  feasibility: "Estudio de factibilidad",
};

export const FIELD_TICKET_PRIORITY_LABELS: Record<FieldTicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const FIELD_TICKET_STATUS_LABELS: Record<FieldTicketStatus, string> = {
  open: "Abierto",
  scheduled: "Agendado",
  done: "Cerrado",
  cancelled: "Cancelado",
};

export const fieldTicketKindLabel = (kind: string | null | undefined, fallback?: string) => {
  if (kind && kind in FIELD_TICKET_KIND_LABELS) {
    return FIELD_TICKET_KIND_LABELS[kind as FieldTicketKind];
  }
  return fallback?.trim() || "Sin categoría";
};

export const fieldTicketPriorityLabel = (priority: string | null | undefined) => {
  if (priority && priority in FIELD_TICKET_PRIORITY_LABELS) {
    return FIELD_TICKET_PRIORITY_LABELS[priority as FieldTicketPriority];
  }
  return "Media";
};

export const fieldTicketStatusLabel = (status: string | null | undefined) => {
  if (status && status in FIELD_TICKET_STATUS_LABELS) {
    return FIELD_TICKET_STATUS_LABELS[status as FieldTicketStatus];
  }
  return "Abierto";
};
