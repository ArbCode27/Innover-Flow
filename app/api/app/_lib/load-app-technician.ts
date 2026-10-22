import type { SupabaseClient } from "@supabase/supabase-js";
import { mapTechnician } from "@/app/api/crm/_lib/field-tickets";
import type { Technician } from "@/lib/field-tickets/types";
import { APP_ERROR_CODES, AppApiError } from "./app-errors";

export const loadAppTechnician = async (
  supabase: SupabaseClient,
  input: { technicianId: string; organizationId: string },
): Promise<Technician> => {
  const { data, error } = await supabase
    .from("technicians")
    .select("*")
    .eq("id", input.technicianId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new AppApiError(
      APP_ERROR_CODES.CLIENT_NOT_FOUND,
      "No encontramos tu perfil de técnico. Inicia sesión de nuevo.",
      404,
    );
  }
  if (data.app_enabled === false) {
    throw new AppApiError(
      APP_ERROR_CODES.APP_DISABLED,
      "El acceso a la app está deshabilitado para esta cuenta. Contacte a soporte.",
      403,
    );
  }
  return mapTechnician(data as Record<string, unknown>);
};
