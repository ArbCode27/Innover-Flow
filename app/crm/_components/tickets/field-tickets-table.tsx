"use client";

import { ArrowDown, ArrowUp, MapPin, MessageCircle, Pencil, Trash2, UserPlus, CheckCircle2, Eye } from "lucide-react";
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
import { CRM_SURFACES, CRM_TABLE } from "../../_lib/crm-theme";
import {
  buildMapsUrl,
  fieldTicketKindLabel,
  fieldTicketPriorityLabel,
  isOpenFieldTicketStatus,
  type FieldTicket,
} from "@/lib/field-tickets";
import { formatCrmDate } from "../../_lib/formatters";

interface FieldTicketsTableProps {
  tickets: FieldTicket[];
  selectedIds: string[];
  createdSort: "asc" | "desc";
  onToggleCreatedSort: () => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenChat: (ticket: FieldTicket) => void;
  onDetail: (ticket: FieldTicket) => void;
  onEdit: (ticket: FieldTicket) => void;
  onFinalize: (ticket: FieldTicket) => void;
  onReassign: (ticket: FieldTicket) => void;
  onDelete: (ticket: FieldTicket) => void;
}

const PRIORITY_CLASS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  medium: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  urgent: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

export const FieldTicketsTable = ({
  tickets,
  selectedIds,
  createdSort,
  onToggleCreatedSort,
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
              <TableHead className={CRM_SURFACES.textMuted}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={onToggleCreatedSort}
                  aria-label="Ordenar por fecha de creación">
                  Creado
                  {createdSort === "desc" ? (
                    <ArrowDown className="size-3" aria-hidden="true" />
                  ) : (
                    <ArrowUp className="size-3" aria-hidden="true" />
                  )}
                </button>
              </TableHead>
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
                  <TableRow key={ticket.id} className={`${CRM_SURFACES.border} ${CRM_SURFACES.hover}`}>
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
                      <Badge className={PRIORITY_CLASS[ticket.priority] || ""}>
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
                      {fieldTicketKindLabel(ticket.kind, ticket.title)}
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
