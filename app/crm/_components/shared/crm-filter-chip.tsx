import { cn } from "@/lib/utils";
import { CRM_FOCUS_RING } from "../../_lib/crm-theme";

interface CrmFilterChipProps {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}

export const CrmFilterChip = ({
  label,
  count,
  isActive,
  onClick,
}: CrmFilterChipProps) => {
  const countText = count === undefined ? "" : ` ${count}`;
  const accessibleLabel =
    count === undefined ? label : `${label}, ${count} conversaciones`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={accessibleLabel}
      className={cn(
        CRM_FOCUS_RING,
        "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition",
        isActive
          ? "border-crm-accent/40 bg-crm-accent-muted text-crm-accent-muted-foreground"
          : "border-white/50 bg-white/40 text-slate-600 hover:border-crm-accent/30 hover:text-slate-900 dark:border-white/10 dark:bg-white/[.06] dark:text-slate-300 dark:hover:text-slate-100",
      )}>
      <span>{`${label}${countText}`}</span>
    </button>
  );
};
