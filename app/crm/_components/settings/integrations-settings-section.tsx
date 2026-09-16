"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Link2, MessageCircle, RefreshCw, Server, Unplug } from "lucide-react";
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
import type {
  OrganizationIntegration,
  OrganizationRole,
} from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";

type Provider = "wispro" | "whatsapp";

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

const IntegrationCard = ({
  provider,
  integration,
  canEdit,
  onChanged,
}: {
  provider: Provider;
  integration: OrganizationIntegration;
  canEdit: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
}) => {
  const isWispro = provider === "wispro";
  const Icon = isWispro ? Server : MessageCircle;
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    String(
      integration.config.base_url || "https://www.cloud.wispro.co/api/v1",
    ),
  );
  const [wabaId, setWabaId] = useState(String(integration.config.waba_id || ""));
  const [phoneNumberId, setPhoneNumberId] = useState(
    String(integration.config.phone_number_id || ""),
  );

  useEffect(() => {
    setBaseUrl(
      String(
        integration.config.base_url || "https://www.cloud.wispro.co/api/v1",
      ),
    );
    setWabaId(String(integration.config.waba_id || ""));
    setPhoneNumberId(String(integration.config.phone_number_id || ""));
  }, [integration.config]);

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/crm/integrations/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isWispro
            ? { apiToken, baseUrl }
            : { accessToken: apiToken, wabaId, phoneNumberId },
        ),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar");
      }
      onChanged(payload.integration);
      setApiToken("");
      setIsOpen(false);
      toast.success(`${isWispro ? "Wispro" : "WhatsApp"} conectado`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch(`/api/crm/integrations/${provider}`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La conexión falló");
      }
      onChanged(payload.integration);
      toast.success("Conexión verificada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La conexión falló");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch(`/api/crm/integrations/${provider}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration(provider));
    toast.success("Integración desconectada");
  };

  return (
    <Card className="rounded-2xl border border-black/5 bg-transparent dark:border-white/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <Badge variant={integration.status === "connected" ? "default" : "secondary"}>
            {integration.status === "connected" ? (
              <CheckCircle2 className="mr-1 size-3" />
            ) : null}
            {statusLabel[integration.status]}
          </Badge>
        </div>
        <CardTitle className="pt-2 text-base">
          {isWispro ? "Wispro" : "WhatsApp Business"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`min-h-10 text-sm ${CRM_SURFACES.textMuted}`}>
          {isWispro
            ? "Consulta clientes, facturación y promesas de pago con credenciales propias."
            : "Conecta el número de Meta que recibirá y enviará conversaciones."}
        </p>
        {integration.status === "connected" ? (
          <div className={`mt-3 space-y-1 text-xs ${CRM_SURFACES.textMuted}`}>
            <p>
              {isWispro
                ? String(integration.config.base_url || "API configurada")
                : String(
                    integration.config.display_phone_number ||
                      integration.config.verified_name ||
                      "Número verificado",
                  )}
            </p>
            <p>
              Verificada:{" "}
              {integration.last_verified_at
                ? new Date(integration.last_verified_at).toLocaleString("es-VE")
                : "pendiente"}
            </p>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canEdit} size="sm">
                <Link2 className="size-4" />
                {integration.status === "connected" ? "Reconfigurar" : "Conectar"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  Conectar {isWispro ? "Wispro" : "WhatsApp Business"}
                </DialogTitle>
                <DialogDescription>
                  Las credenciales se cifran en el servidor y nunca vuelven a mostrarse.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {isWispro ? (
                  <div className="space-y-2">
                    <Label htmlFor="wispro-base-url">URL de la API</Label>
                    <Input
                      id="wispro-base-url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp-waba-id">WhatsApp Business Account ID</Label>
                      <Input
                        id="whatsapp-waba-id"
                        value={wabaId}
                        onChange={(event) => setWabaId(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp-phone-id">Phone Number ID</Label>
                      <Input
                        id="whatsapp-phone-id"
                        value={phoneNumberId}
                        onChange={(event) => setPhoneNumberId(event.target.value)}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor={`${provider}-token`}>
                    {isWispro ? "API Key" : "Token de acceso de Meta"}
                  </Label>
                  <Input
                    id={`${provider}-token`}
                    type="password"
                    autoComplete="new-password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => void handleSave()}
                  disabled={
                    isSaving ||
                    !apiToken ||
                    (isWispro ? !baseUrl : !wabaId || !phoneNumberId)
                  }>
                  {isSaving ? "Validando…" : "Validar y conectar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {integration.status === "connected" ? (
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
                    <AlertDialogTitle>¿Desconectar la integración?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El CRM dejará de utilizar estas credenciales inmediatamente.
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
        <CardTitle className="text-base">Integraciones</CardTitle>
        <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
          Credenciales independientes para esta organización.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <IntegrationCard
          provider="wispro"
          integration={integrations.wispro}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
        <IntegrationCard
          provider="whatsapp"
          integration={integrations.whatsapp}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
      </CardContent>
    </Card>
  );
};
