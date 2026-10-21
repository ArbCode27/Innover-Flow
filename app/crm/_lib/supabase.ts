"use client";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logMessageEvent } from "@/lib/message-event-log";

let client: SupabaseClient<any> | null = null;
let authPromise: Promise<boolean> | null = null;
let lastAuthAt = 0;

const AUTH_REFRESH_MS = 45 * 60 * 1000;

export const getSupabaseClient = () => {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY para usar el CRM.",
    );
  }

  client = createClient(url, anonKey) as SupabaseClient<any>;
  return client;
};

export const ensureCrmRealtimeAuth = async (): Promise<boolean> => {
  if (authPromise && Date.now() - lastAuthAt < AUTH_REFRESH_MS) {
    return authPromise;
  }

  authPromise = (async () => {
    try {
      const response = await fetch("/api/crm/realtime-session", {
        cache: "no-store",
      });
      if (!response.ok) {
        logMessageEvent(
          "crm_realtime_auth",
          {
            ok: false,
            configured: false,
            hasToken: false,
            status: response.status,
          },
          "warn",
        );
        return false;
      }
      const payload = (await response.json()) as {
        configured?: boolean;
        realtime?: { access_token?: string } | null;
      };
      const accessToken = payload.realtime?.access_token;
      const configured = Boolean(payload.configured);
      const hasToken = Boolean(accessToken);
      if (!accessToken) {
        logMessageEvent(
          "crm_realtime_auth",
          { ok: false, configured, hasToken },
          "warn",
        );
        return false;
      }
      await getSupabaseClient().realtime.setAuth(accessToken);
      lastAuthAt = Date.now();
      logMessageEvent("crm_realtime_auth", {
        ok: true,
        configured,
        hasToken,
      });
      return true;
    } catch (error) {
      logMessageEvent(
        "crm_realtime_auth",
        {
          ok: false,
          configured: false,
          hasToken: false,
          error: error instanceof Error ? error.message : String(error),
        },
        "warn",
      );
      return false;
    }
  })();

  return authPromise;
};
