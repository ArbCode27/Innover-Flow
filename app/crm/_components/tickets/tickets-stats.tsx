import { CheckCircle2, Clock, Timer, Ticket } from "lucide-react";
import type { Ticket as CrmTicket } from "../../_lib/types";
import { MetricCard } from "../shared/metric-card";

interface TicketsStatsProps {
  tickets: CrmTicket[];
}

export const TicketsStats = ({ tickets }: TicketsStatsProps) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <MetricCard
      title="Abiertos"
      value={tickets.filter((ticket) => ticket.status === "Abierto").length}
      icon={Ticket}
    />
    <MetricCard
      title="En proceso"
      value={tickets.filter((ticket) => ticket.status === "En proceso").length}
      icon={Clock}
      tone="amber"
    />
    <MetricCard
      title="Resueltos"
      value={tickets.filter((ticket) => ticket.status === "Resuelto").length}
      icon={CheckCircle2}
      tone="green"
    />
    <MetricCard title="Tiempo prom." value="1.4h" icon={Timer} tone="purple" />
  </div>
);
