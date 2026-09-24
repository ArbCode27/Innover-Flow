"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Link2,
  MessageCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Unplug,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { CrmButton } from "../shared/crm-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  OrganizationIntegration,
  OrganizationRole,
} from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import {
  WhatsAppEmbeddedSignupButton,
  type EmbeddedSignupConfig,
  type SignupPhone,
} from "./whatsapp-embedded-signup-button";

type Provider = "wispro" | "whatsapp";

interface WebhookMetadata {
  webhook_url?: string;
  required_fields?: string[];
  coexistence_supported?: boolean;
  embedded_signup?: EmbeddedSignupConfig;
}

const emptyIntegration = (provider: Provider): OrganizationIntegration => ({
  provider,
  status: "disconnected",
  config: {},
  has_credentials: false,
  last_verified_at: null,
  last_error: null,
  updated_at: "",
});

const statusLabel: Record<OrganizationIntegration["status"], string> = {
  connected: "Conectado",
  disconnected: "Sin conectar",
  pending: "Pendiente",
  error: "Con error",
};

/**
 * Tarjeta especializada en WhatsApp Cloud API con soporte nativo de Coexistencia.
 */
const WhatsAppCoexistenceCard = ({
  integration,
  metadata,
  canEdit,
  onChanged,
}: {
  integration: OrganizationIntegration;
  metadata?: WebhookMetadata;
  canEdit: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

  const isConnected = integration.status === "connected";
  const isPending = integration.status === "pending";
  const pendingPhones = Array.isArray(integration.config.pending_phones)
    ? (integration.config.pending_phones as SignupPhone[])
    : [];
  const signupReady = metadata?.embedded_signup?.ready !== false;
  const displayPhone = String(
    integration.config.display_phone_number ||
      integration.config.phone_number_id ||
      "",
  );
  const verifiedName = String(integration.config.verified_name || "");
  const qualityRating = String(integration.config.quality_rating || "").toUpperCase();

  // Flags de coexistencia
  const autoHuman = integration.config.coexistence_auto_human !== false;
  const syncEchoes = integration.config.coexistence_sync_echoes !== false;

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/crm/integrations/whatsapp", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La verificación falló");
      }
      onChanged(payload.integration);
      toast.success("Conexión con Meta Graph API verificada y activa");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "La conexión con Meta falló",
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleCoexistenceSetting = async (
    key: "coexistence_auto_human" | "coexistence_sync_echoes",
    nextValue: boolean,
  ) => {
    if (!canEdit || isUpdatingConfig) return;
    setIsUpdatingConfig(true);
    try {
      const response = await fetch("/api/crm/integrations/whatsapp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo actualizar");
      }
      onChanged(payload.integration);
      toast.success("Ajuste de coexistencia actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar ajuste",
      );
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/crm/integrations/whatsapp", {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration("whatsapp"));
    toast.success("WhatsApp desconectado");
  };

  return (
    <Card className="col-span-1 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 shadow-xs dark:border-emerald-500/20 dark:bg-emerald-950/10 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
              <MessageCircle className="size-6" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">
                  WhatsApp Cloud API & Coexistencia
                </CardTitle>
              </div>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Opera con tu aplicación WhatsApp Business en el celular y con este CRM al mismo tiempo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isConnected ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <Smartphone className="size-3.5" aria-hidden="true" />
                <span className="mx-1">+</span>
                <Cloud className="size-3.5" aria-hidden="true" />
                <span>Coexistencia Activa</span>
              </Badge>
            ) : null}
            {isPending ? (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                Pendiente de número
              </Badge>
            ) : null}

            <Badge
              variant={isConnected ? "default" : "secondary"}
              className={
                isConnected
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : ""
              }>
              {isConnected ? (
                <span className="mr-1.5 flex size-2 rounded-full bg-white animate-pulse" />
              ) : null}
              {statusLabel[integration.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isConnected ? (
          <>
            {/* Resumen del número verificado en Meta */}
            <div className="grid gap-3 rounded-xl border border-emerald-500/20 bg-background/60 p-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <p className={`text-[11px] font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
                  Número Conectado
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {displayPhone || "Pendiente de número"}
                </p>
              </div>

              <div>
                <p className={`text-[11px] font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
                  Nombre en Meta
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
                  <span className="truncate font-medium text-foreground">
                    {verifiedName || "Verificado"}
                  </span>
                </div>
              </div>

              <div>
                <p className={`text-[11px] font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
                  Calidad de Línea
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`size-2.5 rounded-full ${
                      qualityRating === "GREEN"
                        ? "bg-emerald-500"
                        : qualityRating === "YELLOW"
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                  />
                  <span className="text-xs font-medium text-foreground">
                    {qualityRating === "GREEN"
                      ? "Excelente (Verde)"
                      : qualityRating === "YELLOW"
                        ? "Media (Amarillo)"
                        : qualityRating || "Normal"}
                  </span>
                </div>
              </div>

              <div>
                <p className={`text-[11px] font-medium uppercase tracking-wider ${CRM_SURFACES.textMuted}`}>
                  Última Validación
                </p>
                <p className="mt-1 text-xs text-foreground">
                  {integration.last_verified_at
                    ? new Date(integration.last_verified_at).toLocaleTimeString(
                        "es-VE",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        },
                      )
                    : "Reciente"}
                </p>
              </div>
            </div>

            {/* Panel de Controles de Coexistencia Inteligente */}
            <div className="rounded-xl border border-black/5 bg-background/80 p-4 dark:border-white/10">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="size-4 text-crm-accent" aria-hidden="true" />
                <h4 className="text-sm font-semibold text-foreground">
                  Comportamiento de Coexistencia (Móvil & CRM)
                </h4>
              </div>

              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="switch-auto-human"
                      className="cursor-pointer text-xs font-medium text-foreground">
                      Pausa automática de IA al responder desde el celular
                    </Label>
                    <p className={`text-[11px] leading-relaxed ${CRM_SURFACES.textMuted}`}>
                      Si tú o tus asesores responden a un cliente directamente desde la app de WhatsApp
                      Business en el celular, el CRM detecta el mensaje y activa el modo humano en ese
                      chat para que la IA no interfiera.
                    </p>
                  </div>
                  <Switch
                    id="switch-auto-human"
                    checked={autoHuman}
                    disabled={!canEdit || isUpdatingConfig}
                    onCheckedChange={(checked) =>
                      void handleToggleCoexistenceSetting(
                        "coexistence_auto_human",
                        checked,
                      )
                    }
                  />
                </div>

                <div className="border-t border-black/5 pt-3 dark:border-white/5 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="switch-sync-echoes"
                      className="cursor-pointer text-xs font-medium text-foreground">
                      Sincronización de respuestas móviles en el historial (Echoes)
                    </Label>
                    <p className={`text-[11px] leading-relaxed ${CRM_SURFACES.textMuted}`}>
                      Guarda automáticamente en el hilo de conversación del CRM los mensajes que tú o tu
                      equipo envíen desde el teléfono móvil físico.
                    </p>
                  </div>
                  <Switch
                    id="switch-sync-echoes"
                    checked={syncEchoes}
                    disabled={!canEdit || isUpdatingConfig}
                    onCheckedChange={(checked) =>
                      void handleToggleCoexistenceSetting(
                        "coexistence_sync_echoes",
                        checked,
                      )
                    }
                  />
                </div>
              </div>
            </div>

          </>
        ) : (
          <div className="rounded-xl border border-black/5 bg-background/50 p-6 text-center dark:border-white/10">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <Smartphone className="size-6" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              {isPending
                ? "Meta autorizó la cuenta. Falta elegir el número"
                : "Conecta WhatsApp con coexistencia"}
            </h4>
            <p
              className={`mx-auto mt-1.5 max-w-lg text-xs leading-relaxed ${CRM_SURFACES.textMuted}`}>
              La única vía es Embedded Signup de Meta. El número sigue en WhatsApp
              Business del celular; el CRM recibe mensajes y ecos al mismo tiempo.
            </p>
            {!signupReady ? (
              <p className="mx-auto mt-3 max-w-lg text-[11px] text-amber-700 dark:text-amber-300">
                Falta configurar en Vercel: NEXT_PUBLIC_META_APP_ID,
                NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID y WHATSAPP_APP_SECRET.
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <WhatsAppEmbeddedSignupButton
              canEdit={canEdit}
              isConnected={isConnected}
              signup={metadata?.embedded_signup}
              pendingPhones={pendingPhones}
              onConnected={onChanged}
            />

            {isConnected ? (
              <CrmButton
                size="sm"
                variant="secondary"
                onClick={() => void handleTest()}
                disabled={isTesting}>
                <RefreshCw className={`size-3.5 ${isTesting ? "animate-spin" : ""}`} />
                Probar Conexión
              </CrmButton>
            ) : null}
          </div>

          {isConnected || isPending ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <CrmButton size="sm" variant="ghost" disabled={!canEdit} className="text-red-600 hover:text-red-700">
                  <Unplug className="size-3.5" />
                  Desconectar
                </CrmButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Desconectar WhatsApp?</AlertDialogTitle>
                  <AlertDialogDescription>
                    El CRM dejará de recibir y enviar mensajes con esta cuenta inmediatamente. Tu app
                    móvil de WhatsApp seguirá funcionando intacta en tu teléfono.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleDisconnect()}>
                    Desconectar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Tarjeta de integración de Wispro (Facturación e ISP).
 */
const WisproCard = ({
  integration,
  canEdit,
  onChanged,
}: {
  integration: OrganizationIntegration;
  canEdit: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    String(
      integration.config.base_url || "https://www.cloud.wispro.co/api/v1",
    ),
  );

  useEffect(() => {
    setBaseUrl(
      String(
        integration.config.base_url || "https://www.cloud.wispro.co/api/v1",
      ),
    );
  }, [integration.config]);

  const isConnected = integration.status === "connected";

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/integrations/wispro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken, baseUrl }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar");
      }
      onChanged(payload.integration);
      setApiToken("");
      setIsOpen(false);
      toast.success("Wispro conectado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/crm/integrations/wispro", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La conexión falló");
      }
      onChanged(payload.integration);
      toast.success("Conexión con Wispro verificada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La conexión falló");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/crm/integrations/wispro", {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration("wispro"));
    toast.success("Wispro desconectado");
  };

  return (
    <Card className="col-span-1 rounded-2xl border border-black/5 bg-transparent dark:border-white/10 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
              <Server className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold">Wispro Cloud</CardTitle>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Consulta clientes, contratos, facturas y promesas de pago automáticamente.
              </p>
            </div>
          </div>

          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? (
              <CheckCircle2 className="mr-1 size-3" />
            ) : null}
            {statusLabel[integration.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected ? (
          <div className={`space-y-1 text-xs ${CRM_SURFACES.textMuted}`}>
            <p>
              URL API: <span className="font-mono text-foreground">{String(integration.config.base_url || "")}</span>
            </p>
            <p>
              Verificada:{" "}
              {integration.last_verified_at
                ? new Date(integration.last_verified_at).toLocaleString("es-VE")
                : "Reciente"}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <CrmButton disabled={!canEdit} size="sm">
                <Link2 className="size-4" />
                {isConnected ? "Reconfigurar" : "Conectar Wispro"}
              </CrmButton>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Conectar Wispro</DialogTitle>
                <DialogDescription>
                  Ingresa tu API Key de Wispro Cloud. Las credenciales se cifran en el servidor.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wispro-base-url">URL de la API</Label>
                  <Input
                    id="wispro-base-url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wispro-token">API Key de Wispro</Label>
                  <Input
                    id="wispro-token"
                    type="password"
                    autoComplete="new-password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    placeholder="Token de acceso..."
                  />
                </div>
              </div>
              <DialogFooter>
                <CrmButton
                  onClick={() => void handleSave()}
                  disabled={isSaving || !apiToken || !baseUrl}>
                  {isSaving ? "Validando…" : "Validar y conectar"}
                </CrmButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isConnected ? (
            <>
              <CrmButton
                size="sm"
                variant="secondary"
                onClick={() => void handleTest()}
                disabled={isTesting}>
                <RefreshCw className={`size-4 ${isTesting ? "animate-spin" : ""}`} />
                Probar
              </CrmButton>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <CrmButton size="sm" variant="ghost" disabled={!canEdit}>
                    <Unplug className="size-4" />
                    Desconectar
                  </CrmButton>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Desconectar Wispro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El CRM dejará de consultar contratos y facturas en tiempo real con estas credenciales.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleDisconnect()}>
                      Desconectar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export const IntegrationsSettingsSection = ({
  organizationRole,
}: {
  organizationRole: OrganizationRole | null;
}) => {
  const [integrations, setIntegrations] = useState<Record<Provider, OrganizationIntegration>>({
    wispro: emptyIntegration("wispro"),
    whatsapp: emptyIntegration("whatsapp"),
  });
  const [whatsappMetadata, setWhatsappMetadata] = useState<WebhookMetadata>({});
  const canEdit = organizationRole === "owner" || organizationRole === "admin";

  const loadIntegration = useCallback(async (provider: Provider) => {
    const response = await fetch(`/api/crm/integrations/${provider}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    setIntegrations((current) => ({
      ...current,
      [provider]: payload.integration,
    }));
    if (provider === "whatsapp" && payload.metadata) {
      setWhatsappMetadata(payload.metadata);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadIntegration("wispro"), loadIntegration("whatsapp")]);
  }, [loadIntegration]);

  const handleChanged = (integration: OrganizationIntegration) => {
    if (!integration.provider) return;
    setIntegrations((current) => ({
      ...current,
      [integration.provider]: integration,
    }));
  };

  return (
    <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader>
        <CardTitle className="text-base">Canales e Integraciones</CardTitle>
        <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
          Configura y gestiona las conexiones oficiales de WhatsApp y sistemas externos para tu organización.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <WhatsAppCoexistenceCard
          integration={integrations.whatsapp}
          metadata={whatsappMetadata}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
        <WisproCard
          integration={integrations.wispro}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
      </CardContent>
    </Card>
  );
};
