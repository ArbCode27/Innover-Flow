"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Link2,
  Network,
  Receipt,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Organization,
  OrganizationIntegration,
  OrganizationRole,
} from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";

type Provider = "wispro" | "smartolt" | "sae";

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
 * Tarjeta de integración de SAE Plus (Abonados, contratos y reportes de pago).
 */
const SaeCard = ({
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
  const [apiConnect, setApiConnect] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    String(integration.config.base_url || "https://apiservice.saeplus.com"),
  );
  const [defaultMode, setDefaultMode] = useState<"reportes" | "conciliados">(
    integration.config.default_mode === "conciliados" ? "conciliados" : "reportes",
  );
  const [bankVenezuelaCuba, setBankVenezuelaCuba] = useState(
    String(
      (integration.config.bank_cuba_map as Record<string, string> | undefined)
        ?.Venezuela || "",
    ),
  );
  const [bankBanplusCuba, setBankBanplusCuba] = useState(
    String(
      (integration.config.bank_cuba_map as Record<string, string> | undefined)
        ?.Banplus || "",
    ),
  );
  const [bankBancamigaCuba, setBankBancamigaCuba] = useState(
    String(
      (integration.config.bank_cuba_map as Record<string, string> | undefined)
        ?.Bancamiga || "",
    ),
  );
  const [testContractId, setTestContractId] = useState(
    String(integration.config.test_contract_id || ""),
  );

  useEffect(() => {
    setBaseUrl(
      String(integration.config.base_url || "https://apiservice.saeplus.com"),
    );
    setDefaultMode(
      integration.config.default_mode === "conciliados"
        ? "conciliados"
        : "reportes",
    );
    const cubaMap =
      (integration.config.bank_cuba_map as
        | Record<string, string>
        | undefined) || {};
    setBankVenezuelaCuba(cubaMap.Venezuela || "");
    setBankBanplusCuba(cubaMap.Banplus || "");
    setBankBancamigaCuba(cubaMap.Bancamiga || "");
    setTestContractId(String(integration.config.test_contract_id || ""));
  }, [integration.config]);

  const isConnected = integration.status === "connected";

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const bankCubaMap: Record<string, string> = {};
      if (bankVenezuelaCuba.trim())
        bankCubaMap.Venezuela = bankVenezuelaCuba.trim();
      if (bankBanplusCuba.trim()) bankCubaMap.Banplus = bankBanplusCuba.trim();
      if (bankBancamigaCuba.trim())
        bankCubaMap.Bancamiga = bankBancamigaCuba.trim();

      const response = await fetch("/api/crm/integrations/sae", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiToken,
          apiConnect,
          baseUrl,
          defaultMode,
          bankCubaMap,
          testContractId: testContractId.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar");
      }
      onChanged(payload.integration);
      setApiToken("");
      setApiConnect("");
      setIsOpen(false);
      toast.success("SAE Plus conectado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/crm/integrations/sae", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La conexión falló");
      }
      onChanged(payload.integration);
      toast.success("Conexión con SAE Plus verificada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La conexión falló");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/crm/integrations/sae", {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration("sae"));
    toast.success("SAE Plus desconectado");
  };

  return (
    <Card className="col-span-1 rounded-2xl border border-black/5 bg-transparent dark:border-white/10 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
              <Receipt className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold">SAE Plus</CardTitle>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Gestión de abonados, consulta de contratos, saldo en tiempo real y reporte de pagos.
              </p>
            </div>
          </div>

          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? <CheckCircle2 className="mr-1 size-3" /> : null}
            {statusLabel[integration.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected ? (
          <div className={`space-y-1 text-xs ${CRM_SURFACES.textMuted}`}>
            <p>
              URL API:{" "}
              <span className="font-mono text-foreground">
                {String(integration.config.base_url || "")}
              </span>
            </p>
            <p>
              Modalidad de pago:{" "}
              <span className="font-semibold text-foreground">
                {integration.config.default_mode === "conciliados"
                  ? "Conciliado directo (/v1/pagos/conciliados)"
                  : "Reporte pendiente (/v1/pagos/reportes)"}
              </span>
            </p>
            {integration.config.test_contract_id ? (
              <p>
                Contrato de prueba:{" "}
                <span className="font-mono text-foreground">
                  {String(integration.config.test_contract_id)}
                </span>
              </p>
            ) : null}
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
                {isConnected ? "Reconfigurar" : "Conectar SAE Plus"}
              </CrmButton>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Conectar SAE Plus</DialogTitle>
                <DialogDescription>
                  Ingresa las credenciales API de SAEplus Connect asignadas a tu empresa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="sae-base-url">URL de la API</Label>
                  <Input
                    id="sae-base-url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://apiservice.saeplus.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sae-token">Api-Token</Label>
                  <Input
                    id="sae-token"
                    type="password"
                    autoComplete="new-password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    placeholder="Token API asignado a la empresa..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sae-connect">Api-Connect (ID Empresa)</Label>
                  <Input
                    id="sae-connect"
                    value={apiConnect}
                    onChange={(event) => setApiConnect(event.target.value)}
                    placeholder="Identificador de la empresa en SAE..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sae-mode">
                    Modalidad de reporte de pagos por defecto
                  </Label>
                  <Select
                    value={defaultMode}
                    onValueChange={(val) =>
                      setDefaultMode(val as "reportes" | "conciliados")
                    }>
                    <SelectTrigger id="sae-mode">
                      <SelectValue placeholder="Selecciona la modalidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reportes">
                        Reportar Pago (/v1/pagos/reportes - REGISTRADA)
                      </SelectItem>
                      <SelectItem value="conciliados">
                        Reportar Conciliado (/v1/pagos/conciliados - PROCESADO)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                    {defaultMode === "reportes"
                      ? "La operación queda en estatus REGISTRADA y pasa por conciliación bancaria en SAE."
                      : "La operación se asienta directamente como PROCESADO en el estado de cuenta del abonado."}
                  </p>
                </div>
                <div className="space-y-2 rounded-lg border border-black/5 p-3 dark:border-white/10">
                  <Label className="text-xs font-semibold">
                    Mapeo de Cuentas CUBA (id_cuba)
                  </Label>
                  <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                    Asocia el id_cuba de SAE a cada banco receptor para insertar el pago en la cuenta correcta.
                  </p>
                  <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="cuba-venezuela" className="text-[11px]">
                        Banco Venezuela
                      </Label>
                      <Input
                        id="cuba-venezuela"
                        placeholder="id_cuba BDV"
                        value={bankVenezuelaCuba}
                        onChange={(e) => setBankVenezuelaCuba(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cuba-banplus" className="text-[11px]">
                        Banplus
                      </Label>
                      <Input
                        id="cuba-banplus"
                        placeholder="id_cuba Banplus"
                        value={bankBanplusCuba}
                        onChange={(e) => setBankBanplusCuba(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cuba-bancamiga" className="text-[11px]">
                        Bancamiga
                      </Label>
                      <Input
                        id="cuba-bancamiga"
                        placeholder="id_cuba Bancamiga"
                        value={bankBancamigaCuba}
                        onChange={(e) => setBankBancamigaCuba(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sae-test-contract">
                    Contrato de prueba (Opcional)
                  </Label>
                  <Input
                    id="sae-test-contract"
                    value={testContractId}
                    onChange={(event) => setTestContractId(event.target.value)}
                    placeholder="Número o ID de contrato para pruebas autorizadas"
                  />
                  <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                    Al estar sobre el entorno productivo de SAE, usa contratos autorizados para ensayos.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <CrmButton
                  onClick={() => void handleSave()}
                  disabled={isSaving || !apiToken || !apiConnect || !baseUrl}>
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
                <RefreshCw
                  className={`size-4 ${isTesting ? "animate-spin" : ""}`}
                />
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
                    <AlertDialogTitle>¿Desconectar SAE Plus?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El CRM dejará de consultar abonados y saldos en tiempo real con estas credenciales.
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
    sae: emptyIntegration("sae"),
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
    void loadIntegration("sae");
  }, [loadIntegration]);

  const handleChanged = (integration: OrganizationIntegration) => {
    if (
      integration.provider !== "wispro" &&
      integration.provider !== "smartolt" &&
      integration.provider !== "sae"
    )
      return;
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
        <SaeCard
          integration={integrations.sae}
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
