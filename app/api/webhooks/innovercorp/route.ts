import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  evaluateAndAlertPortIncidents,
  broadcastIncidentAlert,
  loadManagerDeviceTokens,
} from "@/lib/network-incident-alerts";
import {
  buildExpoNetworkAlertPushMessage,
  sendExpoPushMessages,
} from "@/lib/expo-push";
import { parseSignalValue } from "@/lib/smartolt";

export const dynamic = "force-dynamic";

interface InnoverOnuItem {
  sn?: string;
  onu_external_id?: string;
  status?: string;
  rx_signal?: string | number;
  board?: number | string;
  port?: number | string;
}

interface InnoverIncidentWebhookPayload {
  event?: string;
  action?: string;
  board?: number | string;
  port?: number | string;
  status?: string;
  severity?: "critical" | "warning" | "normal";
  affected_count?: number;
  title?: string;
  body?: string;
  description?: string;
  organization_id?: string;
  onus?: InnoverOnuItem[];
}

/**
 * POST /api/webhooks/innovercorp
 * Endpoint oficial para recibir alertas push de incidencias, caídas de red y desconexión
 * de clientes desde la plataforma central de InnoverCorp.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verificación opcional de firma o secreto compartido
    const secret =
      req.headers.get("x-innover-secret") ||
      req.headers.get("x-webhook-secret") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

    const expectedSecret =
      process.env.INNOVER_WEBHOOK_SECRET ||
      process.env.SMARTOLT_WEBHOOK_SECRET;

    if (expectedSecret && secret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Firma o secreto no válido" }, { status: 401 });
    }

    const payload = (await req.json().catch(() => null)) as InnoverIncidentWebhookPayload | null;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Payload JSON no válido" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 2. Determinar la organización
    let organizationId =
      payload.organization_id ||
      req.headers.get("x-organization-id") ||
      "";

    if (!organizationId) {
      const { data: defaultOrg } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", "innover")
        .maybeSingle();

      if (defaultOrg?.id) {
        organizationId = defaultOrg.id;
      } else {
        const { data: firstOrg } = await supabase
          .from("organizations")
          .select("id")
          .limit(1)
          .maybeSingle();
        organizationId = firstOrg?.id || "";
      }
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "No se pudo determinar la organización destino" },
        { status: 400 },
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const event = (payload.event || payload.action || "").trim().toLowerCase();
    const statusParam = (payload.status || "").trim().toLowerCase();
    const isResolved =
      event === "incident_resolved" ||
      event === "restored" ||
      statusParam === "resolved" ||
      payload.severity === "normal";

    const board =
      payload.board != null ? Number(payload.board) : undefined;
    const port =
      payload.port != null ? Number(payload.port) : undefined;

    // 3. Procesar lista de ONUs desconectadas si se proporcionaron
    const onusList = Array.isArray(payload.onus) ? payload.onus : [];
    const portsToEvaluate = new Set<string>();

    if (board != null && port != null) {
      portsToEvaluate.add(`${board}:${port}`);
    }

    for (const onu of onusList) {
      const sn = (onu.sn || "").trim().toUpperCase();
      const extId = (onu.onu_external_id || "").trim();
      if (!sn && !extId) continue;

      const onuBoard = onu.board != null ? Number(onu.board) : board;
      const onuPort = onu.port != null ? Number(onu.port) : port;

      if (onuBoard != null && onuPort != null) {
        portsToEvaluate.add(`${onuBoard}:${onuPort}`);
      }

      const updateData: Record<string, unknown> = {
        updated_at: nowIso,
      };

      if (onu.status) {
        updateData.status = onu.status;
        updateData.status_changed_at = nowIso;
      }

      if (onu.rx_signal != null) {
        const parsedRx = parseSignalValue(onu.rx_signal);
        if (parsedRx !== null) {
          updateData.rx_signal = parsedRx;
          updateData.signal_changed_at = nowIso;
        }
      }

      if (onuBoard != null) updateData.board = onuBoard;
      if (onuPort != null) updateData.port = onuPort;

      let updateQuery = supabase.from("client_onus").update(updateData);
      if (extId) {
        updateQuery = updateQuery.eq("onu_external_id", extId);
      } else {
        updateQuery = updateQuery.eq("sn", sn);
      }

      await updateQuery;
    }

    // 4. Caso A: Resolución de incidencia
    if (isResolved && board != null && port != null) {
      await supabase
        .from("pon_incident_alerts")
        .update({
          status: "resolved",
          resolved_at: nowIso,
          updated_at: nowIso,
        })
        .eq("organization_id", organizationId)
        .eq("board", board)
        .eq("port", port)
        .eq("status", "active");

      // Notificar resolución a gerentes vía Push Expo
      const tokens = await loadManagerDeviceTokens(supabase, organizationId);
      if (tokens.length > 0) {
        const resolutionMessages = tokens.map((token) =>
          buildExpoNetworkAlertPushMessage({
            token,
            clients: [],
            fallbackBoard: board,
            fallbackPort: port,
            forcedSeverity: "normal",
          }),
        );
        void sendExpoPushMessages(resolutionMessages).catch((err) =>
          console.warn("[INNOVER_WEBHOOK] Error enviando push de resolución:", err),
        );
      }

      // Difusión en tiempo real hacia las pantallas de gerentes
      await broadcastIncidentAlert(supabase, organizationId, {
        event: "incident_resolved",
        board,
        port,
        affectedCount: 0,
        severity: "normal",
        title: `✅ Red Normalizada: Tarjeta ${board} • Puerto ${port}`,
        body: `Servicios restablecidos en Tarjeta ${board} / Puerto PON ${port}.`,
        status: "resolved",
      });

      return NextResponse.json({
        success: true,
        resolved: true,
        board,
        port,
        timestamp: nowIso,
      });
    }

    // 5. Caso B: Evaluación y Alerta de incidencias activas en cada puerto PON afectado
    const evaluations = [];

    for (const portKey of portsToEvaluate) {
      const [bStr, pStr] = portKey.split(":");
      const evalB = Number(bStr);
      const evalP = Number(pStr);

      if (isNaN(evalB) || isNaN(evalP)) continue;

      const evalResult = await evaluateAndAlertPortIncidents({
        organizationId,
        board: evalB,
        port: evalP,
      });

      evaluations.push(evalResult);
    }

    // Si no había clientes en DB pero vino una alerta explícita desde InnoverCorp con board y port:
    if (evaluations.length === 0 && board != null && port != null) {
      const affectedCount = payload.affected_count || (onusList.length > 0 ? onusList.length : 3);
      const severity = payload.severity || (affectedCount >= 3 ? "critical" : "warning");
      const title =
        payload.title ||
        `🚨 Alerta InnoverCorp: Incidencia en Tarjeta ${board} • Puerto ${port}`;
      const bodyText =
        payload.body ||
        payload.description ||
        `Se han detectado ${affectedCount} clientes desconectados en Tarjeta ${board} / Puerto PON ${port}.`;

      // Registrar alerta activa en BD
      await supabase.from("pon_incident_alerts").insert({
        organization_id: organizationId,
        board,
        port,
        incident_type: severity === "critical" ? "massive_outage" : "altered_power",
        affected_count: affectedCount,
        los_count: affectedCount,
        altered_power_count: 0,
        status: "active",
        first_detected_at: nowIso,
        last_alert_sent_at: nowIso,
      });

      // Emitir broadcast en tiempo real
      await broadcastIncidentAlert(supabase, organizationId, {
        event: "incident_push",
        board,
        port,
        affectedCount,
        severity,
        title,
        body: bodyText,
        status: "active",
      });

      // Enviar push a gerentes
      const tokens = await loadManagerDeviceTokens(supabase, organizationId);
      if (tokens.length > 0) {
        const messages = tokens.map((token) =>
          buildExpoNetworkAlertPushMessage({
            token,
            fallbackBoard: board,
            fallbackPort: port,
            forcedSeverity: severity,
          }),
        );
        void sendExpoPushMessages(messages).catch((err) =>
          console.warn("[INNOVER_WEBHOOK] Error enviando push Expo:", err),
        );
      }

      evaluations.push({
        hasIncident: true,
        board,
        port,
        totalAffected: affectedCount,
        alertSent: tokens.length > 0,
        recipientsCount: tokens.length,
        status: "active",
      });
    }

    return NextResponse.json({
      received: true,
      organizationId,
      evaluationsCount: evaluations.length,
      evaluations,
      timestamp: nowIso,
    });
  } catch (error) {
    console.error("[INNOVER_WEBHOOK] Error procesando webhook:", error);
    const message = error instanceof Error ? error.message : "Error interno procesando webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
