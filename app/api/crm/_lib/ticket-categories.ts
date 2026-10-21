import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldTicketKind } from "@/lib/field-tickets/types";
import {
  DEFAULT_TICKET_CATEGORIES,
  mapTicketCategoryRow,
  type TicketCategory,
} from "@/lib/ticket-categories";

export const listTicketCategories = async (
  supabase: SupabaseClient,
  organizationId: string,
  options?: { includeInactive?: boolean },
): Promise<TicketCategory[]> => {
  let query = supabase
    .from("ticket_categories")
    .select("id, organization_id, name, slug, kind, sort_order, is_active")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapTicketCategoryRow);
};

export const ensureDefaultTicketCategories = async (
  supabase: SupabaseClient,
  organizationId: string,
): Promise<TicketCategory[]> => {
  const existing = await listTicketCategories(supabase, organizationId, {
    includeInactive: true,
  });
  const haveSlug = new Set(existing.map((item) => item.slug));
  const missing = DEFAULT_TICKET_CATEGORIES.filter(
    (item) => !haveSlug.has(item.slug),
  );

  if (missing.length) {
    const { error } = await supabase.from("ticket_categories").insert(
      missing.map((item) => ({
        organization_id: organizationId,
        name: item.name,
        slug: item.slug,
        kind: item.kind,
        sort_order: item.sortOrder,
        is_active: true,
      })),
    );
    if (error && error.code !== "23505") throw error;
  }

  return listTicketCategories(supabase, organizationId);
};

export const getTicketCategory = async (
  supabase: SupabaseClient,
  organizationId: string,
  categoryId: string,
): Promise<TicketCategory | null> => {
  const { data, error } = await supabase
    .from("ticket_categories")
    .select("id, organization_id, name, slug, kind, sort_order, is_active")
    .eq("organization_id", organizationId)
    .eq("id", categoryId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTicketCategoryRow(data) : null;
};

export const resolveTicketCategory = async (
  supabase: SupabaseClient,
  organizationId: string,
  input: { categoryId?: string | null; kind?: FieldTicketKind | null },
): Promise<TicketCategory | null> => {
  const categories = await ensureDefaultTicketCategories(
    supabase,
    organizationId,
  );

  if (input.categoryId?.trim()) {
    const match = categories.find((item) => item.id === input.categoryId);
    return match || null;
  }

  if (input.kind) {
    return categories.find((item) => item.slug === input.kind) || null;
  }

  return null;
};
