import {
  isOfficeClosed,
  type AfterHoursPaymentsConfig,
  type OfficeHoursConfig,
  resolveOfficeHoursFromEnv,
} from "./office-hours";

export type BotReplyMode = "full" | "after_hours_payments" | "forced" | "skip";

export type BotReplyPolicy = {
  mode: BotReplyMode;
  shouldRun: boolean;
  officeClosed: boolean;
  reason: string;
  allowedTools: string[] | null;
};

export const AFTER_HOURS_PAYMENTS_PROMPT = `Modo FUERA DE OFICINA / DOMINGO (obligatorio):
- La oficina está cerrada. El chat está en modo bot: atiendes SOLO pagos.
- Permitido: leer comprobantes (imagen), pedir cédula/RIF (solo números), lookup_wispro_by_cedula, submit_payment_receipt, get_bcv_rate, link_wispro_client.
- Prohibido: soporte técnico, diagnóstico de red, escalar a humano con escalate_to_human, promesas de pago, o actuar como si hubiera un asesor en línea.
- Al confirmar un comprobante registrado, di que un asesor lo revisará al abrir. Usa proxima_apertura y el horario inyectado; no inventes horas.
- Si el cliente pide algo fuera de pagos, informa que la oficina está cerrada y da el horario inyectado. No digas “en breve”.`;

/**
 * Advisor-owned chats (human_mode) never auto-reply, including after hours.
 * forceRun is reserved for advisor-initiated CRM actions (e.g. process receipt).
 * afterHoursPayments is accepted for call-site compatibility; it must not
 * override human_mode.
 */
export const resolveBotReplyPolicy = (input: {
  humanMode: boolean;
  forceRun?: boolean;
  now?: Date;
  officeHours?: OfficeHoursConfig;
  afterHoursPayments?: AfterHoursPaymentsConfig;
}): BotReplyPolicy => {
  const officeHours = input.officeHours ?? resolveOfficeHoursFromEnv();
  const now = input.now ?? new Date();
  const officeClosed = isOfficeClosed(now, officeHours);

  if (input.forceRun) {
    return {
      mode: "forced",
      shouldRun: true,
      officeClosed,
      reason: "force_run",
      allowedTools: null,
    };
  }

  if (input.humanMode) {
    return {
      mode: "skip",
      shouldRun: false,
      officeClosed,
      reason: "human_mode_active",
      allowedTools: null,
    };
  }

  return {
    mode: "full",
    shouldRun: true,
    officeClosed,
    reason: "bot_mode",
    allowedTools: null,
  };
};
