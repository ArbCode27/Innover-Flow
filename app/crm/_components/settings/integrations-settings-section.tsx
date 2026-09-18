"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  HelpCircle,
  Info,
  Link2,
  MessageCircle,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
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
import { Button } from "@/components/ui/button";
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

type Provider = "wispro" | "whatsapp";

interface WebhookMetadata {
  webhook_url?: string;
  verify_token?: string;
  required_fields?: string[];
  coexistence_supported?: boolean;
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
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Campos del formulario
  const [apiToken, setApiToken] = useState("");
  const [wabaId, setWabaId] = useState(String(integration.config.waba_id || ""));
  const [phoneNumberId, setPhoneNumberId] = useState(
    String(integration.config.phone_number_id || ""),
  );

  useEffect(() => {
    setWabaId(String(integration.config.waba_id || ""));
    setPhoneNumberId(String(integration.config.phone_number_id || ""));
  }, [integration.config]);

  const isConnected = integration.status === "connected";
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

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copiado al portapapeles");
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/integrations/whatsapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: apiToken,
          wabaId: wabaId.trim(),
          phoneNumberId: phoneNumberId.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar con Meta");
      }
      onChanged(payload.integration);
      setApiToken("");
      setIsOpen(false);
      toast.success("WhatsApp conectado exitosamente con Coexistencia");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error conectando con WhatsApp",
      );
    } finally {
      setIsSaving(false);
    }
  };

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

  // Resuelve la URL del webhook en el cliente si no viene del server
  const webhookUrl =
    metadata?.webhook_url ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp/webhook`
      : "/api/whatsapp/webhook");
  const verifyToken = metadata?.verify_token || "innover-2403-whatsapp-key";

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
                  {displayPhone || "ID: " + phoneNumberId}
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

            {/* Parámetros del Webhook de Meta para Copiar */}
            <div className="rounded-xl border border-black/5 bg-background/50 p-4 text-xs dark:border-white/10">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Radio className="size-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Configuración del Webhook en Meta Developers</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Campos: messages, message_echoes
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-black/5 p-2 font-mono text-[11px] dark:bg-white/5">
                  <span className="truncate" title={webhookUrl}>
                    {webhookUrl}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={() => handleCopy(webhookUrl, "url")}
                    title="Copiar URL del Webhook">
                    {copiedKey === "url" ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg bg-black/5 p-2 font-mono text-[11px] dark:bg-white/5">
                  <span className="truncate">
                    Token: <span className="font-semibold">{verifyToken}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={() => handleCopy(verifyToken, "token")}
                    title="Copiar Token de Verificación">
                    {copiedKey === "token" ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Estado Desconectado */
          <div className="rounded-xl border border-black/5 bg-background/50 p-6 text-center dark:border-white/10">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <Smartphone className="size-6" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              Conecta tu número oficial con Coexistencia
            </h4>
            <p className={`mx-auto mt-1.5 max-w-lg text-xs leading-relaxed ${CRM_SURFACES.textMuted}`}>
              No tienes que dar de baja tu WhatsApp Business en el celular. Con la coexistencia oficial
              de Meta, el número sigue funcionando en el teléfono de tu equipo mientras este CRM atiende
              mensajes, registra comprobantes y ejecuta la IA en paralelo.
            </p>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button disabled={!canEdit} size="sm">
                  <Link2 className="size-4" />
                  {isConnected ? "Reconfigurar Credenciales" : "Conectar WhatsApp"}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <MessageCircle className="size-5 text-emerald-600" />
                    Conectar WhatsApp Cloud API & Coexistencia
                  </DialogTitle>
                  <DialogDescription>
                    Ingresa las credenciales de tu aplicación en Meta for Developers. Tus tokens se
                    cifran en el servidor con AES-256.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3.5 py-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-waba-id" className="text-xs font-medium">
                      WhatsApp Business Account ID (WABA ID)
                    </Label>
                    <Input
                      id="wa-waba-id"
                      value={wabaId}
                      onChange={(event) => setWabaId(event.target.value)}
                      placeholder="Ej. 102938475610293"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wa-phone-id" className="text-xs font-medium">
                      Phone Number ID
                    </Label>
                    <Input
                      id="wa-phone-id"
                      value={phoneNumberId}
                      onChange={(event) => setPhoneNumberId(event.target.value)}
                      placeholder="Ej. 962760359910040"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wa-token" className="text-xs font-medium">
                      Token de Acceso Permanente (System User Token)
                    </Label>
                    <Input
                      id="wa-token"
                      type="password"
                      autoComplete="new-password"
                      value={apiToken}
                      onChange={(event) => setApiToken(event.target.value)}
                      placeholder="EAAa..."
                    />
                    <p className={`text-[11px] ${CRM_SURFACES.textMuted}`}>
                      Requiere permisos: <code className="text-foreground">whatsapp_business_messaging</code> y{" "}
                      <code className="text-foreground">whatsapp_business_management</code>.
                    </p>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => void handleSave()}
                    disabled={isSaving || !apiToken || !wabaId || !phoneNumberId}>
                    {isSaving ? "Verificando con Meta..." : "Validar y Conectar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {isConnected ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleTest()}
                disabled={isTesting}>
                <RefreshCw className={`size-3.5 ${isTesting ? "animate-spin" : ""}`} />
                Probar Conexión
              </Button>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowGuide((prev) => !prev)}
              className="text-xs">
              <HelpCircle className="size-3.5" />
              {showGuide ? "Ocultar Guía de Coexistencia" : "¿Cómo activar Coexistencia?"}
            </Button>
          </div>

          {isConnected ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" disabled={!canEdit} className="text-red-600 hover:text-red-700">
                  <Unplug className="size-3.5" />
                  Desconectar
                </Button>
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

        {/* Guía Desplegable de Activación de Coexistencia */}
        {showGuide ? (
          <div className="rounded-xl border border-black/10 bg-black/5 p-4 text-xs dark:border-white/10 dark:bg-white/5 space-y-2.5 animate-in fade-in-50">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Sparkles className="size-4 text-emerald-600" />
              <span>Guía para habilitar Coexistencia en Meta Business</span>
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
              <li>
                <strong className="text-foreground">App en Meta for Developers:</strong> Accede a{" "}
                <a
                  href="https://developers.facebook.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-crm-accent underline inline-flex items-center gap-0.5">
                  developers.facebook.com <ExternalLink className="size-3 inline" />
                </a>{" "}
                y crea o selecciona una app de tipo <strong>Negocios</strong> con el producto <strong>WhatsApp</strong>.
              </li>
              <li>
                <strong className="text-foreground">Configurar Webhook:</strong> En la sección WhatsApp → Configuración de la App,
                registra la URL del Webhook y el Verify Token que se muestran arriba.
              </li>
              <li>
                <strong className="text-foreground">Suscribir Campos Requeridos:</strong> En la suscripción de Webhook de WhatsApp, activa
                obligatoriamente:
                <div className="mt-1 flex gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">messages</Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">message_echoes</Badge>
                </div>
                <span className="text-[11px] block mt-1">
                  El campo <code className="font-semibold text-foreground">message_echoes</code> es el que permite que cuando respondas
                  desde tu teléfono celular, el CRM lo sincronice en tiempo real y pause la IA.
                </span>
              </li>
              <li>
                <strong className="text-foreground">Generar Token Permanente:</strong> En Meta Business Manager → Usuarios del Sistema,
                crea un usuario con rol de Administrador y genera un token con permisos{" "}
                <code className="text-foreground">whatsapp_business_messaging</code> y{" "}
                <code className="text-foreground">whatsapp_business_management</code>.
              </li>
            </ol>
          </div>
        ) : null}
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
              <Button disabled={!canEdit} size="sm">
                <Link2 className="size-4" />
                {isConnected ? "Reconfigurar" : "Conectar Wispro"}
              </Button>
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
                <Button
                  onClick={() => void handleSave()}
                  disabled={isSaving || !apiToken || !baseUrl}>
                  {isSaving ? "Validando…" : "Validar y conectar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isConnected ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleTest()}
                disabled={isTesting}>
                <RefreshCw className={`size-4 ${isTesting ? "animate-spin" : ""}`} />
                Probar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={!canEdit}>
                    <Unplug className="size-4" />
                    Desconectar
                  </Button>
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
