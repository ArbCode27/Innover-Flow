"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import {
  fieldTicketCategoryLabel,
  sortFieldTicketsByPriorityThenSchedule,
  type FieldTicket,
  type Technician,
} from "@/lib/field-tickets";
import type { TicketCategory } from "@/lib/ticket-categories";
import { FieldTicketsTable } from "./field-tickets-table";
import { FieldTicketFormDialog } from "./field-ticket-form-dialog";
import { FieldTicketDetailDialog } from "./field-ticket-detail-dialog";
import { FieldTicketFinalizeDialog } from "./field-ticket-finalize-dialog";
import { FieldTicketReassignDialog } from "./field-ticket-reassign-dialog";
import type { Client } from "../../_lib/types";
import type { CreatePayload } from "../../_hooks/use-field-tickets";
import { LoadingState } from "../shared/loading-state";

type StatusTab = "all" | "open" | "scheduled" | "done" | "cancelled";

interface FieldTicketsViewProps {
  tickets: FieldTicket[];
  technicians: Technician[];
  categories: TicketCategory[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onCreate: (payload: CreatePayload) => Promise<FieldTicket>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<FieldTicket>;
  onFinalize: (id: string, observation: string) => Promise<FieldTicket>;
  onReassign: (id: string, employeeId: string | null) => Promise<FieldTicket>;
  onDelete: (id: string) => Promise<void>;
  onBulkReassign: (ids: string[], employeeId: string | null) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onGetTicket: (id: string) => Promise<FieldTicket>;
  onUploadFacade: (file: File) => Promise<string>;
  onOpenChat: (conversationId: number) => void;
  resolveConversationId: (ticket: FieldTicket) => number | null;
  clients?: Client[];
}

const matchesSearch = (ticket: FieldTicket, term: string) => {
  if (!term) return true;
  const haystack = [
    ticket.clientName,
    ticket.clientPhone,
    String(ticket.publicId),
    fieldTicketCategoryLabel(ticket),
    ticket.title,
    ticket.employeeName,
    ticket.addressText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
};

export const FieldTicketsView = ({
  tickets,
  technicians,
  categories,
  isLoading,
  error,
  onCreate,
  onUpdate,
  onFinalize,
  onReassign,
  onDelete,
  onBulkReassign,
  onBulkDelete,
  onGetTicket,
  onUploadFacade,
  onOpenChat,
  resolveConversationId,
  clients = [],
}: FieldTicketsViewProps) => {
  const [statusTab, setStatusTab] = useState<StatusTab>("scheduled");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [technicianId, setTechnicianId] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTicket | null>(null);
  const [detail, setDetail] = useState<FieldTicket | null>(null);
  const [finalizing, setFinalizing] = useState<FieldTicket | null>(null);
  const [reassigning, setReassigning] = useState<FieldTicket | null>(null);
  const [bulkReassignOpen, setBulkReassignOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const next = tickets.filter((ticket) => {
      if (statusTab !== "all" && ticket.status !== statusTab) return false;
      if (priority !== "all" && ticket.priority !== priority) return false;
      if (technicianId === "unassigned" && ticket.employeeId) return false;
      if (technicianId !== "all" && technicianId !== "unassigned" && ticket.employeeId !== technicianId) {
        return false;
      }
      return matchesSearch(ticket, term);
    });
    return sortFieldTicketsByPriorityThenSchedule(next);
  }, [tickets, statusTab, search, priority, technicianId]);

  const handleOpenChat = (ticket: FieldTicket) => {
    const conversationId = resolveConversationId(ticket);
    if (!conversationId) {
      toast.error("Este ticket no tiene un chat vinculado");
      return;
    }
    onOpenChat(conversationId);
  };

  const handleDetail = async (ticket: FieldTicket) => {
    const full = ticket.facadeMediaUrl ? ticket : await onGetTicket(ticket.id);
    setDetail(full);
  };

  const handleEdit = async (ticket: FieldTicket) => {
    const full = await onGetTicket(ticket.id);
    setEditing(full);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((current) =>
      filtered.every((ticket) => current.includes(ticket.id))
        ? []
        : filtered.map((ticket) => ticket.id),
    );
  };

  return (
    <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
            Tickets de campo
          </h2>
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
            Visitas técnicas, instalaciones, bajas y factibilidad
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Crear ticket
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as StatusTab)}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="open">Abiertos</TabsTrigger>
            <TabsTrigger value="scheduled">Agendados</TabsTrigger>
            <TabsTrigger value="done">Cerrados</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente, teléfono, #, categoría, técnico, dirección"
            className={`min-w-[16rem] flex-1 ${CRM_SURFACES.input}`}
            aria-label="Buscar tickets"
          />
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className={`w-40 ${CRM_SURFACES.input}`}>
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda prioridad</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={technicianId} onValueChange={setTechnicianId}>
            <SelectTrigger className={`w-48 ${CRM_SURFACES.input}`}>
              <SelectValue placeholder="Técnico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los técnicos</SelectItem>
              <SelectItem value="unassigned">Sin asignar</SelectItem>
              {technicians.map((technician) => (
                <SelectItem key={technician.id} value={technician.id}>
                  {technician.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedIds.length ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setBulkReassignOpen(true)}>
              Reasignar seleccionados
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void onBulkDelete(selectedIds).then(() => setSelectedIds([]))}>
              Eliminar seleccionados
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState label="Cargando tickets..." />
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : (
        <FieldTicketsTable
          tickets={filtered}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onOpenChat={handleOpenChat}
          onDetail={(ticket) => void handleDetail(ticket)}
          onEdit={(ticket) => void handleEdit(ticket)}
          onFinalize={setFinalizing}
          onReassign={setReassigning}
          onDelete={(ticket) => void onDelete(ticket.id)}
        />
      )}

      <FieldTicketFormDialog
        open={isCreateOpen}
        mode="create"
        technicians={technicians}
        categories={categories}
        clients={clients}
        onOpenChange={setIsCreateOpen}
        onUploadFacade={onUploadFacade}
        onSubmitCreate={async (payload) => {
          await onCreate(payload);
        }}
        onSubmitUpdate={async () => undefined}
      />
      <FieldTicketFormDialog
        open={Boolean(editing)}
        mode="edit"
        technicians={technicians}
        categories={categories}
        clients={clients}
        ticket={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onUploadFacade={onUploadFacade}
        onSubmitCreate={async () => undefined}
        onSubmitUpdate={async (id, payload) => {
          await onUpdate(id, payload);
        }}
      />
      <FieldTicketDetailDialog
        open={Boolean(detail)}
        ticket={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
      <FieldTicketFinalizeDialog
        open={Boolean(finalizing)}
        ticket={finalizing}
        onOpenChange={(open) => {
          if (!open) setFinalizing(null);
        }}
        onFinalize={onFinalize}
      />
      <FieldTicketReassignDialog
        open={Boolean(reassigning)}
        technicians={technicians}
        onOpenChange={(open) => {
          if (!open) setReassigning(null);
        }}
        onReassign={async (employeeId) => {
          if (!reassigning) return;
          await onReassign(reassigning.id, employeeId);
        }}
      />
      <FieldTicketReassignDialog
        open={bulkReassignOpen}
        technicians={technicians}
        count={selectedIds.length}
        onOpenChange={setBulkReassignOpen}
        onReassign={async (employeeId) => {
          await onBulkReassign(selectedIds, employeeId);
          setSelectedIds([]);
        }}
      />
    </div>
  );
};
