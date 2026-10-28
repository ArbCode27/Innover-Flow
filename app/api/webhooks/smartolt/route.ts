import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { parseSignalValue } from "@/lib/smartolt";
import { evaluateAndAlertPortIncidents } from "@/lib/network-incident-alerts";
import type { SmartOltWebhookPayload } from "@/types/smartolt";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as SmartOltWebhookPayload | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ received: true, ignored: "empty_payload" }, { status: 200 });
    }

    const event = (body.event || body.action || body.type || "").trim().toLowerCase();
    const externalId = (body.onu_external_id || body.unique_external_id || "").trim();
    const sn = (body.sn || "").trim().toUpperCase();

    // Si no tenemos identificador de ONU, respondemos 200 sin procesar
    if (!externalId && !sn) {
      return NextResponse.json({ received: true, ignored: "missing_identifier" }, { status: 200 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Localizar la ONU existente en nuestra base de datos
    let query = supabase.from("client_onus").select("id, client_id, board, port, status, rx_signal");
    if (externalId) {
      query = query.eq("onu_external_id", externalId);
    } else {
      query = query.eq("sn", sn);
    }

    const { data: existingOnu } = await query.maybeSingle();

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      updated_at: now,
    };

    // 2. Procesamiento según tipo de evento
    if (event === "onu.status_changed" || body.status || body.onu_status) {
      const newStatus = (body.status || body.onu_status || "").trim();
      if (newStatus) {
        updatePayload.status = newStatus;
        // Solo actualizar status_changed_at si el estado realmente varió
        if (!existingOnu || existingOnu.status?.toLowerCase() !== newStatus.toLowerCase()) {
          updatePayload.status_changed_at = now;
        }
      }
    }

    if (
      event === "onu.signal_changed" ||
      event === "onu.signal_reading" ||
      event === "onu.rx1490_reading" ||
      body.signal != null ||
      body.rx_signal != null ||
      body.rx_power != null ||
      body.rx1490 != null
    ) {
      const rawSignal = body.signal ?? body.rx_signal ?? body.rx_power ?? body.rx1490;
      const parsedRx = parseSignalValue(rawSignal);

      if (parsedRx !== null) {
        updatePayload.rx_signal = parsedRx;
        // Si el valor numérico varió significativamente (>0.5 dBm), registrar signal_changed_at
        const currentRx = existingOnu?.rx_signal != null ? Number(existingOnu.rx_signal) : null;
        if (currentRx === null || Math.abs(currentRx - parsedRx) >= 0.5) {
          updatePayload.signal_changed_at = now;
        }
      }
    }

    if (event === "onu.updated" || event.startsWith("onu.")) {
      if (body.board != null) updatePayload.board = Number(body.board);
      if (body.port != null) updatePayload.port = Number(body.port);
      if (body.zone != null && typeof body.zone === "string") updatePayload.zone = body.zone;
      if (body.olt_id != null) updatePayload.olt_id = String(body.olt_id);
    }

    // 3. Ejecutar actualización en Supabase
    if (Object.keys(updatePayload).length > 1) {
      let updateQuery = supabase.from("client_onus").update(updatePayload);
      if (externalId) {
        updateQuery = updateQuery.eq("onu_external_id", externalId);
      } else {
        updateQuery = updateQuery.eq("sn", sn);
      }

      const { error: updateErr } = await updateQuery;
      if (updateErr) {
        console.warn("[SMARTOLT_WEBHOOK] Error al actualizar client_onus:", updateErr.message);
      }

      // 4. Evaluar incidencias en el puerto PON en segundo plano
      const targetBoard = (updatePayload.board as number | undefined) ?? existingOnu?.board;
      const targetPort = (updatePayload.port as number | undefined) ?? existingOnu?.port;
      const clientId = existingOnu?.client_id;

      if (targetBoard != null && targetPort != null && clientId) {
        void (async () => {
          try {
            const { data: clientData } = await supabase
              .from("clients")
              .select("organization_id")
              .eq("id", clientId)
              .maybeSingle();

            if (clientData?.organization_id) {
              await evaluateAndAlertPortIncidents({
                organizationId: clientData.organization_id,
                board: Number(targetBoard),
                port: Number(targetPort),
              });
            }
          } catch (evalErr) {
            console.warn("[SMARTOLT_WEBHOOK] Error evaluando incidencias del puerto:", evalErr);
          }
        })();
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[SMARTOLT_WEBHOOK] Excepción no controlada:", error);
    // SmartOLT exige HTTP 200 para no reintentar infinitamente en errores de formato
    return NextResponse.json({ received: true, error: "internal_handled" }, { status: 200 });
  }
}
