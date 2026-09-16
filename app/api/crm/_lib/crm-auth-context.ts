import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  CRM_SESSION_COOKIE,
  verifySignedSessionToken,
} from "./crm-session";

export type CrmAuthContext = {
  agentId: number;
  agentRole: string;
  organizationId: string;
  organizationRole: "owner" | "admin" | "supervisor" | "advisor";
};

export class CrmAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "CrmAuthError";
  }
}

export const getCrmAuthContext = async (
  request: NextRequest,
): Promise<CrmAuthContext> => {
  const token = request.cookies.get(CRM_SESSION_COOKIE)?.value;
  const session = await verifySignedSessionToken(token);
  if (!session) {
    throw new CrmAuthError("Sesión no válida o expirada");
  }

  const supabase = getSupabaseAdmin();
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", session.organizationId)
    .eq("agent_id", session.agentId)
    .maybeSingle();

  if (error || !membership || membership.status !== "active") {
    throw new CrmAuthError(
      "No tienes acceso a esta organización",
      403,
    );
  }

  return {
    agentId: session.agentId,
    agentRole: session.role,
    organizationId: session.organizationId,
    organizationRole: membership.role as CrmAuthContext["organizationRole"],
  };
};

export const canManageOrganization = (context: CrmAuthContext) =>
  context.organizationRole === "owner" ||
  context.organizationRole === "admin";

export const canViewOrganizationMetrics = (context: CrmAuthContext) =>
  canManageOrganization(context) || context.organizationRole === "supervisor";
