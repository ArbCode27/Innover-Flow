"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "../shared/crm-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFacebookSdk } from "../../_hooks/use-facebook-sdk";
import type { OrganizationIntegration } from "../../_lib/types";

export type EmbeddedSignupConfig = {
  ready?: boolean;
  app_id?: string | null;
  config_id?: string | null;
  graph_version?: string;
};

export type SignupPhone = {
  id: string;
  display_phone_number: string | null;
  verified_name: string | null;
};

type SignupSession = {
  event: string;
  wabaId: string;
  phoneNumberId?: string;
};

const ACCEPTED_EVENTS = new Set([
  "FINISH",
  "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  "FINISH_ONLY_WABA",
]);

const isMetaOrigin = (origin: string) => {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
};

const parseSignupMessage = (data: unknown): SignupSession | null => {
  let payload = data;
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;

  const record = payload as {
    type?: string;
    event?: string;
    data?: { waba_id?: string; phone_number_id?: string };
  };
  if (record.type !== "WA_EMBEDDED_SIGNUP") return null;

  const wabaId = String(record.data?.waba_id || "").trim();
  const phoneNumberId = String(record.data?.phone_number_id || "").trim();
  if (!wabaId) return null;

  return {
    event: String(record.event || "FINISH"),
    wabaId,
    phoneNumberId: phoneNumberId || undefined,
  };
};

const completeSignup = async (body: Record<string, string>) => {
  const response = await fetch(
    "/api/crm/integrations/whatsapp/embedded-signup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json();
  if (!response.ok && payload.status !== "pending") {
    throw new Error(payload.error || "No se pudo completar la vinculación");
  }
  return payload as {
    status: "connected" | "pending";
    integration: OrganizationIntegration;
    phones?: SignupPhone[];
    error?: string;
  };
};

export const WhatsAppEmbeddedSignupButton = ({
  canEdit,
  isConnected,
  signup,
  pendingPhones = [],
  onConnected,
}: {
  canEdit: boolean;
  isConnected: boolean;
  signup?: EmbeddedSignupConfig;
  pendingPhones?: SignupPhone[];
  onConnected: (integration: OrganizationIntegration) => void;
}) => {
  const appId = signup?.app_id || process.env.NEXT_PUBLIC_META_APP_ID || "";
  const configId =
    signup?.config_id ||
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ||
    "";
  const graphVersion =
    signup?.graph_version ||
    process.env.NEXT_PUBLIC_META_GRAPH_VERSION ||
    "v22.0";
  const sdkStatus = useFacebookSdk(appId, graphVersion);

  const [isLaunching, setIsLaunching] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [phones, setPhones] = useState<SignupPhone[]>(pendingPhones);
  const [selectedPhoneId, setSelectedPhoneId] = useState(
    pendingPhones[0]?.id || "",
  );

  useEffect(() => {
    if (!pendingPhones.length) return;
    setPhones(pendingPhones);
    setSelectedPhoneId((current) => current || pendingPhones[0]?.id || "");
  }, [pendingPhones]);

  const sessionRef = useRef<SignupSession | null>(null);
  const codeRef = useRef<string | null>(null);
  const completingRef = useRef(false);
  const sessionTimeoutRef = useRef<number | null>(null);

  const clearSessionTimeout = () => {
    if (sessionTimeoutRef.current == null) return;
    window.clearTimeout(sessionTimeoutRef.current);
    sessionTimeoutRef.current = null;
  };

  const handleSignupResult = useCallback(
    async (result: Awaited<ReturnType<typeof completeSignup>>) => {
      if (result.status === "pending" && result.phones?.length) {
        setPhones(result.phones);
        setSelectedPhoneId(result.phones[0]?.id || "");
        if (result.integration) onConnected(result.integration);
        toast.message("Elige el número de WhatsApp Business a vincular");
        return;
      }
      if (result.status === "connected" && result.integration) {
        setPhones([]);
        setSelectedPhoneId("");
        onConnected(result.integration);
        toast.success("WhatsApp vinculado con coexistencia");
      }
    },
    [onConnected],
  );

  const submitSignup = useCallback(async () => {
    if (completingRef.current) return;
    const code = codeRef.current;
    const session = sessionRef.current;
    if (!code || !session?.wabaId) return;

    completingRef.current = true;
    clearSessionTimeout();
    setIsCompleting(true);
    try {
      const result = await completeSignup({
        code,
        wabaId: session.wabaId,
        ...(session.phoneNumberId
          ? { phoneNumberId: session.phoneNumberId }
          : {}),
        signupEvent: session.event,
      });
      await handleSignupResult(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo vincular WhatsApp con Meta",
      );
    } finally {
      codeRef.current = null;
      sessionRef.current = null;
      completingRef.current = false;
      setIsLaunching(false);
      setIsCompleting(false);
    }
  }, [handleSignupResult]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isMetaOrigin(event.origin)) return;
      const session = parseSignupMessage(event.data);
      if (!session) return;
      if (!ACCEPTED_EVENTS.has(session.event)) {
        toast.error(
          "Debes conectar un número que ya usa WhatsApp Business en el celular",
        );
        setIsLaunching(false);
        return;
      }
      sessionRef.current = session;
      void submitSignup();
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [submitSignup]);

  const handleLaunch = () => {
    if (!canEdit || isLaunching || isCompleting) return;
    if (!signup?.ready || !appId || !configId) {
      toast.error(
        "Falta configurar Embedded Signup en Vercel (App ID, Config ID y App Secret)",
      );
      return;
    }
    if (sdkStatus !== "ready" || !window.FB) {
      toast.error("El SDK de Meta todavía no está listo. Intenta de nuevo.");
      return;
    }

    sessionRef.current = null;
    codeRef.current = null;
    setIsLaunching(true);

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code?.trim();
        if (!code) {
          clearSessionTimeout();
          setIsLaunching(false);
          if (response.status && response.status !== "connected") {
            toast.message("Cancelaste la conexión con Meta");
          }
          return;
        }
        codeRef.current = code;
        clearSessionTimeout();
        sessionTimeoutRef.current = window.setTimeout(() => {
          if (!sessionRef.current && codeRef.current === code) {
            setIsLaunching(false);
            toast.error(
              "Meta no devolvió la cuenta de WhatsApp. Cierra el popup e inténtalo otra vez.",
            );
          }
        }, 12_000);
        void submitSignup();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
        },
      },
    );
  };

  const handleSelectPhone = async () => {
    if (!selectedPhoneId || isCompleting) return;
    setIsCompleting(true);
    try {
      const result = await completeSignup({ phoneNumberId: selectedPhoneId });
      await handleSignupResult(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el número seleccionado",
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const isBusy = isLaunching || isCompleting || sdkStatus === "loading";
  const label = isConnected ? "Reconectar con Meta" : "Continuar con Meta";

  return (
    <>
      <CrmButton
        type="button"
        size="sm"
        disabled={!canEdit || isBusy}
        onClick={handleLaunch}
        aria-label={label}>
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Smartphone className="size-4" aria-hidden="true" />
        )}
        {isCompleting
          ? "Confirmando con Meta…"
          : isLaunching
            ? "Esperando a Meta…"
            : sdkStatus === "loading"
              ? "Cargando Meta…"
              : label}
      </CrmButton>

      <Dialog
        open={phones.length > 0}
        onOpenChange={(open) => {
          if (!open && !isCompleting) setPhones([]);
        }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Elige el número a coexistir</DialogTitle>
            <DialogDescription>
              Meta autorizó la cuenta. Selecciona el número que ya usas en
              WhatsApp Business del celular.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="wa-phone-select">Número de WhatsApp</Label>
            <Select
              value={selectedPhoneId}
              onValueChange={setSelectedPhoneId}>
              <SelectTrigger id="wa-phone-select" className="w-full">
                <SelectValue placeholder="Selecciona un número" />
              </SelectTrigger>
              <SelectContent>
                {phones.map((phone) => (
                  <SelectItem key={phone.id} value={phone.id}>
                    {phone.display_phone_number || phone.id}
                    {phone.verified_name ? ` · ${phone.verified_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <CrmButton
              type="button"
              onClick={() => void handleSelectPhone()}
              disabled={!selectedPhoneId || isCompleting}>
              {isCompleting ? "Vinculando…" : "Vincular este número"}
            </CrmButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
