import { Smartphone } from "lucide-react";
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
import type { Client, Ticket } from "../../_lib/types";
import { AvatarInitials } from "../shared/avatar-initials";
import { StatusBadge } from "../shared/status-badge";

interface ClientsTableProps {
  clients: Client[];
  tickets: Ticket[];
}

export const ClientsTable = ({ clients, tickets }: ClientsTableProps) => {
  return (
    <div className={CRM_TABLE}>
      <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className={`${CRM_SURFACES.border} hover:bg-transparent`}>
              <TableHead className={CRM_SURFACES.textMuted}>Cliente</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Cédula / Doc</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Teléfono</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Plan</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Zona</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Estado</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>App Móvil</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Tickets</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length ? (
              clients.map((client) => {
                const openTickets = tickets.filter(
                  (ticket) => ticket.client_id === client.id && ticket.status !== "Resuelto",
                );
                const isAppEnabled = client.app_enabled !== false;

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
                        <span className={`font-medium ${CRM_SURFACES.textPrimary}`}>
                          {client.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {client.cedula ? (
                        <span className="bg-muted/50 px-1.5 py-0.5 rounded text-foreground">
                          {client.cedula.startsWith("V-") || client.cedula.startsWith("E-") || client.cedula.startsWith("J-")
                            ? client.cedula
                            : `V-${client.cedula}`}
                        </span>
                      ) : (
                        <span className={CRM_SURFACES.textMuted}>—</span>
                      )}
                    </TableCell>
                    <TableCell className={`font-mono ${CRM_SURFACES.textMuted}`}>
                      {client.phone}
                    </TableCell>
                    <TableCell className={CRM_SURFACES.textSecondary}>
                      {client.plan || "—"}
                    </TableCell>
                    <TableCell className={CRM_SURFACES.textMuted}>
                      {client.zone || "—"}
                    </TableCell>
                    <TableCell className={CRM_SURFACES.textSecondary}>
                      {client.account || "—"}
                    </TableCell>
                    <TableCell>
                      {isAppEnabled ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 gap-1 text-[11px]"
                        >
                          <Smartphone className="size-3" aria-hidden="true" />
                          Habilitada
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-muted text-muted-foreground border-border/40 text-[11px]"
                        >
                          Inactiva
                        </Badge>
                      )}
                    </TableCell>
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
                <TableCell colSpan={8} className={`h-24 text-center ${CRM_SURFACES.textMuted}`}>
                  Sin clientes aún.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
