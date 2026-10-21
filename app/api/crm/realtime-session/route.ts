import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { buildRealtimeClientPayload } from "@/lib/supabase-realtime-jwt";

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const realtime = await buildRealtimeClientPayload({
      appRole: "agent",
      organizationId: context.organizationId,
      subject: `agent:${context.agentId}`,
    });

    if (!realtime) {
      return NextResponse.json({
        realtime: null,
        configured: false,
      });
    }

    return NextResponse.json({
      configured: true,
      realtime,
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "No se pudo abrir el canal en tiempo real" },
      { status: 500 },
    );
  }
};
