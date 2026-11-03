"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Link2,
  Network,
  RefreshCw,
  Server,
  Unplug,
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
import type {
  Organization,
  OrganizationIntegration,
  OrganizationRole,
} from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";

type Provider = "wispro" | "smartolt";

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
                Consulta clientes, contratos, facturas y promesas de pago de esta sucursal.
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

/**
 * Tarjeta de integración de SmartOLT (Diagnóstico óptico y monitoreo PON).
 */
const SmartOltCard = ({
  organization,
  integration,
  canEdit,
  onChanged,
}: {
  organization?: Organization | null;
  integration: OrganizationIntegration;
  canEdit: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    String(integration.config.base_url || ""),
  );
  const [hasCopiedWebhook, setHasCopiedWebhook] = useState(false);

  useEffect(() => {
    setBaseUrl(String(integration.config.base_url || ""));
  }, [integration.config]);

  const isConnected = integration.status === "connected";

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/smartolt?org=${organization?.slug || organization?.id || ""}`
      : "";

  const handleCopyWebhook = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setHasCopiedWebhook(true);
      toast.success("URL del Webhook copiada al portapapeles");
      setTimeout(() => setHasCopiedWebhook(false), 2500);
    } catch {
      toast.error("No se pudo copiar la URL");
    }
  };

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/integrations/smartolt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar con SmartOLT");
      }
      onChanged(payload.integration);
      setApiKey("");
      setIsOpen(false);
      toast.success("SmartOLT conectado correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/crm/integrations/smartolt", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La conexión falló");
      }
      onChanged(payload.integration);
      toast.success("Conexión con SmartOLT verificada exitosamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La conexión falló");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/crm/integrations/smartolt", {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration("smartolt"));
    toast.success("SmartOLT desconectado");
  };

  return (
    <Card className="col-span-1 rounded-2xl border border-black/5 bg-transparent dark:border-white/10 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
              <Network className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold">SmartOLT</CardTitle>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Diagnóstico óptico en vivo, búsqueda de ONUs y monitoreo de incidencias PON exclusivo para esta sucursal.
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
          <div className={`space-y-1.5 text-xs ${CRM_SURFACES.textMuted}`}>
            <p>
              URL / Subdominio: <span className="font-mono text-foreground">{String(integration.config.base_url || "")}</span>
            </p>
            <p>
              Verificada:{" "}
              {integration.last_verified_at
                ? new Date(integration.last_verified_at).toLocaleString("es-VE")
                : "Reciente"}
            </p>

            <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">Webhook para SmartOLT de esta sucursal:</span>
                <CrmButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => void handleCopyWebhook()}>
                  {hasCopiedWebhook ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copiar URL</span>
                    </>
                  )}
                </CrmButton>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {webhookUrl}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                Pega esta URL en tu panel de SmartOLT (Ajustes &gt; Webhooks) activando eventos de estado (<code>onu.status_changed</code>) y potencia óptica (<code>onu.signal_changed</code>).
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <CrmButton disabled={!canEdit} size="sm">
                <Link2 className="size-4" />
                {isConnected ? "Reconfigurar" : "Conectar SmartOLT"}
              </CrmButton>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Conectar SmartOLT</DialogTitle>
                <DialogDescription>
                  Ingresa el subdominio o URL de tu instancia SmartOLT y tu API Key (X-Token). Las credenciales se almacenan cifradas con AES-256-GCM.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="smartolt-base-url">Subdominio o URL de SmartOLT</Label>
                  <Input
                    id="smartolt-base-url"
                    value={baseUrl}
                    placeholder="ej. mi-empresa o https://mi-empresa.smartolt.com"
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Puedes colocar solo tu subdominio (ej: <code>mi-empresa</code>) o la URL completa.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smartolt-token">API Key (X-Token)</Label>
                  <Input
                    id="smartolt-token"
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Token de acceso SmartOLT..."
                  />
                </div>
              </div>
              <DialogFooter>
                <CrmButton
                  onClick={() => void handleSave()}
                  disabled={isSaving || !apiKey || !baseUrl}>
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
                    <AlertDialogTitle>¿Desconectar SmartOLT?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta sucursal dejará de consultar diagnósticos ópticos y recibir alertas automáticas de puertos PON con estas credenciales.
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
  organization,
  organizationRole,
}: {
  organization?: Organization | null;
  organizationRole: OrganizationRole | null;
}) => {
  const [integrations, setIntegrations] = useState<Record<Provider, OrganizationIntegration>>({
    wispro: emptyIntegration("wispro"),
    smartolt: emptyIntegration("smartolt"),
  });
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
  }, []);

  useEffect(() => {
    void loadIntegration("wispro");
    void loadIntegration("smartolt");
  }, [loadIntegration]);

  const handleChanged = (integration: OrganizationIntegration) => {
    if (integration.provider !== "wispro" && integration.provider !== "smartolt") return;
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
          Configura sistemas externos independientes para esta sucursal (Facturación ISP y Red Óptica).
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <WisproCard
          integration={integrations.wispro}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
        <SmartOltCard
          organization={organization}
          integration={integrations.smartolt}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
      </CardContent>
    </Card>
  );
};
