"use client";

import dynamic from "next/dynamic";
import { Bot, Headphones, MessageCircle, Sparkles, Tags, UserCheck } from "lucide-react";
import { hasUnreadMessages } from "../../_lib/conversation-inbox-utils";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { Agent, Conversation, Label } from "../../_lib/types";
import { ShinyText } from "@/components/react-bits/shiny-text";

const CrmAeroShardsBackdrop = dynamic(
  () =>
    import("@/components/react-bits/crm-aero-shards-backdrop").then(
      (mod) => mod.CrmAeroShardsBackdrop,
    ),
  { ssr: false },
);

interface ConversationWelcomePanelProps {
  conversations: Conversation[];
  labels: Label[];
  currentAgent: Agent;
}

export const ConversationWelcomePanel = ({
  conversations,
  labels,
  currentAgent,
}: ConversationWelcomePanelProps) => {
  const unreadConversationsCount = conversations.filter((conversation) =>
    hasUnreadMessages(conversation),
  ).length;
  const botCount = conversations.filter(
    (conversation) => !conversation.human_mode && conversation.status !== "resuelto"
  ).length;
  const humanCount = conversations.filter(
    (conversation) => conversation.human_mode && conversation.status !== "resuelto"
  ).length;
  const activeCount = conversations.filter(
    (conversation) => conversation.status !== "resuelto"
  ).length;
  const featuredLabels = labels.slice(0, 4);

  return (
    <section className="relative flex min-w-0 flex-1 overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <CrmAeroShardsBackdrop />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-16 h-80 w-80 -translate-x-1/2 rounded-full bg-crm-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-60 w-60 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-3xl border border-crm-accent/20 bg-crm-accent/10 text-crm-accent shadow-2xl shadow-black/20">
          <MessageCircle className="size-8" aria-hidden="true" />
        </div>

        <div className={`rounded-3xl p-8 ${CRM_SURFACES.elevatedTranslucent}`}>
          <div className={`mx-auto mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${CRM_SURFACES.elevated} ${CRM_SURFACES.textMuted}`}>
            <Sparkles className="size-3.5 text-crm-accent" aria-hidden="true" />
            Centro de atención CRM
          </div>
          <h2 className={`text-2xl font-semibold ${CRM_SURFACES.textPrimary}`}>
            <ShinyText
              text={`Bienvenido, ${currentAgent.name}`}
              className="text-2xl font-semibold"
              color="var(--foreground)"
              speed={3}
              delay={1.6}
            />
          </h2>
          <p className={`mx-auto mt-3 max-w-xl text-sm leading-6 ${CRM_SURFACES.textMuted}`}>
            Selecciona una conversación del panel izquierdo para revisar mensajes,
            tomar control del bot, asignar etiquetas y consultar la ficha del cliente.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
              <Headphones className="mx-auto mb-2 size-5 text-crm-accent" aria-hidden="true" />
              <p className={`text-xl font-semibold ${CRM_SURFACES.textPrimary}`}>{activeCount}</p>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>activas</p>
            </div>
            <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
              <MessageCircle className="mx-auto mb-2 size-5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              <p className={`text-xl font-semibold ${CRM_SURFACES.textPrimary}`}>
                {unreadConversationsCount}
              </p>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>no leídas</p>
            </div>
            <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
              <Bot className="mx-auto mb-2 size-5 text-violet-600 dark:text-violet-300" aria-hidden="true" />
              <p className={`text-xl font-semibold ${CRM_SURFACES.textPrimary}`}>{botCount}</p>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>con Bot IA</p>
            </div>
            <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
              <UserCheck className="mx-auto mb-2 size-5 text-red-600 dark:text-red-300" aria-hidden="true" />
              <p className={`text-xl font-semibold ${CRM_SURFACES.textPrimary}`}>{humanCount}</p>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>en humano</p>
            </div>
          </div>

          <div className={`mt-7 rounded-2xl p-4 text-left ${CRM_SURFACES.elevated}`}>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-600 dark:text-emerald-300">
                <Tags className="size-4" aria-hidden="true" />
              </div>
              <div>
                <p className={`text-sm font-medium ${CRM_SURFACES.textSecondary}`}>
                  Tip de operación
                </p>
                <p className={`mt-1 text-xs leading-5 ${CRM_SURFACES.textMuted}`}>
                  Usa etiquetas para priorizar casos de pago, soporte o instalación.
                  Las conversaciones con más contexto se resuelven más rápido.
                </p>
                {featuredLabels.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {featuredLabels.map((label) => (
                      <span
                        key={label.id}
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{ backgroundColor: label.bg, color: label.color }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
