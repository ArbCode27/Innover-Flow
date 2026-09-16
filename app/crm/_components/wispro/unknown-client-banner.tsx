"use client";

import { AlertCircle } from "lucide-react";
import { CrmButton } from "../shared/crm-button";

interface UnknownClientBannerProps {
  onOpenWispro: () => void;
}

export const UnknownClientBanner = ({ onOpenWispro }: UnknownClientBannerProps) => (
  <div className="flex shrink-0 items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-950/40">
    <AlertCircle
      className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
      aria-hidden="true"
    />
    <p className="min-w-0 flex-1 text-xs text-amber-900 dark:text-amber-100">
      Cliente sin vincular a Wispro. Puedes responder por WhatsApp; asócialo para ver su ficha.
    </p>
    <CrmButton
      type="button"
      variant="secondary"
      size="sm"
      className="shrink-0 border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-100 dark:hover:bg-amber-900/60"
      onClick={onOpenWispro}>
      Buscar en Wispro
    </CrmButton>
  </div>
);
