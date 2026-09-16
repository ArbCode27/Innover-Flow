import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { unlinkWisproClient } from "@/app/crm/_lib/wispro-associate";
import type { Client } from "@/app/crm/_lib/types";
import { getCrmAuthContext } from "../../_lib/crm-auth-context";

const unlinkSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export async function POST(req: NextRequest) {
  try {
    const payload = unlinkSchema.safeParse(await req.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const context = await getCrmAuthContext(req);
    const client = await unlinkWisproClient(
      supabase,
      payload.data.clientId,
      context.organizationId,
    );

    return NextResponse.json({ client: client as Client });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing environment")) {
      console.error(error.message);
      return NextResponse.json(
        { error: "Integración Wispro no configurada en el servidor" },
        { status: 503 },
      );
    }

    const message =
      error instanceof Error ? error.message : "No se pudo desvincular Wispro";

    console.error("Wispro unlink error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
