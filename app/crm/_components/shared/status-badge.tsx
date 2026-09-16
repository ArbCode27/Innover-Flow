import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "../../_lib/constants";
import { CRM_BADGE_TONES, type CrmBadgeTone } from "../../_lib/crm-theme";

interface StatusBadgeProps {
  status: string;
}

const statusTones: Record<string, CrmBadgeTone> = {
  abierto: "blue",
  Abierto: "blue",
  proceso: "amber",
  "En proceso": "amber",
  resuelto: "emerald",
  Resuelto: "emerald",
  online: "emerald",
  busy: "amber",
  offline: "slate",
  inactive: "red",
  bot: "violet",
  human: "rose",
  RECIBIDO: "blue",
  EN_PROCESO: "amber",
  APROBADO: "emerald",
  RECHAZADO: "red",
  DUPLICADO: "slate",
  ERROR: "red",
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const tone = statusTones[status] || "neutral";

  return (
    <Badge
      variant="outline"
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CRM_BADGE_TONES[tone]}`}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
};
