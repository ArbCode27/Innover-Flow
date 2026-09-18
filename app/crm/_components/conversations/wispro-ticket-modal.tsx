"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { WisproTicketOrderPanel } from "../wispro/wispro-ticket-order-panel";
import type { Client, Conversation, Message, WisproCustomer } from "../../_lib/types";

interface WisproTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation?: Conversation | null;
  client?: Client | null;
  wisproSnapshot?: WisproCustomer | null;
  messages?: Message[];
  agentName?: string;
  onTicketCreated?: () => void;
}

export const WisproTicketModal = ({
  open,
  onOpenChange,
  conversation,
  client,
  wisproSnapshot,
  messages = [],
  agentName,
  onTicketCreated,
}: WisproTicketModalProps) => {
  // Buscar de forma inteligente si en los últimos mensajes existe un reporte técnico del bot IA
  const detectedReportText = useMemo(() => {
    if (!messages.length) return "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const content = messages[i]?.content || "";
      if (
        content.includes("REPORTE TÉCNICO") ||
        content.includes("Motivo:") ||
        content.includes("• **Motivo:")
      ) {
        return content;
      }
    }
    return "";
  }, [messages]);

  const initialSearch =
    client?.name ||
    wisproSnapshot?.name ||
    client?.phone ||
    "";

  const initialWisproClientId =
    client?.wispro_id ||
    wisproSnapshot?.id ||
    undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-6xl overflow-hidden p-0 sm:rounded-3xl border-slate-200 dark:border-white/10">
        <div className="h-[88vh] w-full overflow-hidden">
          <WisproTicketOrderPanel
            initialReportText={detectedReportText}
            initialClientSearch={initialSearch}
            initialWisproClientId={initialWisproClientId}
            crmClientId={client?.id}
            agentName={agentName}
            onSuccess={() => {
              if (onTicketCreated) onTicketCreated();
            }}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
