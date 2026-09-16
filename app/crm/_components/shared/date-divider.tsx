"use client";

import { CRM_SURFACES } from "../../_lib/crm-theme";

interface DateDividerProps {
  label: string;
}

/** WhatsApp-style day chip between message groups. */
export const DateDivider = ({ label }: DateDividerProps) => (
  <div
    role="separator"
    aria-label={label}
    className="flex justify-center py-1">
    <time
      className={`rounded-full px-3 py-1 text-[11px] font-medium shadow-sm ${CRM_SURFACES.card} ${CRM_SURFACES.border} border ${CRM_SURFACES.textSecondary}`}>
      {label}
    </time>
  </div>
);
