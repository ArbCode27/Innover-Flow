import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertVisitWindowRange,
  buildMapsUrl,
  digitsOnly,
  last10Digits,
  parseMapsUrlCoords,
  phonesMatchLast10,
  ticketBelongsToClient,
  fieldTicketKindLabel,
  fieldTicketPriorityLabel,
  fieldTicketStatusLabel,
  type FieldTicket,
  type FieldTicketKind,
  type FieldTicketPriority,
  type FieldTicketStatus,
  type Technician,
} from "@/lib/field-tickets";
import { createHash } from "node:crypto";

const LIST_COLUMNS =
  "id, organization_id, issue_id, public_id, conversation_id, crm_client_id, employee_id, employee_name, employee_phone, employee_document, status, priority, kind, title, cause, description, client_name, client_phone, maps_url, latitude, longitude, address_text, facade_message_id, window_start, window_end, last_technician_report_at, last_technician_report_key, closed_at, resolution_observation, created_at, updated_at";

const DETAIL_COLUMNS = `${LIST_COLUMNS}, facade_media_url`;

export class FieldTicketError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "FieldTicketError";
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Número inválido" });
      return z.NEVER;
    }
    return parsed;
  });

export const createFieldTicketSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(80),
  description: optionalText(8000),
  cause: optionalText(240),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  kind: z.enum(["technical", "installation", "resignation", "feasibility"]),
  employeeId: z.string().trim().min(1).optional().nullable(),
  mapsUrl: optionalText(2000),
  latitude: optionalNumber,
  longitude: optionalNumber,
  addressText: optionalText(500),
  facadeMediaUrl: optionalText(2000),
  facadeMessageId: optionalText(200),
  windowStart: optionalText(80),
  windowEnd: optionalText(80),
  startAt: optionalText(80),
  endAt: optionalText(80),
  conversationId: z.number().int().positive().optional().nullable(),
  crmClientId: z.number().int().positive().optional().nullable(),
  clientName: optionalText(160),
  clientPhone: optionalText(30),
});

export const updateFieldTicketSchema = z.object({
  action: z.literal("update"),
  title: z.string().trim().min(1).max(80).optional(),
  cause: optionalText(240),
  description: optionalText(8000),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  kind: z.enum(["technical", "installation", "resignation", "feasibility"]).optional(),
  employeeId: z.string().trim().min(1).optional().nullable(),
  addressText: optionalText(500),
  mapsUrl: optionalText(2000),
  latitude: optionalNumber,
  longitude: optionalNumber,
  windowStart: optionalText(80),
  windowEnd: optionalText(80),
  status: z.enum(["open", "scheduled", "done", "cancelled"]).optional(),
  facadeMediaUrl: optionalText(2000),
  facadeMessageId: optionalText(200),
  clientName: optionalText(160),
  clientPhone: optionalText(30),
});

export const reassignFieldTicketSchema = z.object({
  action: z.literal("reassign"),
  employeeId: z.string().trim().min(1).nullable(),
});

export const finalizeFieldTicketSchema = z.object({
  action: z.literal("finalize"),
  observation: z.string().trim().min(3, "La observación debe tener al menos 3 caracteres").max(4000),
  source: z.enum(["crm", "technician"]).optional().default("crm"),
  technicianEmployeeId: z.string().trim().min(1).optional().nullable(),
});

export const fieldTicketPatchSchema = z.discriminatedUnion("action", [
  updateFieldTicketSchema,
  reassignFieldTicketSchema,
  finalizeFieldTicketSchema,
]);

export const bulkFieldTicketsSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reassign"),
    ids: z.array(z.string().uuid()).min(1),
    employeeId: z.string().trim().min(1).nullable(),
  }),
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1),
  }),
]);

type FieldTicketRow = Record<string, unknown>;

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIntOrNull = (value: unknown) => {
  const parsed = toNumberOrNull(value);
  return parsed == null ? null : Math.trunc(parsed);
};

export const mapFieldTicket = (row: FieldTicketRow): FieldTicket => ({
  id: String(row.id),
  organizationId: String(row.organization_id || ""),
  issueId: String(row.issue_id),
  publicId: Number(row.public_id),
  conversationId: toIntOrNull(row.conversation_id),
  crmClientId: toIntOrNull(row.crm_client_id),
  employeeId: row.employee_id ? String(row.employee_id) : null,
  employeeName: row.employee_name ? String(row.employee_name) : null,
  employeePhone: row.employee_phone ? String(row.employee_phone) : null,
  employeeDocument: row.employee_document ? String(row.employee_document) : null,
  status: row.status as FieldTicketStatus,
  priority: row.priority as FieldTicketPriority,
  kind: row.kind as FieldTicketKind,
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
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export const mapTechnician = (row: FieldTicketRow): Technician => ({
  id: String(row.id),
  organizationId: String(row.organization_id || ""),
  name: String(row.name || ""),
  phone: row.phone ? String(row.phone) : null,
  document: row.document ? String(row.document) : null,
  isSupervisor: Boolean(row.is_supervisor),
  sourceEmployeeId: row.source_employee_id ? String(row.source_employee_id) : null,
});

const resolveWindow = (start?: string | null, end?: string | null) => {
  const windowStart = start || null;
  const windowEnd = end || null;
  const range = assertVisitWindowRange(windowStart, windowEnd);
  if (!range.ok) {
    throw new FieldTicketError(
      "invalid_window",
      "La fecha de fin debe ser posterior o igual al inicio",
    );
  }
  return { windowStart, windowEnd };
};

const resolveGeo = (input: {
  mapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) => {
  const parsed = parseMapsUrlCoords(input.mapsUrl);
  const latitude = input.latitude ?? parsed?.latitude ?? null;
  const longitude = input.longitude ?? parsed?.longitude ?? null;
  const mapsUrl = buildMapsUrl({
    mapsUrl: input.mapsUrl,
    latitude,
    longitude,
  });
  return { mapsUrl, latitude, longitude };
};

export const listTechnicians = async (
  supabase: SupabaseClient,
  organizationId: string,
) => {
  const { data, error } = await supabase
    .from("technicians")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw error;
  return (data || []).map(mapTechnician);
};

export const upsertTechnician = async (
  supabase: SupabaseClient,
  organizationId: string,
  input: {
    id?: string | null;
    name: string;
    phone?: string | null;
    document?: string | null;
    isSupervisor?: boolean;
    sourceEmployeeId?: string | null;
  },
) => {
  const payload = {
    organization_id: organizationId,
    name: input.name.trim(),
    phone: input.phone || null,
    document: input.document || null,
    is_supervisor: Boolean(input.isSupervisor),
    source_employee_id: input.sourceEmployeeId || input.id || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data: byId } = await supabase
      .from("technicians")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", input.id)
      .maybeSingle();
    if (byId) {
      const { data, error } = await supabase
        .from("technicians")
        .update(payload)
        .eq("id", byId.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapTechnician(data);
    }
  }

  if (payload.source_employee_id) {
    const { data: bySource } = await supabase
      .from("technicians")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("source_employee_id", payload.source_employee_id)
      .maybeSingle();
    if (bySource) {
      const { data, error } = await supabase
        .from("technicians")
        .update(payload)
        .eq("id", bySource.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapTechnician(data);
    }
  }

  const { data, error } = await supabase
    .from("technicians")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapTechnician(data);
};

export const resolveTechnicianAssignment = async (
  supabase: SupabaseClient,
  organizationId: string,
  employeeId: string | null | undefined,
) => {
  if (!employeeId) {
    return {
      employee_id: null,
      employee_name: null,
      employee_phone: null,
      employee_document: null,
    };
  }

  const { data } = await supabase
    .from("technicians")
    .select("*")
    .eq("organization_id", organizationId)
    .or(`id.eq.${employeeId},source_employee_id.eq.${employeeId}`)
    .maybeSingle();

  if (!data) {
    throw new FieldTicketError("technician_not_found", "Técnico no encontrado", 404);
  }

  const technician = mapTechnician(data);
  return {
    employee_id: technician.id,
    employee_name: technician.name,
    employee_phone: technician.phone,
    employee_document: technician.document,
  };
};

export const toClientAppTicket = (ticket: FieldTicket) => ({
  id: ticket.id,
  public_id: ticket.publicId,
  status: ticket.status,
  status_label: fieldTicketStatusLabel(ticket.status),
  priority: ticket.priority,
  priority_label: fieldTicketPriorityLabel(ticket.priority),
  kind: ticket.kind,
  kind_label: fieldTicketKindLabel(ticket.kind),
  title: ticket.title,
  cause: ticket.cause,
  description: ticket.description,
  technician: ticket.employeeName
    ? {
        name: ticket.employeeName,
        phone: ticket.employeePhone,
      }
    : null,
  maps_url: ticket.mapsUrl,
  latitude: ticket.latitude,
  longitude: ticket.longitude,
  address: ticket.addressText,
  window_start: ticket.windowStart,
  window_end: ticket.windowEnd,
  closed_at: ticket.closedAt,
  resolution: ticket.resolutionObservation,
  created_at: ticket.createdAt,
  updated_at: ticket.updatedAt,
});

export const listFieldTicketsForClient = async (
  supabase: SupabaseClient,
  organizationId: string,
  input: { clientId: number; phone?: string | null },
) => {
  const { data: conversations, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("client_id", input.clientId);
  if (conversationError) throw conversationError;

  const conversationIds = (conversations || [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  const filters = [`crm_client_id.eq.${input.clientId}`];
  if (conversationIds.length) {
    filters.push(`conversation_id.in.(${conversationIds.join(",")})`);
  }

  const { data, error } = await supabase
    .from("field_tickets")
    .select(LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .or(filters.join(","))
    .order("created_at", { ascending: false });
  if (error) throw error;

  const byId = new Map(
    (data || []).map((row) => [String(row.id), mapFieldTicket(row)]),
  );

  const phoneDigits = last10Digits(input.phone);
  if (phoneDigits.length >= 7) {
    const { data: byPhone, error: phoneError } = await supabase
      .from("field_tickets")
      .select(LIST_COLUMNS)
      .eq("organization_id", organizationId)
      .ilike("client_phone", `%${phoneDigits}%`)
      .order("created_at", { ascending: false });
    if (phoneError) throw phoneError;
    for (const row of byPhone || []) {
      const ticket = mapFieldTicket(row);
      if (
        phonesMatchLast10(ticket.clientPhone, input.phone) &&
        !byId.has(ticket.id)
      ) {
        byId.set(ticket.id, ticket);
      }
    }
  }

  return [...byId.values()].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
};

export const getFieldTicketForClient = async (
  supabase: SupabaseClient,
  organizationId: string,
  ticketId: string,
  input: { clientId: number; phone?: string | null },
) => {
  const { data: conversations, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("client_id", input.clientId);
  if (conversationError) throw conversationError;

  const conversationIds = (conversations || [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ticketId,
    );
  const publicId = Number(ticketId);

  let query = supabase
    .from("field_tickets")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", organizationId);

  query = isUuid
    ? query.eq("id", ticketId)
    : Number.isInteger(publicId) && publicId > 0
      ? query.eq("public_id", publicId)
      : query.eq("id", ticketId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new FieldTicketError("not_found", "Ticket no encontrado", 404);
  }

  const ticket = mapFieldTicket(data);
  const belongs = ticketBelongsToClient(ticket, {
    id: input.clientId,
    phone: input.phone,
    conversationIds,
  });
  if (!belongs) {
    throw new FieldTicketError("not_found", "Ticket no encontrado", 404);
  }
  return ticket;
};

export const listFieldTickets = async (
  supabase: SupabaseClient,
  organizationId: string,
) => {
  const { data, error } = await supabase
    .from("field_tickets")
    .select(LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapFieldTicket);
};

export const getFieldTicket = async (
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
) => {
  const { data, error } = await supabase
    .from("field_tickets")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new FieldTicketError("not_found", "Ticket no encontrado", 404);
  }
  return mapFieldTicket(data);
};

export const createFieldTicket = async (
  supabase: SupabaseClient,
  organizationId: string,
  input: z.infer<typeof createFieldTicketSchema>,
) => {
  const window = resolveWindow(
    input.windowStart || input.startAt,
    input.windowEnd || input.endAt,
  );
  const geo = resolveGeo(input);
  const assignment = await resolveTechnicianAssignment(
    supabase,
    organizationId,
    input.employeeId,
  );
  const hasWindow = Boolean(window.windowStart || window.windowEnd);
  const status: FieldTicketStatus =
    assignment.employee_id && hasWindow ? "scheduled" : "open";

  const { data, error } = await supabase
    .from("field_tickets")
    .insert({
      organization_id: organizationId,
      conversation_id: input.conversationId || null,
      crm_client_id: input.crmClientId || null,
      ...assignment,
      status,
      priority: input.priority,
      kind: input.kind,
      title: input.title,
      cause: input.cause,
      description: input.description,
      client_name: input.clientName,
      client_phone: input.clientPhone,
      maps_url: geo.mapsUrl,
      latitude: geo.latitude,
      longitude: geo.longitude,
      address_text: input.addressText,
      facade_media_url: input.facadeMediaUrl,
      facade_message_id: input.facadeMessageId,
      window_start: window.windowStart,
      window_end: window.windowEnd,
    })
    .select(DETAIL_COLUMNS)
    .single();

  if (error) throw error;
  return mapFieldTicket(data);
};

export const updateFieldTicket = async (
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
  input: z.infer<typeof updateFieldTicketSchema>,
) => {
  const current = await getFieldTicket(supabase, organizationId, id);
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.cause !== undefined) patch.cause = input.cause;
  if (input.description !== undefined) patch.description = input.description;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.addressText !== undefined) patch.address_text = input.addressText;
  if (input.clientName !== undefined) patch.client_name = input.clientName;
  if (input.clientPhone !== undefined) patch.client_phone = input.clientPhone;
  if (input.facadeMediaUrl !== undefined) patch.facade_media_url = input.facadeMediaUrl;
  if (input.facadeMessageId !== undefined) patch.facade_message_id = input.facadeMessageId;
  if (input.status !== undefined) patch.status = input.status;

  if (
    input.mapsUrl !== undefined ||
    input.latitude !== undefined ||
    input.longitude !== undefined
  ) {
    const geo = resolveGeo({
      mapsUrl: input.mapsUrl !== undefined ? input.mapsUrl : current.mapsUrl,
      latitude: input.latitude !== undefined ? input.latitude : current.latitude,
      longitude: input.longitude !== undefined ? input.longitude : current.longitude,
    });
    patch.maps_url = geo.mapsUrl;
    patch.latitude = geo.latitude;
    patch.longitude = geo.longitude;
  }

  if (input.windowStart !== undefined || input.windowEnd !== undefined) {
    const window = resolveWindow(
      input.windowStart !== undefined ? input.windowStart : current.windowStart,
      input.windowEnd !== undefined ? input.windowEnd : current.windowEnd,
    );
    patch.window_start = window.windowStart;
    patch.window_end = window.windowEnd;
  }

  if (input.employeeId !== undefined) {
    Object.assign(
      patch,
      await resolveTechnicianAssignment(supabase, organizationId, input.employeeId),
    );
  }

  if (input.status === undefined && (patch.window_start || patch.employee_id)) {
    const nextStatus = current.status;
    if (nextStatus === "open" && (patch.window_start || current.windowStart) && (patch.employee_id || current.employeeId)) {
      patch.status = "scheduled";
    }
  }

  const { data, error } = await supabase
    .from("field_tickets")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  return mapFieldTicket(data);
};

export const reassignFieldTicket = async (
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
  employeeId: string | null,
) => {
  const assignment = await resolveTechnicianAssignment(
    supabase,
    organizationId,
    employeeId,
  );
  const current = await getFieldTicket(supabase, organizationId, id);
  const patch: Record<string, unknown> = { ...assignment };
  if (
    current.status === "open" &&
    assignment.employee_id &&
    (current.windowStart || current.windowEnd)
  ) {
    patch.status = "scheduled";
  }

  const { data, error } = await supabase
    .from("field_tickets")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  return mapFieldTicket(data);
};

const observationKey = (ticketId: string, observation: string) =>
  createHash("sha256").update(`${ticketId}:${observation.trim()}`).digest("hex");

export const finalizeFieldTicket = async (
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
  input: {
    observation: string;
    source?: "crm" | "technician";
    technicianEmployeeId?: string | null;
  },
) => {
  const current = await getFieldTicket(supabase, organizationId, id);
  if (current.status === "done") {
    throw new FieldTicketError("already_closed", "Este ticket ya está cerrado", 409);
  }

  if (input.source === "technician") {
    if (
      !current.employeeId ||
      !input.technicianEmployeeId ||
      current.employeeId !== input.technicianEmployeeId
    ) {
      throw new FieldTicketError(
        "forbidden",
        "Este caso no está asignado a ti",
        403,
      );
    }
  }

  const observation = input.observation.trim();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_tickets")
    .update({
      status: "done",
      closed_at: now,
      resolution_observation: observation,
      last_technician_report_at: now,
      last_technician_report_key: observationKey(id, observation),
    })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  return mapFieldTicket(data);
};

export const deleteFieldTicket = async (
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
) => {
  const { error } = await supabase
    .from("field_tickets")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw error;
};

export const bulkReassignFieldTickets = async (
  supabase: SupabaseClient,
  organizationId: string,
  ids: string[],
  employeeId: string | null,
) => {
  const results = [];
  for (const id of ids) {
    results.push(await reassignFieldTicket(supabase, organizationId, id, employeeId));
  }
  return results;
};

export const bulkDeleteFieldTickets = async (
  supabase: SupabaseClient,
  organizationId: string,
  ids: string[],
) => {
  const { error } = await supabase
    .from("field_tickets")
    .delete()
    .in("id", ids)
    .eq("organization_id", organizationId);
  if (error) throw error;
};

export const listPendingTicketsForEmployee = async (
  supabase: SupabaseClient,
  organizationId: string,
  employeeId: string,
) => {
  const { data, error } = await supabase
    .from("field_tickets")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("employee_id", employeeId)
    .in("status", ["open", "scheduled"])
    .order("window_start", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []).map(mapFieldTicket);
};

export const listOpenTicketsForConversation = async (
  supabase: SupabaseClient,
  organizationId: string,
  input: { conversationId: number; crmClientId?: number | null },
) => {
  let query = supabase
    .from("field_tickets")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", organizationId)
    .in("status", ["open", "scheduled"]);

  if (input.crmClientId) {
    query = query.or(
      `conversation_id.eq.${input.conversationId},crm_client_id.eq.${input.crmClientId}`,
    );
  } else {
    query = query.eq("conversation_id", input.conversationId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapFieldTicket);
};

export const identifyTechnician = async (
  supabase: SupabaseClient,
  organizationId: string,
  input: { phone?: string | null; document?: string | null },
): Promise<Technician | null> => {
  const phoneTail = last10Digits(input.phone);
  const document = digitsOnly(input.document);

  const { data: technicians, error } = await supabase
    .from("technicians")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;

  const mapped = (technicians || []).map(mapTechnician);
  if (phoneTail.length >= 7) {
    const byPhone = mapped.filter(
      (item) => last10Digits(item.phone) === phoneTail,
    );
    if (byPhone.length === 1) return byPhone[0];
  }
  if (document.length >= 5) {
    const byDoc = mapped.filter((item) => digitsOnly(item.document) === document);
    if (byDoc.length === 1) return byDoc[0];
  }

  if (phoneTail.length >= 7) {
    const { data: tickets } = await supabase
      .from("field_tickets")
      .select("employee_id, employee_name, employee_phone, employee_document")
      .eq("organization_id", organizationId)
      .not("employee_id", "is", null)
      .limit(200);
    const match = (tickets || []).find(
      (row) => last10Digits(String(row.employee_phone || "")) === phoneTail,
    );
    if (match?.employee_id) {
      return {
        id: String(match.employee_id),
        organizationId,
        name: String(match.employee_name || "Técnico"),
        phone: match.employee_phone ? String(match.employee_phone) : input.phone || null,
        document: match.employee_document ? String(match.employee_document) : null,
        isSupervisor: false,
        sourceEmployeeId: String(match.employee_id),
      };
    }
  }

  return null;
};

export const supervisorPhonesFromEnv = () =>
  String(process.env.FIELD_TICKET_SUPERVISOR_PHONES || "")
    .split(",")
    .map((item) => last10Digits(item))
    .filter((item) => item.length >= 7);

export const isTechnicianSupervisor = (technician: Technician) => {
  if (technician.isSupervisor) return true;
  return supervisorPhonesFromEnv().includes(last10Digits(technician.phone));
};
