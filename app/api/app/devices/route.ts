import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppAuthContext } from "../_lib/app-auth";
import {
  APP_ERROR_CODES,
  parseAppJsonBody,
  parseAppSchema,
  toAppErrorResponse,
} from "../_lib/app-errors";

const schema = z.object({
  push_token: z
    .string({ invalid_type_error: "El token de notificaciones no es válido" })
    .trim()
    .min(8, "El token de notificaciones no es válido")
    .max(4096, "El token de notificaciones no es válido"),
  platform: z
    .enum(["ios", "android", "web"], {
      errorMap: () => ({ message: "La plataforma debe ser ios, android o web" }),
    })
    .default("android"),
});

export const POST = async (request: NextRequest) => {
  try {
    const session = await getAppAuthContext(request);
    const parsed = parseAppSchema(
      schema,
      await parseAppJsonBody(request),
      "No se pudo registrar el dispositivo. Revisa los datos.",
    );

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const payload = {
      organization_id: session.organizationId,
      client_id: session.clientId,
      push_token: parsed.push_token,
      platform: parsed.platform,
      updated_at: now,
    };
    // Tabla real: public.app_devices
    // UPSERT preferido: UNIQUE (client_id, push_token)
    // Fallback: UNIQUE (organization_id, push_token) reasigna el token al cliente del login.
    const first = await supabase
      .from("app_devices")
      .upsert(payload, { onConflict: "client_id,push_token" })
      .select("id, client_id, platform, updated_at")
      .single();

    const { data, error } =
      first.error
        ? await supabase
            .from("app_devices")
            .upsert(payload, { onConflict: "organization_id,push_token" })
            .select("id, client_id, platform, updated_at")
            .single()
        : first;

    if (error) throw error;

    return NextResponse.json({ success: true, device: data });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.DEVICE_REGISTER_FAILED,
      error: "No se pudieron activar las notificaciones. Intenta de nuevo.",
    });
  }
};
