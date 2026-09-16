import { AlertTriangle, CheckCircle2, Ticket, Users } from "lucide-react";
import type { Client, Ticket as CrmTicket } from "../../_lib/types";
import { MetricCard } from "../shared/metric-card";

interface ClientsStatsProps {
  clients: Client[];
  tickets: CrmTicket[];
}

export const ClientsStats = ({ clients, tickets }: ClientsStatsProps) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <MetricCard title="Total" value={clients.length} description="registrados" icon={Users} />
    <MetricCard
      title="Al día"
      value={clients.filter((client) => client.account === "Al día").length}
      description="sin deuda"
      icon={CheckCircle2}
      tone="green"
    />
    <MetricCard
      title="Con deuda"
      value={clients.filter((client) => client.account === "Con deuda").length}
      description="pendientes"
      icon={AlertTriangle}
      tone="red"
    />
    <MetricCard
      title="Tickets abiertos"
      value={tickets.filter((ticket) => ticket.status !== "Resuelto").length}
      description="en seguimiento"
      icon={Ticket}
      tone="amber"
    />
  </div>
);
