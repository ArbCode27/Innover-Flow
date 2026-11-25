import { NextRequest, NextResponse } from "next/server";
import { mapSaeChatProfile } from "@/app/crm/_lib/sae-chat-profile";
import {
  getOrganizationSaeConfig,
  getSaeAbonado,
  getSaeAbonadoSaldo,
  getSaeAbonadoServicios,
  searchSaeAbonados,
  SaeApiError,
} from "@/app/api/crm/_lib/sae-api";
import { pickSaeContract } from "@/lib/sae-cuentas";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";
import { isIntegrationConnected } from "../../_lib/organization-integrations";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

export const GET = async (request: NextRequest) => {
  try {
    const cedula = request.nextUrl.searchParams.get("cedula")?.trim() || "";
    const digits = cedula.replace(/\D/g, "");
    if (digits.length < 4) {
      return NextResponse.json(
        { ok: false, error: "La cédula necesita al menos 4 dígitos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(request);
    const connected = await isIntegrationConnected(
      getSupabaseAdmin(),
      context.organizationId,
      "sae",
    );
    if (!connected) {
      return NextResponse.json({ ok: true, connected: false, profile: null });
    }

    const config = await getOrganizationSaeConfig(context.organizationId);
    const found = await searchSaeAbonados(config, { cedula: digits, limit: 20 });
    const matches = found.data || [];
    const picked = pickSaeContract(matches, digits);
    if (!picked) {
      return NextResponse.json({
        ok: true,
        connected: true,
        profile: null,
        message:
          matches.length > 1
            ? "Hay más de un contrato para esta cédula."
            : "SAE no tiene un contrato para esta cédula.",
      });
    }

    const listed =
      matches.find(
        (item) =>
          item.abonadoId === picked.abonadoId ||
          item.nroContrato === picked.idContrato,
      ) || null;

    const [detalleRes, saldoRes, serviciosRes] = picked.abonadoId
      ? await Promise.all([
          getSaeAbonado(config, picked.abonadoId).catch(() => null),
          getSaeAbonadoSaldo(config, picked.abonadoId).catch(() => null),
          getSaeAbonadoServicios(config, picked.abonadoId).catch(() => null),
        ])
      : [null, null, null];
    const profile = mapSaeChatProfile({
      abonado: detalleRes?.data || listed,
      saldo: saldoRes?.data || null,
      servicios: serviciosRes?.data || [],
    });

    return NextResponse.json({ ok: true, connected: true, profile });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof SaeApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "No se pudo consultar SAE";
    console.error("[SAE_PROFILE] failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
