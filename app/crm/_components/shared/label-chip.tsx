import { cn } from "@/lib/utils";
import type { Label } from "../../_lib/types";
import { CRM_FOCUS_RING } from "../../_lib/crm-theme";

interface LabelChipProps {
  label: Label;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const LabelChip = ({ label, selected, onClick, className }: LabelChipProps) => {
  const Component = onClick ? "button" : "span";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
        selected
          ? "border-current bg-slate-200 text-slate-900 dark:bg-white/10 dark:text-slate-100"
          : "border-slate-200 bg-slate-100 text-slate-800 dark:border-white/10 dark:bg-[#1d2130] dark:text-slate-200",
        onClick && [
          CRM_FOCUS_RING,
          "hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white",
        ],
        className,
      )}
      style={{ borderColor: selected ? label.color : undefined }}>
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
        aria-hidden="true"
      />
      {label.name}
    </Component>
  );
};
