import { buildRealtimeClientPayload } from "@/lib/supabase-realtime-jwt";
import { APP_ERROR_CODES, AppApiError } from "./app-errors";

export type AppRealtimePayload = NonNullable<
  Awaited<ReturnType<typeof buildRealtimeClientPayload>>
>;

export const buildAppRealtimePayload = async (input: {
  clientId?: number | null;
  technicianId?: string | null;
  organizationId: string;
  conversationId: number;
}): Promise<AppRealtimePayload | null> => {
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

/** Customer login/register: fail loudly if Realtime env/JWT is not configured. */
export const requireAppRealtimePayload = async (input: {
  clientId: number;
  organizationId: string;
  conversationId: number;
}): Promise<AppRealtimePayload> => {
  const realtime = await buildAppRealtimePayload(input);
  if (!realtime) {
    throw new AppApiError(
      APP_ERROR_CODES.SERVICE_UNAVAILABLE,
      "El canal en tiempo real no está configurado. Contacta a soporte.",
      503,
    );
  }
  return realtime;
};
