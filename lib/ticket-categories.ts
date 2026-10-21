import {
  FIELD_TICKET_KINDS,
  type FieldTicketKind,
} from "@/lib/field-tickets/types";
import { FIELD_TICKET_KIND_LABELS } from "@/lib/field-tickets/labels";

export type TicketCategory = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  kind: FieldTicketKind;
  sortOrder: number;
  isActive: boolean;
};

export const DEFAULT_TICKET_CATEGORIES: Array<{
  slug: FieldTicketKind;
  name: string;
  kind: FieldTicketKind;
  sortOrder: number;
}> = FIELD_TICKET_KINDS.map((kind, index) => ({
  slug: kind,
  name: FIELD_TICKET_KIND_LABELS[kind],
  kind,
  sortOrder: index,
}));

export const mapTicketCategoryRow = (
  row: Record<string, unknown>,
): TicketCategory => ({
  id: String(row.id),
  organizationId: String(row.organization_id || ""),
  name: String(row.name || ""),
  slug: String(row.slug || ""),
  kind: (FIELD_TICKET_KINDS.includes(row.kind as FieldTicketKind)
    ? row.kind
    : "technical") as FieldTicketKind,
  sortOrder: Number(row.sort_order || 0),
  isActive: row.is_active !== false,
});

export const fieldTicketCategoryLabel = (ticket: {
  categoryName?: string | null;
  kind?: string | null;
  title?: string | null;
}) => {
  const fromCatalog = ticket.categoryName?.trim();
  if (fromCatalog) return fromCatalog;
  const kind = ticket.kind;
  if (kind && kind in FIELD_TICKET_KIND_LABELS) {
    return FIELD_TICKET_KIND_LABELS[kind as FieldTicketKind];
  }
  return ticket.title?.trim() || "Sin categoría";
};
