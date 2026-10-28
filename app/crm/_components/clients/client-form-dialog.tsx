"use client";

import { FormEvent, useId, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Radio,
  Search,
  Server,
  Smartphone,
  Wifi,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { CreateClientInput, WisproSearchResult } from "../../_lib/types";
import type { SmartOltOnuDetail } from "@/lib/smartolt";
import { generateClientAppPassword } from "@/lib/client-auth-utils";
import { wisproService } from "../../_lib/wispro-service";
import { formatClientDebt } from "../../_lib/client-profile-utils";
import { mapWisproToClientFields } from "../../_lib/wispro-client-fields";
import { LoadingState } from "../shared/loading-state";
import { StatusBadge } from "../shared/status-badge";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateClient: (input: CreateClientInput) => Promise<void>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: string }).message);
  }
  return fallback;
};

export const ClientFormDialog = ({
  open,
  onOpenChange,
  onCreateClient,
}: ClientFormDialogProps) => {
  // Estado del flujo: 'wispro' o 'smartolt'
  const [modalStep, setModalStep] = useState<"wispro" | "smartolt">("wispro");

  // Estados del paso Wispro
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WisproSearchResult[]>([]);
  const [selected, setSelected] = useState<WisproSearchResult | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [appEnabled, setAppEnabled] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Estados del paso Smart OLT
  const [onuSn, setOnuSn] = useState("");
  const [isSearchingOnu, setIsSearchingOnu] = useState(false);
  const [onuSearchError, setOnuSearchError] = useState<string | null>(null);
  const [foundOnu, setFoundOnu] = useState<SmartOltOnuDetail | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const appSwitchId = useId();
  const selectedFields = selected
    ? mapWisproToClientFields(selected.customer, selected.invoicing)
    : null;
  const previewPhone = selectedFields?.phone || manualPhone.trim();
  const generatedPassword = selectedFields
    ? generateClientAppPassword(selectedFields.cedula, selectedFields.name)
    : "";

  const handleResetForm = () => {
    setModalStep("wispro");
    setQuery("");
    setResults([]);
    setSelected(null);
    setManualPhone("");
    setAppEnabled(true);
    setSearchError(null);
    setHasCopied(false);
    setOnuSn("");
    setIsSearchingOnu(false);
    setOnuSearchError(null);
    setFoundOnu(null);
  };

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleResetForm();
    }
    onOpenChange(isOpen);
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) {
      setSearchError("Ingresa la cédula, RIF o el nombre");
      return;
    }

    const digits = normalized.replace(/\D/g, "");
    const isDocument =
      /^\d+$/.test(normalized.replace(/[\s.-]/g, "")) && digits.length >= 5;

    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(null);

    try {
      const searchResults = isDocument
        ? await wisproService.search({ cedula: digits })
        : await wisproService.search({ name: normalized });
      setResults(searchResults);
      if (!searchResults.length) {
        setSearchError("No se encontró ningún cliente con esa búsqueda.");
      }
    } catch (error) {
      setSearchError(getErrorMessage(error, "Error al consultar Wispro"));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (result: WisproSearchResult) => {
    setSelected(result);
    setManualPhone("");
    setSearchError(null);
  };

  const handleCopyCredentials = async () => {
    if (!selectedFields || !generatedPassword) {
      toast.error("Selecciona un cliente de Wispro para generar las credenciales");
      return;
    }

    const textToCopy = [
      "Acceso a la App Móvil",
      `Usuario: ${selectedFields.cedula}`,
      `Contraseña: ${generatedPassword}`,
      previewPhone ? `Teléfono: ${previewPhone}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(textToCopy);
      setHasCopied(true);
      toast.success("Credenciales copiadas al portapapeles");
      setTimeout(() => setHasCopied(false), 2500);
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  /**
   * Avanza desde Wispro hacia Smart OLT.
   * Si el cliente en Wispro no cuenta con SN, cierra el paso de Wispro y abre el modal de Smart OLT.
   */
  const handleProceedToSmartOlt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !selectedFields) {
      toast.error("Busca y selecciona un cliente de Wispro");
      return;
    }

    if (!previewPhone) {
      toast.error("Wispro no trajo teléfono. Ingresa el número móvil");
      return;
    }

    // Verificar si el cliente de Wispro ya cuenta con SN
    const customerSn =
      ((selected.customer as Record<string, unknown>).sn as string)?.trim() ||
      "";

    if (customerSn) {
      setOnuSn(customerSn.toUpperCase());
      setModalStep("smartolt");
      void executeSearchOnu(customerSn);
      return;
    }

    // Si no cuenta con SN, pasamos al modal de búsqueda en Smart OLT
    setModalStep("smartolt");
  };

  const executeSearchOnu = async (snToSearch: string) => {
    const cleanSn = snToSearch.trim().toUpperCase();
    if (!cleanSn) {
      setOnuSearchError("Ingresa el número de serie (SN) de la ONU");
      return;
    }

    setIsSearchingOnu(true);
    setOnuSearchError(null);
    setFoundOnu(null);

    try {
      const res = await fetch(
        `/api/crm/smartolt/search?sn=${encodeURIComponent(cleanSn)}`,
      );
      const data = await res.json();

      if (!res.ok || !data.success || !data.onu) {
        setOnuSearchError(
          data.message || `No se encontró la ONU con SN ${cleanSn} en SmartOLT`,
        );
        return;
      }

      setFoundOnu(data.onu as SmartOltOnuDetail);
      toast.success("ONU encontrada en Smart OLT", {
        description: `Board ${data.onu.board}, Port ${data.onu.port} (${data.onu.status})`,
      });
    } catch (err) {
      setOnuSearchError(
        err instanceof Error ? err.message : "Error al consultar Smart OLT",
      );
    } finally {
      setIsSearchingOnu(false);
    }
  };

  const handleSearchOnuSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await executeSearchOnu(onuSn);
  };

  /**
   * Finaliza el registro creando el cliente en Wispro y vinculando los datos de Smart OLT en client_onus.
   */
  const handleFinalSubmit = async (includeOnu: boolean) => {
    if (!selected || !selectedFields) return;

    try {
      setIsSubmitting(true);

      const parsedSignal =
        foundOnu && includeOnu && foundOnu.signal
          ? Number.parseFloat(foundOnu.signal)
          : null;

      await onCreateClient({
        wispro_id: selected.customer.id,
        app_enabled: appEnabled,
        phone: selectedFields.phone ? undefined : manualPhone.trim(),
        onu:
          includeOnu && foundOnu
            ? {
                unique_external_id: foundOnu.unique_external_id,
                sn: foundOnu.sn.trim().toUpperCase(),
                board: foundOnu.board,
                port: foundOnu.port,
                rx_signal: Number.isNaN(parsedSignal) ? null : parsedSignal,
                status: foundOnu.status,
              }
            : null,
      });

      toast.success("Cliente registrado con éxito", {
        description:
          includeOnu && foundOnu
            ? `Vinculado a Smart OLT (Board ${foundOnu.board}, Port ${foundOnu.port})`
            : "Ficha creada en CRM",
      });

      handleResetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al registrar el cliente",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className={`${CRM_DIALOG} w-full sm:max-w-xl md:max-w-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6`}>
        {/* ================= PASO 1: BÚSQUEDA Y FICHA DE WISPRO ================= */}
        {modalStep === "wispro" ? (
          <form onSubmit={selected ? handleProceedToSmartOlt : handleSearch}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="size-5 text-blue-500" aria-hidden="true" />
                Nuevo cliente · Búsqueda Wispro
              </DialogTitle>
              <DialogDescription className={CRM_SURFACES.textMuted}>
                La ficha inicial se toma de Wispro. Busca por cédula, RIF o nombre y
                confirma los datos.
              </DialogDescription>
            </DialogHeader>

            {!selected ? (
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client-wispro-search">Cédula, RIF o nombre</Label>
                  <div className="flex gap-2">
                    <Input
                      id="client-wispro-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ej. 28123456 o Carlos Pérez"
                      autoComplete="off"
                      disabled={isSearching}
                      className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                    />
                    <CrmButton
                      type="submit"
                      disabled={isSearching}
                      aria-label="Buscar en Wispro">
                      <Search className="size-4" aria-hidden="true" />
                      Buscar
                    </CrmButton>
                  </div>
                </div>

                {isSearching ? <LoadingState label="Consultando Wispro..." /> : null}

                {searchError ? (
                  <p className="text-sm text-red-600 dark:text-red-300" role="alert">
                    {searchError}
                  </p>
                ) : null}

                {results.length ? (
                  <ul className="space-y-2" aria-label="Resultados de Wispro">
                    {results.map((result) => (
                      <li key={result.customer.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectResult(result)}
                          className={`w-full rounded-2xl border p-3 text-left transition-colors ${CRM_SURFACES.border} ${CRM_SURFACES.card} ${CRM_SURFACES.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent`}>
                          <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                            {result.customer.name}
                          </p>
                          <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
                            Doc.: {result.customer.national_identification_number}
                            {result.customer.zone_name
                              ? ` · ${result.customer.zone_name}`
                              : null}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {selected && selectedFields ? (
              <div className="mt-5 space-y-4">
                <div className={`rounded-2xl border p-4 ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                        {selectedFields.name}
                      </p>
                      <p className={`mt-1 font-mono text-xs ${CRM_SURFACES.textMuted}`}>
                        V-{selectedFields.cedula}
                      </p>
                    </div>
                    <StatusBadge status={selectedFields.account} />
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Plan / PPP</dt>
                      <dd className={`text-sm ${CRM_SURFACES.textSecondary}`}>
                        {selectedFields.plan}
                      </dd>
                    </div>
                    <div>
                      <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Zona Wispro</dt>
                      <dd className={`text-sm ${CRM_SURFACES.textSecondary}`}>
                        {selectedFields.zone}
                      </dd>
                    </div>
                    <div>
                      <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Teléfono Wispro</dt>
                      <dd className={`font-mono text-sm ${CRM_SURFACES.textSecondary}`}>
                        {selectedFields.phone || "No registrado"}
                      </dd>
                    </div>
                    <div>
                      <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Deuda</dt>
                      <dd className={`text-sm ${CRM_SURFACES.textSecondary}`}>
                        {selected.invoicing.hasDebt
                          ? formatClientDebt(selected.invoicing.debt)
                          : "Sin deuda"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {!selectedFields.phone ? (
                  <div className="space-y-2">
                    <Label htmlFor="client-phone">Teléfono móvil</Label>
                    <Input
                      id="client-phone"
                      value={manualPhone}
                      onChange={(event) => setManualPhone(event.target.value)}
                      placeholder="Ej. 0412 1234567"
                      required
                      className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      Wispro no trajo teléfono. Es obligatorio para la app.
                    </span>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor={appSwitchId} className="cursor-pointer font-medium">
                        Permitir acceso a la App Móvil
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        El cliente entra con su cédula e iniciales autogeneradas.
                      </p>
                    </div>
                    <Switch
                      id={appSwitchId}
                      checked={appEnabled}
                      onCheckedChange={setAppEnabled}
                    />
                  </div>

                  {appEnabled ? (
                    <div className="mt-3.5 border-t border-border/50 pt-3">
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-2">
                          <KeyRound
                            className="mt-0.5 size-4 shrink-0 text-emerald-500"
                            aria-hidden="true"
                          />
                          <div>
                            <span className="block text-xs font-semibold text-foreground">
                              Contraseña autogenerada:
                            </span>
                            {generatedPassword ? (
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                                  {generatedPassword}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {generatedPassword ? (
                          <button
                            type="button"
                            onClick={() => void handleCopyCredentials()}
                            className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-blue-600 transition-colors hover:underline dark:text-blue-400">
                            {hasCopied ? (
                              <>
                                <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="size-3.5" aria-hidden="true" />
                                <span>Copiar credenciales</span>
                              </>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <DialogFooter className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {selected ? (
                <CrmButton
                  type="button"
                  variant="secondary"
                  onClick={() => setSelected(null)}
                  disabled={isSubmitting}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Cambiar cliente
                </CrmButton>
              ) : (
                <CrmButton
                  type="button"
                  variant="secondary"
                  onClick={() => handleDialogChange(false)}
                  disabled={isSearching}>
                  Cancelar
                </CrmButton>
              )}
              {selected ? (
                <CrmButton type="submit" disabled={isSubmitting}>
                  Continuar a Smart OLT
                </CrmButton>
              ) : null}
            </DialogFooter>
          </form>
        ) : (
          /* ================= PASO 2: BÚSQUEDA Y VINCULACIÓN EN SMART OLT ================= */
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wifi className="size-5 text-emerald-500" aria-hidden="true" />
                Vincular equipo Smart OLT (ONU)
              </DialogTitle>
              <DialogDescription className={CRM_SURFACES.textMuted}>
                Consulta el estado de red de la ONU en Smart OLT usando su Número de Serie (SN).
              </DialogDescription>
            </DialogHeader>

            {/* Banner resumen del cliente */}
            {selectedFields ? (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Cliente Wispro:</span>
                  <p className="font-semibold text-foreground text-sm">
                    {selectedFields.name}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground block text-[11px]">Cédula:</span>
                  <p className="font-mono font-medium text-foreground">
                    V-{selectedFields.cedula}
                  </p>
                </div>
              </div>
            ) : null}

            <form onSubmit={handleSearchOnuSubmit} className="space-y-2">
              <Label htmlFor="smartolt-sn-input" className="text-xs font-medium">
                Número de Serie (SN) de la ONU
              </Label>
              <div className="flex gap-2">
                <Input
                  id="smartolt-sn-input"
                  value={onuSn}
                  onChange={(event) => setOnuSn(event.target.value.toUpperCase())}
                  placeholder="Ej. HWTC12345678"
                  autoComplete="off"
                  disabled={isSearchingOnu || isSubmitting}
                  className={`font-mono uppercase ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                />
                <CrmButton
                  type="submit"
                  disabled={isSearchingOnu || isSubmitting}
                  aria-label="Buscar en Smart OLT"
                  className="shrink-0">
                  <Search className="size-4 mr-1" aria-hidden="true" />
                  Buscar
                </CrmButton>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Se consultará el endpoint <code>get_onus_details_by_sn</code> de Smart OLT.
              </p>

              {isSearchingOnu ? <LoadingState label="Consultando Smart OLT..." /> : null}

              {onuSearchError ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
                  {onuSearchError}
                </div>
              ) : null}
            </form>

            {/* Ficha de la ONU encontrada en Smart OLT */}
            {foundOnu ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-mono text-sm font-bold text-foreground">
                      SN: {foundOnu.sn}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      foundOnu.status?.toLowerCase() === "online"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    }>
                    {foundOnu.status || "Desconocido"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="rounded border bg-background/60 p-2">
                    <span className="block text-[11px] text-muted-foreground">Board</span>
                    <strong className="text-sm font-semibold text-foreground">
                      {foundOnu.board}
                    </strong>
                  </div>
                  <div className="rounded border bg-background/60 p-2">
                    <span className="block text-[11px] text-muted-foreground">Port PON</span>
                    <strong className="text-sm font-semibold text-foreground">
                      {foundOnu.port}
                    </strong>
                  </div>
                  <div className="rounded border bg-background/60 p-2">
                    <span className="block text-[11px] text-muted-foreground">Potencia RX</span>
                    <strong className="text-sm font-semibold text-foreground">
                      {foundOnu.signal ? `${foundOnu.signal} dBm` : "N/D"}
                    </strong>
                  </div>
                  <div className="rounded border bg-background/60 p-2">
                    <span className="block text-[11px] text-muted-foreground">OLT ID</span>
                    <strong className="text-sm font-semibold text-foreground">
                      {foundOnu.olt_id || "1"}
                    </strong>
                  </div>
                </div>

                {foundOnu.name || foundOnu.zone ? (
                  <p className="text-xs text-muted-foreground pt-0.5">
                    Registrado en Smart OLT: <strong>{foundOnu.name}</strong>
                    {foundOnu.zone ? ` (${foundOnu.zone})` : null}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Footer con botones adaptables y sin desbordes */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-border/40 pt-4">
              <CrmButton
                type="button"
                variant="secondary"
                onClick={() => setModalStep("wispro")}
                disabled={isSubmitting}
                className="w-full sm:w-auto">
                <ArrowLeft className="size-4 mr-1" aria-hidden="true" />
                Volver a Wispro
              </CrmButton>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <CrmButton
                  type="button"
                  variant="ghost"
                  onClick={() => handleFinalSubmit(false)}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto text-muted-foreground hover:text-foreground">
                  Omitir Smart OLT
                </CrmButton>

                <CrmButton
                  type="button"
                  variant={foundOnu ? "success" : "secondary"}
                  onClick={() => handleFinalSubmit(Boolean(foundOnu))}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto">
                  {isSubmitting ? (
                    "Guardando..."
                  ) : foundOnu ? (
                    <>
                      <CheckCircle2 className="size-4 mr-1.5" />
                      Registrar con esta ONU
                    </>
                  ) : (
                    "Registrar sin ONU"
                  )}
                </CrmButton>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
