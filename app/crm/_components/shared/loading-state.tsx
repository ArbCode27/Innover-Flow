import { Spinner } from "@/components/ui/spinner";
import { CRM_SURFACES } from "../../_lib/crm-theme";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export const LoadingState = ({
  label = "Cargando...",
  className = "",
}: LoadingStateProps) => (
  <div
    className={`flex h-full min-h-48 items-center justify-center gap-3 text-sm ${CRM_SURFACES.textMuted} ${className}`}>
    <Spinner className="size-4" />
    {label}
  </div>
);
