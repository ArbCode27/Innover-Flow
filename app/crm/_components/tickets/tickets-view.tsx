"use client";

import { useState } from "react";
import { Hammer, Plus } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import type { Agent, Client, CreateTicketInput, Ticket } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { TicketFormDialog } from "./ticket-form-dialog";
import { TicketsStats } from "./tickets-stats";
import { TicketsTable } from "./tickets-table";
import { WisproTicketModal } from "../conversations/wispro-ticket-modal";

interface TicketsViewProps {
  tickets: Ticket[];
  clients: Client[];
  clientsById: Map<number, Client>;
  agents: Agent[];
  onCreateTicket: (input: CreateTicketInput) => Promise<void>;
}

export const TicketsView = ({
  tickets,
  clients,
  clientsById,
  agents,
  onCreateTicket,
}: TicketsViewProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isWisproModalOpen, setIsWisproModalOpen] = useState(false);

  return (
    <div className={`crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6`}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>Tickets</h2>
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
            Seguimiento de incidencias, órdenes de trabajo y casos Wispro
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CrmButton
            type="button"
            variant="primary"
            onClick={() => setIsWisproModalOpen(true)}
            className="w-full sm:w-auto">
            <Hammer className="mr-2 size-4" aria-hidden="true" />
            Caso Wispro (Ticket + Orden)
          </CrmButton>
          <CrmButton
            type="button"
            variant="secondary"
            onClick={() => setIsDialogOpen(true)}
            className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Ticket interno
          </CrmButton>
        </div>
      </div>
      <div className="space-y-5">
        <TicketsStats tickets={tickets} />
        <TicketsTable tickets={tickets} clientsById={clientsById} />
      </div>
      <TicketFormDialog
        open={isDialogOpen}
        clients={clients}
        agents={agents}
        onOpenChange={setIsDialogOpen}
        onCreateTicket={onCreateTicket}
      />
      <WisproTicketModal
        open={isWisproModalOpen}
        onOpenChange={setIsWisproModalOpen}
      />
    </div>
  );
};
