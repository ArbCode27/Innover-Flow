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
import { AvatarInitials } from "../shared/avatar-initials";
import { StatusBadge } from "../shared/status-badge";

interface ClientsTableProps {
  clients: Client[];
  tickets: Ticket[];
}

export const ClientsTable = ({ clients, tickets }: ClientsTableProps) => (
  <div className={CRM_TABLE}>
    <div className="overflow-x-auto">
      <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow className={`${CRM_SURFACES.border} hover:bg-transparent`}>
          <TableHead className={CRM_SURFACES.textMuted}>Cliente</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Teléfono</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Plan</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Zona</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Estado</TableHead>
          <TableHead className={CRM_SURFACES.textMuted}>Tickets</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.length ? (
          clients.map((client) => {
            const openTickets = tickets.filter(
              (ticket) => ticket.client_id === client.id && ticket.status !== "Resuelto"
            );

            return (
              <TableRow key={client.id} className={`${CRM_SURFACES.border} ${CRM_SURFACES.hover}`}>
                <TableCell>
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
                </TableCell>
                <TableCell className={`font-mono ${CRM_SURFACES.textMuted}`}>{client.phone}</TableCell>
                <TableCell className={CRM_SURFACES.textSecondary}>{client.plan || "—"}</TableCell>
                <TableCell className={CRM_SURFACES.textMuted}>{client.zone || "—"}</TableCell>
                <TableCell className={CRM_SURFACES.textSecondary}>{client.account || "—"}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      openTickets.length
                        ? `${openTickets.length} abierto${openTickets.length > 1 ? "s" : ""}`
                        : "Resuelto"
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })
        ) : (
          <TableRow className={CRM_SURFACES.border}>
            <TableCell colSpan={6} className={`h-24 text-center ${CRM_SURFACES.textMuted}`}>
              Sin clientes aún.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      </Table>
    </div>
  </div>
);
