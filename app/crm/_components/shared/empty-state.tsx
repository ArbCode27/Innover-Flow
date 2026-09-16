import type { LucideIcon } from "lucide-react";
import { CRM_SURFACES } from "../../_lib/crm-theme";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export const EmptyState = ({ icon: Icon, title, description }: EmptyStateProps) => (
  <div
    className={`flex h-full min-h-48 flex-col items-center justify-center gap-3 p-8 text-center ${CRM_SURFACES.textMuted}`}>
    <Icon className="size-10 stroke-[1.4]" aria-hidden="true" />
    <div>
      <p className={`text-sm font-medium ${CRM_SURFACES.textSecondary}`}>{title}</p>
      {description ? (
        <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>{description}</p>
      ) : null}
    </div>
  </div>
);
