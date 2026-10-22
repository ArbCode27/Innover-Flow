import { toClientAppTicket } from "@/app/api/crm/_lib/field-tickets";
import type { FieldTicket } from "@/lib/field-tickets/types";

export const toTechnicianCasoDto = (ticket: FieldTicket) => {
  const lean = toClientAppTicket(ticket);
  return {
    id: lean.id,
    wispro_issue_id: ticket.wisproIssueId,
    wispro_public_id: ticket.publicId,
    title: lean.title,
    cause: lean.cause,
    status: lean.status,
    priority: lean.priority,
    client_name: ticket.clientName,
    client_phone: ticket.clientPhone,
    maps_url: lean.maps_url,
    latitude: lean.latitude,
    longitude: lean.longitude,
    address_text: lean.address,
    window_start: lean.window_start,
    window_end: lean.window_end,
    facade_media_url: ticket.facadeMediaUrl,
    resolution_observation: ticket.resolutionObservation,
    employee_id: ticket.employeeId,
    employee_name: ticket.employeeName,
    closed_at: ticket.closedAt,
  };
};
