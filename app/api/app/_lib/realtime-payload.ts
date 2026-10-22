import { buildRealtimeClientPayload } from "@/lib/supabase-realtime-jwt";

export const buildAppRealtimePayload = async (input: {
  clientId?: number | null;
  technicianId?: string | null;
  organizationId: string;
  conversationId: number;
}) => {
  if (input.technicianId) {
    return buildRealtimeClientPayload({
      appRole: "client",
      organizationId: input.organizationId,
      subject: `technician:${input.technicianId}`,
      conversationId: input.conversationId,
    });
  }

  const clientId = Number(input.clientId);
  if (!Number.isFinite(clientId) || clientId <= 0) {
    return null;
  }

  return buildRealtimeClientPayload({
    appRole: "client",
    organizationId: input.organizationId,
    subject: `client:${clientId}`,
    clientId,
    conversationId: input.conversationId,
  });
};
