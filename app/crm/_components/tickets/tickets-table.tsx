import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CRM_SURFACES, CRM_TABLE } from "../../_lib/crm-theme";
import type { Client, Ticket } from "../../_lib/types";
import { formatCrmDate } from "../../_lib/formatters";
import { AvatarInitials } from "../shared/avatar-initials";
import { StatusBadge } from "../shared/status-badge";

interface TicketsTableProps {
  tickets: Ticket[];
  clientsById: Map<number, Client>;
}

export const TicketsTable = ({ tickets, clientsById }: TicketsTableProps) => (
  <div className={CRM_TABLE}>
    <div className="overflow-x-auto">
      <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow className={`${CRM_SURFACES.border} hover:bg-transparent`}>
          <TableHead className={CRM_SURFACES.textMuted}>ID</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Cliente</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Tipo</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Estado</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Agente</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Creado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.length ? (
          tickets.map((ticket) => {
            const client = clientsById.get(ticket.client_id);

            return (
              <TableRow key={ticket.id} className={`${CRM_SURFACES.border} ${CRM_SURFACES.hover}`}>
                <TableCell className={`font-mono ${CRM_SURFACES.textMuted}`}>{ticket.id}</TableCell>
                <TableCell>
                  {client ? (
                    <div className="flex items-center gap-2">
                      <AvatarInitials
                        name={client.name}
                        initials={client.initials}
                        color={client.color}
                        bg={client.bg}
                        size="sm"
                      />
                      <span className={`font-medium ${CRM_SURFACES.textPrimary}`}>{client.name}</span>
                    </div>
                  ) : (
                    <span className={CRM_SURFACES.textMuted}>Cliente no encontrado</span>
                  )}
                </TableCell>
                <TableCell className={CRM_SURFACES.textSecondary}>{ticket.type}</TableCell>
                <TableCell>
                  <StatusBadge status={ticket.status} />
                </TableCell>
                <TableCell className={CRM_SURFACES.textMuted}>{ticket.agent}</TableCell>
                <TableCell className={CRM_SURFACES.textMuted}>
                  {formatCrmDate(ticket.created_at)}
                </TableCell>
              </TableRow>
            );
          })
        ) : (
          <TableRow className={CRM_SURFACES.border}>
            <TableCell colSpan={6} className={`h-24 text-center ${CRM_SURFACES.textMuted}`}>
              Sin tickets.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      </Table>
    </div>
  </div>
);
