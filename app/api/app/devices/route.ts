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

    // Si es sesión de cliente
    const isCustomer = session.role === "customer" && Boolean(session.clientId);
    // Si es sesión de técnico o supervisor (gerente técnico)
    const isStaff = (session.role === "technician" || session.role === "supervisor") && Boolean(session.technicianId);

    if (!isCustomer && !isStaff) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "session_identity_not_eligible_for_push",
      });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const payload: Record<string, unknown> = {
      organization_id: session.organizationId,
      push_token: parsed.push_token,
      platform: parsed.platform,
      role: session.role,
      updated_at: now,
    };

    if (isCustomer) {
      payload.client_id = session.clientId;
    } else if (isStaff) {
      payload.technician_id = session.technicianId;
    }

    // UPSERT por (organization_id, push_token)
    const { data, error } = await supabase
      .from("app_devices")
      .upsert(payload, { onConflict: "organization_id,push_token" })
      .select("id, client_id, technician_id, role, platform, updated_at")
      .single();

    if (error) {
      // Fallback si la migración aún no ha eliminado NOT NULL de client_id y es staff
      if (!isCustomer && error.message.includes("client_id")) {
        console.warn("[APP_DEVICES] Requiere aplicar migración 20261027110000 para staff push");
      }
      throw error;
    }

    return NextResponse.json({ success: true, device: data });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.DEVICE_REGISTER_FAILED,
      error: "No se pudieron activar las notificaciones. Intenta de nuevo.",
    });
  }
};
