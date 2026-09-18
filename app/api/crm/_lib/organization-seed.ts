import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AI_MODEL } from "@/app/crm/_lib/ai-models";
import { DEFAULT_BOT_ENGINE } from "@/app/crm/_lib/bot-engine";
import {
  DEFAULT_AFTER_HOURS_PAYMENTS,
  DEFAULT_OFFICE_HOURS,
} from "@/app/crm/_lib/office-hours";

/**
 * Genera un slug único para una organización a partir de su nombre.
 */
export const generateUniqueSlug = async (
  supabase: SupabaseClient,
  rawName: string,
): Promise<string> => {
  let baseSlug = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!baseSlug) baseSlug = "org";

  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", baseSlug)
    .maybeSingle();

  if (!existing) {
    return baseSlug;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    const { data: check } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!check) return candidate;
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
};

/**
 * Siembra los datos por defecto para una nueva organización:
 * - Ajustes del CRM (motor de bot, modelo IA, horarios de oficina)
 * - Etiquetas operativas esenciales
 * - Respuestas rápidas de bienvenida y soporte
 */
export const seedDefaultOrganizationData = async (
  supabase: SupabaseClient,
  organizationId: string,
  agentId?: number | null,
): Promise<void> => {
  // 1. Ajustes del CRM
  try {
    await supabase
      .from("crm_settings")
      .upsert(
        {
          organization_id: organizationId,
          bot_engine: DEFAULT_BOT_ENGINE,
          ai_model: DEFAULT_AI_MODEL,
          office_hours: DEFAULT_OFFICE_HOURS,
          after_hours_payments: DEFAULT_AFTER_HOURS_PAYMENTS,
          ui_accent: "ocean",
          updated_at: new Date().toISOString(),
          updated_by: agentId || null,
        },
        { onConflict: "organization_id" },
      );
  } catch (err) {
    console.warn("[SEED_ORG] crm_settings_seed_failed", err);
  }

  // 2. Etiquetas por defecto
  try {
    const defaultLabels = [
      {
        organization_id: organizationId,
        name: "verificar pago",
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.15)",
      },
      {
        organization_id: organizationId,
        name: "pagado api",
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.15)",
      },
      {
        organization_id: organizationId,
        name: "soporte",
        color: "#3b82f6",
        bg: "rgba(59, 130, 246, 0.15)",
      },
      {
        organization_id: organizationId,
        name: "ia error",
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.15)",
      },
    ];

    await supabase.from("labels").insert(defaultLabels);
  } catch (err) {
    console.warn("[SEED_ORG] labels_seed_failed", err);
  }

  // 3. Respuestas rápidas iniciales
  try {
    const defaultQuickReplies = [
      {
        organization_id: organizationId,
        title: "Bienvenida",
        shortcut: "/hola",
        content:
          "¡Hola! Gracias por comunicarte con nosotros. ¿En qué podemos ayudarte hoy?",
        category: "general",
        is_active: true,
        created_by: agentId || null,
      },
      {
        organization_id: organizationId,
        title: "Solicitud de Comprobante",
        shortcut: "/pago",
        content:
          "Por favor envíanos la captura o foto del comprobante de tu pago junto con tu número de identificación para procesarlo.",
        category: "pagos",
        is_active: true,
        created_by: agentId || null,
      },
    ];

    await supabase.from("quick_replies").insert(defaultQuickReplies);
  } catch (err) {
    console.warn("[SEED_ORG] quick_replies_seed_failed", err);
  }
};
