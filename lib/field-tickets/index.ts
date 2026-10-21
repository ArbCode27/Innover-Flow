export { mapFieldTicketRow } from "./map-row";
export {
  FIELD_TICKET_KINDS,
  FIELD_TICKET_OPEN_STATUSES,
  FIELD_TICKET_PRIORITIES,
  FIELD_TICKET_STATUSES,
  isOpenFieldTicketStatus,
} from "./types";
export type {
  FieldTicket,
  FieldTicketKind,
  FieldTicketListItem,
  FieldTicketPriority,
  FieldTicketStatus,
  Technician,
} from "./types";
export {
  FIELD_TICKET_KIND_LABELS,
  FIELD_TICKET_PRIORITY_LABELS,
  FIELD_TICKET_STATUS_LABELS,
  fieldTicketKindLabel,
  fieldTicketPriorityLabel,
  fieldTicketStatusLabel,
} from "./labels";
export {
  fieldTicketCategoryLabel,
  type TicketCategory,
} from "@/lib/ticket-categories";
export { digitsOnly, last10Digits, phonesMatchLast10 } from "./phone";
export {
  assertVisitWindowRange,
  datetimeLocalToIso,
  defaultVisitWindowLocal,
  toDatetimeLocalValue,
} from "./datetime-local";
export { buildMapsUrl, parseMapsUrlCoords } from "./maps-url";
export {
  conversationHasOpenTicket,
  openCasosForConversation,
  resolveTicketConversationId,
  ticketBelongsToClient,
} from "./conversation-match";
export {
  extractPublicIdFromText,
  matchTicketByPublicIdOrClientName,
} from "./ticket-match";
export {
  ASK_CLOSE_OBSERVATION,
  extractObservationAfterCloseCue,
  formatFinalizeConfirmation,
  looksLikeCloseIntent,
  looksLikeDetailRequest,
  looksLikeListRequest,
  observationLooksSufficient,
  shouldSkipDetailFastPath,
} from "./technician-intent";
