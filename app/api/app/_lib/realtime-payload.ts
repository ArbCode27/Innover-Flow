import { buildRealtimeClientPayload } from "@/lib/supabase-realtime-jwt";

export const buildAppRealtimePayload = async (input: {
  clientId: number;
  organizationId: string;
  conversationId: number;
}) =>
  buildRealtimeClientPayload({
    appRole: "client",
    organizationId: input.organizationId,
    subject: `client:${input.clientId}`,
    clientId: input.clientId,
    conversationId: input.conversationId,
  });
