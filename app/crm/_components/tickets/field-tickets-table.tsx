"use client";

import { MapPin, MessageCircle, Pencil, Trash2, UserPlus, CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CRM_SURFACES, CRM_TABLE } from "../../_lib/crm-theme";
import {
  fieldTicketPriorityBadgeClass,
  fieldTicketPriorityRowClass,
} from "../../_lib/field-ticket-priority-styles";
import {
  buildMapsUrl,
  fieldTicketCategoryLabel,
  fieldTicketPriorityLabel,
  isOpenFieldTicketStatus,
  type FieldTicket,
} from "@/lib/field-tickets";
import { formatCrmDate } from "../../_lib/formatters";

interface FieldTicketsTableProps {
  tickets: FieldTicket[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenChat: (ticket: FieldTicket) => void;
  onDetail: (ticket: FieldTicket) => void;
  onEdit: (ticket: FieldTicket) => void;
  onFinalize: (ticket: FieldTicket) => void;
  onReassign: (ticket: FieldTicket) => void;
  onDelete: (ticket: FieldTicket) => void;
}

export const FieldTicketsTable = ({
  tickets,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenChat,
  onDetail,
  onEdit,
  onFinalize,
  onReassign,
  onDelete,
}: FieldTicketsTableProps) => {
  const allSelected = tickets.length > 0 && tickets.every((ticket) => selectedIds.includes(ticket.id));

  return (
    <div className={CRM_TABLE}>
      <div className="overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className={`${CRM_SURFACES.border} hover:bg-transparent`}>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onToggleSelectAll}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>#</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Prioridad</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Cliente</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Categoría</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Técnico</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Ubicación</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Creado</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length ? (
              tickets.map((ticket) => {
                const maps = buildMapsUrl({
                  mapsUrl: ticket.mapsUrl,
                  latitude: ticket.latitude,
                  longitude: ticket.longitude,
                });
                const open = isOpenFieldTicketStatus(ticket.status);
                return (
                  <TableRow
                    key={ticket.id}
                    className={cn(
                      CRM_SURFACES.border,
                      fieldTicketPriorityRowClass(ticket.priority),
                    )}
                    data-priority={ticket.priority}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(ticket.id)}
                        onCheckedChange={() => onToggleSelect(ticket.id)}
                        aria-label={`Seleccionar ticket ${ticket.publicId}`}
                      />
                    </TableCell>
                    <TableCell className={`font-mono ${CRM_SURFACES.textPrimary}`}>
                      #{ticket.publicId}
                    </TableCell>
                    <TableCell>
                      <Badge className={fieldTicketPriorityBadgeClass(ticket.priority)}>
                        {fieldTicketPriorityLabel(ticket.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className={CRM_SURFACES.textPrimary}>{ticket.clientName || "Sin nombre"}</div>
                      <div className={`text-xs ${CRM_SURFACES.textMuted}`}>
                        {ticket.clientPhone || "Sin teléfono"}
                      </div>
                    </TableCell>
                    <TableCell className={CRM_SURFACES.textSecondary}>
                      {fieldTicketCategoryLabel(ticket)}
                    </TableCell>
                    <TableCell className={CRM_SURFACES.textMuted}>
                      {ticket.employeeName || "Sin asignar"}
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <div className={`truncate text-sm ${CRM_SURFACES.textSecondary}`}>
                        {ticket.addressText || "Sin dirección"}
                      </div>
                      {maps ? (
                        <a
                          href={maps}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-crm-accent hover:underline">
                          <MapPin className="size-3" aria-hidden="true" />
                          Maps
                        </a>
                      ) : null}
                    </TableCell>
                    <TableCell className={CRM_SURFACES.textMuted}>
                      {formatCrmDate(ticket.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Chat"
                          onClick={() => onOpenChat(ticket)}>
                          <MessageCircle className="size-3.5" aria-hidden="true" />
                          Chat
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Detalle"
                          onClick={() => onDetail(ticket)}>
                          <Eye className="size-3.5" aria-hidden="true" />
                          Detalle
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Editar"
                          onClick={() => onEdit(ticket)}>
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Editar
                        </Button>
                        {open ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              aria-label="Finalizar"
                              onClick={() => onFinalize(ticket)}>
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                              Finalizar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              aria-label="Reasignar"
                              onClick={() => onReassign(ticket)}>
                              <UserPlus className="size-3.5" aria-hidden="true" />
                              Reasignar
                            </Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Eliminar"
                          onClick={() => onDelete(ticket)}>
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow className={CRM_SURFACES.border}>
                <TableCell colSpan={9} className={`h-24 text-center ${CRM_SURFACES.textMuted}`}>
                  Sin tickets con los filtros actuales.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
