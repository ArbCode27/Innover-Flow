import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { AppAuthError, getAppAuthContext } from "../_lib/app-auth";

const schema = z.object({
  push_token: z.string().trim().min(8).max(4096),
  platform: z.enum(["ios", "android", "web"]).default("android"),
});

export const POST = async (request: NextRequest) => {
  try {
    const session = await getAppAuthContext(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("app_devices")
      .upsert(
        {
          organization_id: session.organizationId,
          client_id: session.clientId,
          push_token: parsed.data.push_token,
          platform: parsed.data.platform,
          updated_at: now,
        },
        { onConflict: "organization_id,push_token" },
      )
      .select("id, platform")
      .single();

    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") {
        return NextResponse.json(
          { error: "Aplica la migración de app_devices en Supabase" },
          { status: 503 },
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, device: data });
  } catch (error) {
    const status = error instanceof AppAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo registrar el dispositivo" },
      { status },
    );
  }
};
