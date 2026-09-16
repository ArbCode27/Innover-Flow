import { Ban, CheckCircle2, Clock, Inbox, Wallet } from "lucide-react";
import { MetricCard } from "../shared/metric-card";
import type { CrmPaymentStatusCounts } from "../../_lib/payments";

interface PaymentsStatsProps {
  total: number;
  counts: CrmPaymentStatusCounts;
}

export const PaymentsStats = ({ total, counts }: PaymentsStatsProps) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
    <MetricCard title="Total" value={total} description="registrados" icon={Wallet} />
    <MetricCard
      title="Recibidos"
      value={counts.RECIBIDO}
      description="en bandeja, datos incompletos"
      icon={Inbox}
      tone="blue"
    />
    <MetricCard
      title="En proceso"
      value={counts.EN_PROCESO}
      description="listos para revisión"
      icon={Clock}
      tone="amber"
    />
    <MetricCard
      title="Aprobados"
      value={counts.APROBADO}
      description="verificados en Wispro"
      icon={CheckCircle2}
      tone="green"
    />
    <MetricCard
      title="Rechazados"
      value={counts.RECHAZADO}
      description="no acreditados"
      icon={Ban}
      tone="red"
    />
  </div>
);
