"use client";

import { useEffect, useMemo, useRef } from "react";
import { MessageCircle } from "lucide-react";
import type { Message } from "../../_lib/types";
import { groupMessagesByDay } from "../../_lib/formatters";
import { EmptyState } from "../shared/empty-state";
import { LoadingState } from "../shared/loading-state";
import { DateDivider } from "../shared/date-divider";
import { MessageBubble } from "./message-bubble";

interface ConversationMessagesProps {
  messages: Message[];
  isLoading: boolean;
  onProcessPaymentReceipt: (messageId: number) => Promise<void>;
  onResendMessage: (messageId: number) => Promise<void>;
  canRegisterManualPayment?: boolean;
  manualPaymentBlockReason?: string | null;
}

export const ConversationMessages = ({
  messages,
  isLoading,
  onProcessPaymentReceipt,
  onResendMessage,
  canRegisterManualPayment = true,
  manualPaymentBlockReason = null,
}: ConversationMessagesProps) => {
  const endRef = useRef<HTMLDivElement | null>(null);
  const messageGroups = useMemo(() => groupMessagesByDay(messages), [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (isLoading) return <LoadingState label="Cargando mensajes..." />;

  if (!messages.length) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Sin mensajes aún"
        description="Escribe el primer mensaje para iniciar el seguimiento."
      />
    );
  }

  return (
    <div className="crm-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      {messageGroups.map((group) => (
        <section
          key={group.dateKey}
          aria-labelledby={`conversation-day-${group.dateKey}`}
          className="flex flex-col gap-4">
          <h3 id={`conversation-day-${group.dateKey}`} className="sr-only">
            Mensajes del {group.label}
          </h3>
          <DateDivider label={group.label} />
          {group.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onProcessPaymentReceipt={onProcessPaymentReceipt}
              onResendMessage={onResendMessage}
              canRegisterManualPayment={canRegisterManualPayment}
              manualPaymentBlockReason={manualPaymentBlockReason}
            />
          ))}
        </section>
      ))}
      <div ref={endRef} />
    </div>
  );
};
