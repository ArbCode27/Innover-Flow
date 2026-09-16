import type { LucideIcon } from "lucide-react";
import type { CrmView } from "../../_lib/types";
import { CRM_FOCUS_RING } from "../../_lib/crm-theme";

interface CrmNavItemProps {
  icon: LucideIcon;
  label: string;
  view: CrmView;
  isActive: boolean;
  badgeCount?: number;
  onSelect: (view: CrmView) => void;
}

export const CrmNavItem = ({
  icon: Icon,
  label,
  view,
  isActive,
  badgeCount = 0,
  onSelect,
}: CrmNavItemProps) => (
  <button
    type="button"
    onClick={() => onSelect(view)}
    aria-label={label}
    aria-current={isActive ? "page" : undefined}
    title={label}
    className={`relative flex size-10 items-center justify-center rounded-2xl transition ${CRM_FOCUS_RING} ${
      isActive
        ? "bg-crm-accent-muted text-crm-accent-muted-foreground"
        : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
    }`}>
    <Icon className="size-5" aria-hidden="true" />
    {badgeCount > 0 ? (
      <span
        className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-crm-accent px-1 text-[10px] font-semibold leading-4 text-crm-accent-foreground"
        aria-hidden="true">
        {badgeCount > 99 ? "99+" : badgeCount}
      </span>
    ) : null}
  </button>
);
