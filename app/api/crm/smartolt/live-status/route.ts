import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getOnuFullStatusInfo } from "@/lib/smartolt";
import { evaluateAndAlertPortIncidents } from "@/lib/network-incident-alerts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await getCrmAuthContext(req);

    const body = await req.json().catch(() => ({}));
    const onuExternalId = (body.onu_external_id || body.onuExternalId || "").trim();
    const clientId = body.clientId || body.client_id;
    const sn = (body.sn || "").trim().toUpperCase();

    const supabase = getSupabaseAdmin();
    let resolvedExternalId = onuExternalId;

    // Si no se proporcionó onuExternalId directamente, buscar en client_onus por clientId o sn
    if (!resolvedExternalId && (clientId || sn)) {
      let query = supabase.from("client_onus").select("onu_external_id, status, rx_signal");
      if (clientId) {
        query = query.eq("client_id", Number(clientId));
      } else if (sn) {
        query = query.eq("sn", sn);
      }
      const { data: found } = await query.maybeSingle();
      if (found?.onu_external_id) {
        resolvedExternalId = found.onu_external_id;
      }
    }

    if (!resolvedExternalId) {
      return NextResponse.json(
        { error: "No se proporcionó identificador de ONU en SmartOLT (onu_external_id)." },
        { status: 400 },
      );
    }

    // Consultar diagnóstico completo en vivo en SmartOLT
    const fullInfo = await getOnuFullStatusInfo(resolvedExternalId);

    if (!fullInfo) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo obtener el diagnóstico en vivo desde SmartOLT. Verifica la conexión con la OLT.",
        },
        { status: 502 },
      );
    }

    // Sincronizar en la base de datos Supabase
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      updated_at: now,
    };

    if (fullInfo.onu_status) {
      updatePayload.status = fullInfo.onu_status;
    }
    if (fullInfo.rx_power != null) {
      updatePayload.rx_signal = fullInfo.rx_power;
    }
    if (fullInfo.board != null) {
      updatePayload.board = fullInfo.board;
    }
    if (fullInfo.port != null) {
      updatePayload.port = fullInfo.port;
    }
    if (fullInfo.onu_number != null) {
      updatePayload.onu_number = fullInfo.onu_number;
    }

    await supabase
      .from("client_onus")
      .update(updatePayload)
      .eq("onu_external_id", resolvedExternalId);

    // Evaluar estado del puerto PON para alertas a gerentes
    const evalBoard = fullInfo.board;
    const evalPort = fullInfo.port;
    if (evalBoard != null && evalPort != null) {
      void evaluateAndAlertPortIncidents({
        organizationId: context.organizationId,
        board: evalBoard,
        port: evalPort,
      }).catch((e) => console.warn("[LIVE_STATUS] Error evaluando incidencias:", e));
    }

    return NextResponse.json({
      success: true,
      data: fullInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    const status = message.toLowerCase().includes("no autorizado") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
