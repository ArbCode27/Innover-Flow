"use client";

import { cn } from "@/lib/utils";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type {
  Agent,
  Client,
  Conversation,
  Label,
  Ticket,
  WisproCustomer,
} from "../../_lib/types";
import { formatCrmDate } from "../../_lib/formatters";
import { AvatarInitials } from "../shared/avatar-initials";
import { CrmButton } from "../shared/crm-button";
import { LabelChip } from "../shared/label-chip";
import { StatusBadge } from "../shared/status-badge";
import { ClientProfileSection } from "./client-profile-section";

interface ConversationDetailsProps {
  conversation: Conversation;
  client: Client | null;
  wisproSnapshot?: WisproCustomer | null;
  labels: Label[];
  tickets: Ticket[];
  agents: Agent[];
  className?: string;
  onToggleLabel: (labelId: number) => Promise<void>;
  onOpenWispro?: () => void;
  onUnlinkWispro?: () => void;
  isUnlinkingWispro?: boolean;
  onCreatePaymentPromise?: () => void;
  isCreatingPaymentPromise?: boolean;
}

export const ConversationDetails = ({
  conversation,
  client,
  wisproSnapshot,
  labels,
  tickets,
  agents,
  className,
  onToggleLabel,
  onOpenWispro,
  onUnlinkWispro,
  isUnlinkingWispro = false,
  onCreatePaymentPromise,
  isCreatingPaymentPromise = false,
}: ConversationDetailsProps) => {
  const activeTicket =
    tickets.find((ticket) => ticket.status !== "Resuelto") ||
    tickets[0] ||
    null;
  const onlineAgents = agents.filter(
    (agent) => agent.status === "online" || agent.status === "busy",
  );

  return (
    <aside
      className={cn(
        `crm-scrollbar hidden w-72 shrink-0 overflow-y-auto border-l bg-white/25 dark:bg-white/[.03] lg:block ${CRM_SURFACES.border}`,
        className,
      )}>
      <section className={`space-y-4 border-b p-4 ${CRM_SURFACES.border}`}>
        <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
          Ficha del cliente
        </h3>
        {client ? (
          <ClientProfileSection
            client={client}
            wisproSnapshot={wisproSnapshot}
            onOpenWispro={onOpenWispro}
            onUnlinkWispro={onUnlinkWispro}
            isUnlinkingWispro={isUnlinkingWispro}
            onCreatePaymentPromise={onCreatePaymentPromise}
            isCreatingPaymentPromise={isCreatingPaymentPromise}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Número desconocido. Busca al cliente en Wispro para asociarlo a esta
              conversación.
            </p>
            {onOpenWispro ? (
              <CrmButton type="button" variant="secondary" size="sm" onClick={onOpenWispro}>
                Buscar en Wispro
              </CrmButton>
            ) : null}
          </div>
        )}
      </section>

      <section className={`space-y-3 border-b p-4 ${CRM_SURFACES.border}`}>
        <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
          Etiquetas
        </h3>
        {labels.length ? (
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <LabelChip
                key={label.id}
                label={label}
                selected={conversation.label_ids.includes(label.id)}
                className={
                  conversation.label_ids.includes(label.id)
                    ? "opacity-100"
                    : "opacity-45"
                }
                onClick={() => void onToggleLabel(label.id)}
              />
            ))}
          </div>
        ) : (
          <p className={`text-xs ${CRM_SURFACES.textLabel}`}>
            No hay etiquetas creadas.
          </p>
        )}
      </section>

      <section className={`space-y-3 border-b p-4 ${CRM_SURFACES.border}`}>
        <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
          Ticket activo
        </h3>
        {activeTicket ? (
          <div className="space-y-2">
            <p className={`font-mono text-sm ${CRM_SURFACES.textPrimary}`}>
              {activeTicket.id}
            </p>
            <p className={`text-sm ${CRM_SURFACES.textSecondary}`}>{activeTicket.type}</p>
            <StatusBadge status={activeTicket.status} />
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Agente: {activeTicket.agent}
            </p>
          </div>
        ) : (
          <p className={`text-xs ${CRM_SURFACES.textLabel}`}>Sin tickets activos</p>
        )}
      </section>

      <section className={`space-y-3 border-b p-4 ${CRM_SURFACES.border}`}>
        <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
          Agentes en línea
        </h3>
        {onlineAgents.length ? (
          onlineAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2">
              <AvatarInitials
                name={agent.name}
                initials={agent.initials}
                color={agent.avatar_color}
                bg={agent.avatar_bg}
                size="sm"
              />
              <span className={`min-w-0 flex-1 truncate text-xs ${CRM_SURFACES.textSecondary}`}>
                {agent.name}
              </span>
              <span
                className={`size-2 rounded-full ${
                  agent.status === "online" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </div>
          ))
        ) : (
          <p className={`text-xs ${CRM_SURFACES.textLabel}`}>Sin agentes en línea</p>
        )}
      </section>

      <section className="space-y-2 p-4">
        <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
          Historial
        </h3>
        <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
          Última actividad: {formatCrmDate(conversation.updated_at)}
        </p>
      </section>
    </aside>
  );
};
