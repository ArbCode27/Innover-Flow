import type { SupabaseClient } from "@supabase/supabase-js";
import { getColorByIndex, getInitials } from "./formatters";
import type { Client, ClientAccountStatus } from "./types";

const UNKNOWN_CLIENT_NAME = "Número desconocido";

export const normalizeClientPhone = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
};

export const last10ClientDigits = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};

export const isUniqueViolation = (error: { code?: string; message?: string } | null) =>
  error?.code === "23505" ||
  Boolean(error?.message?.toLowerCase().includes("unique"));

const rankIdentityMatch = (client: Client, identity: string, tail: string) => {
  if (client.whatsapp_id === identity) return 4;
  if (client.phone === identity) return 3;
  if (tail && last10ClientDigits(client.whatsapp_id) === tail) return 2;
  if (tail && last10ClientDigits(client.phone) === tail) return 1;
  return 0;
};

export const findClientByWhatsappOrPhone = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    whatsappId?: string | null;
    phone?: string | null;
  },
) => {
  const identity =
    normalizeClientPhone(input.whatsappId) || normalizeClientPhone(input.phone);
  if (!identity) return null;

  const tail = last10ClientDigits(identity);
  const filters = [`whatsapp_id.eq.${identity}`, `phone.eq.${identity}`];
  if (tail) {
    filters.push(`whatsapp_id.like.%${tail}`, `phone.like.%${tail}`);
  }

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("organization_id", input.organizationId)
    .or(filters.join(","))
    .limit(20);

  if (error) throw error;

  const ranked = ((data || []) as Client[])
    .map((client) => ({ client, score: rankIdentityMatch(client, identity, tail) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.client ?? null;
};

export const releaseWhatsappIdFromOthers = async (
  supabase: SupabaseClient,
  input: {
    whatsappId: string;
    keepClientId: number;
  },
) => {
  const whatsappId = normalizeClientPhone(input.whatsappId);
  if (!whatsappId) return;

  const { error } = await supabase
    .from("clients")
    .update({ whatsapp_id: null })
    .eq("whatsapp_id", whatsappId)
    .neq("id", input.keepClientId);

  if (error) throw error;
};

export const findClientByWhatsappId = async (
  supabase: SupabaseClient,
  whatsappId: string,
) => {
  const normalized = normalizeClientPhone(whatsappId);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("whatsapp_id", normalized)
    .maybeSingle<Client>();

  if (error) throw error;
  return data;
};

type InsertClientInput = {
  organizationId: string;
  name: string;
  phone?: string | null;
  whatsappId?: string | null;
  waName?: string | null;
  account?: ClientAccountStatus | null;
  plan?: string | null;
  zone?: string | null;
  color?: string | null;
  bg?: string | null;
  initials?: string | null;
  cedula?: string | null;
  appEnabled?: boolean | null;
  existingClientsCount?: number;
};

const resolveAvatar = async (
  supabase: SupabaseClient,
  organizationId: string,
  existingClientsCount?: number,
) => {
  if (existingClientsCount != null) {
    return getColorByIndex(existingClientsCount);
  }

  const { count, error } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) throw error;
  return getColorByIndex(count ?? 0);
};

export const insertClientRow = async (
  supabase: SupabaseClient,
  input: InsertClientInput,
) => {
  const name = input.name.trim() || UNKNOWN_CLIENT_NAME;
  const phone = normalizeClientPhone(input.phone) || null;
  const whatsappId = normalizeClientPhone(input.whatsappId) || null;
  const color = input.color
    ? { color: input.color, bg: input.bg ?? null }
    : await resolveAvatar(supabase, input.organizationId, input.existingClientsCount);

  const payload = {
    organization_id: input.organizationId,
    name,
    phone,
    whatsapp_id: whatsappId,
    wa_name: input.waName?.trim() || null,
    account: input.account ?? "Prospecto",
    plan: input.plan ?? null,
    zone: input.zone ?? null,
    color: color.color,
    bg: color.bg,
    initials: input.initials?.trim() || getInitials(name),
    created_at: new Date().toISOString(),
    ...(input.cedula !== undefined ? { cedula: input.cedula } : {}),
    ...(input.appEnabled !== undefined ? { app_enabled: input.appEnabled } : {}),
  };

  const { data, error } = await supabase
    .from("clients")
    .insert(payload)
    .select("*")
    .single<Client>();

  if (!error && data) return data;

  if (isUniqueViolation(error) && whatsappId) {
    const raced = await findClientByWhatsappId(supabase, whatsappId);
    if (raced) return raced;
  }

  if (error) throw error;
  throw new Error("No se pudo crear el cliente");
};
