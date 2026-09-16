import { CRM_SURFACES } from "../../_lib/crm-theme";

interface LoadingStateProps {
  label?: string;
}

export const LoadingState = ({ label = "Cargando..." }: LoadingStateProps) => (
  <div
    className={`flex h-full min-h-48 items-center justify-center gap-3 text-sm ${CRM_SURFACES.textMuted}`}>
    <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-400 dark:border-white/20" />
    {label}
  </div>
);
