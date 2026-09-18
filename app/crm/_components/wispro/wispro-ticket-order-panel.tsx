"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Hammer,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Ticket,
  User,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CrmButton } from "../shared/crm-button";
import { CRM_SURFACES, CRM_PANEL } from "../../_lib/crm-theme";
import {
  parseReporte,
  suggestCategory,
  type ParseReporteResult,
} from "@/lib/parseReporte";
import type {
  WisproCategory,
  WisproClient,
  WisproContract,
  WisproEmployee,
} from "@/lib/wispro";
import type { ResultadoCaso } from "@/app/api/casos/route";

interface WisproTicketOrderPanelProps {
  initialReportText?: string;
  initialClientSearch?: string;
  initialWisproClientId?: string;
  initialWisproContractId?: string;
  crmClientId?: number;
  agentName?: string;
  onSuccess?: (result: ResultadoCaso) => void;
  onClose?: () => void;
}

export const WisproTicketOrderPanel = ({
  initialReportText = "",
  initialClientSearch = "",
  initialWisproClientId,
  initialWisproContractId,
  crmClientId,
  agentName = "Agente de Soporte",
  onSuccess,
  onClose,
}: WisproTicketOrderPanelProps) => {
  // ---------------------------------------------------------------------------
  // Catálogos
  // ---------------------------------------------------------------------------
  const [categories, setCategories] = useState<WisproCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [employees, setEmployees] = useState<WisproEmployee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [showAllEmployees, setShowAllEmployees] = useState(false);
  const [isFilteredEmployees, setIsFilteredEmployees] = useState(false);

  // ---------------------------------------------------------------------------
  // Columna Izquierda: Reporte IA
  // ---------------------------------------------------------------------------
  const [reportText, setReportText] = useState(initialReportText);
  const [parsedData, setParsedData] = useState<ParseReporteResult | null>(null);
  const [hasManuallyEditedTitle, setHasManuallyEditedTitle] = useState(false);
  const [hasManuallyEditedDesc, setHasManuallyEditedDesc] = useState(false);
  const [hasManuallyEditedCategory, setHasManuallyEditedCategory] = useState(false);

  // ---------------------------------------------------------------------------
  // Columna Derecha: Formulario
  // ---------------------------------------------------------------------------
  // Búsqueda de cliente y contratos
  const [clientSearchQuery, setClientSearchQuery] = useState(initialClientSearch);
  const [clientSearchResults, setClientSearchResults] = useState<WisproClient[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState<WisproClient | null>(null);

  const [clientContracts, setClientContracts] = useState<WisproContract[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState(initialWisproContractId || "");

  // Ticket
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isCategorySuggested, setIsCategorySuggested] = useState(false);
  const [assignableId, setAssignableId] = useState("");

  // Orden
  const [generateOrder, setGenerateOrder] = useState(true);
  const [orderKind, setOrderKind] = useState<"technical" | "installation" | "resignation" | "feasibility">("technical");
  const [orderDescription, setOrderDescription] = useState("");

  // Fechas por defecto: Mañana de 08:00 a 10:00 hora local
  const defaultDates = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    return {
      start: `${yyyy}-${mm}-${dd}T08:00`,
      end: `${yyyy}-${mm}-${dd}T10:00`,
    };
  }, []);

  const [startAt, setStartAt] = useState(defaultDates.start);
  const [endAt, setEndAt] = useState(defaultDates.end);
  const [technicianId, setTechnicianId] = useState("");

  // GPS / Dirección
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Modales y Estados de Envío
  // ---------------------------------------------------------------------------
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ResultadoCaso | null>(null);
  const [copiedPublicId, setCopiedPublicId] = useState(false);

  // ---------------------------------------------------------------------------
  // Carga inicial de catálogos
  // ---------------------------------------------------------------------------
  const loadCategories = async (refresh = false) => {
    setIsLoadingCategories(true);
    setCategoriesError(null);
    try {
      const res = await fetch(`/api/wispro/categories${refresh ? "?refresh=true" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudieron cargar las categorías");
      setCategories(json.data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar categorías";
      setCategoriesError(msg);
      toast.error(msg);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const loadEmployees = async (refresh = false, showAll = false) => {
    setIsLoadingEmployees(true);
    setEmployeesError(null);
    try {
      const query = new URLSearchParams();
      if (refresh) query.set("refresh", "true");
      if (showAll) query.set("all", "true");
      const res = await fetch(`/api/wispro/employees?${query.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudieron cargar los empleados");
      setEmployees(json.data || []);
      setIsFilteredEmployees(Boolean(json.isFiltered));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar empleados";
      setEmployeesError(msg);
      toast.error(msg);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  useEffect(() => {
    void loadCategories();
    void loadEmployees(false, showAllEmployees);
  }, []);

  useEffect(() => {
    void loadEmployees(false, showAllEmployees);
  }, [showAllEmployees]);

  // Si se recibió reporte técnico inicial, parsearlo automáticamente
  useEffect(() => {
    if (initialReportText && !parsedData) {
      handleExtractData();
    }
  }, [initialReportText, categories]);

  // Si se recibió UUID de cliente inicial, cargarlo directo
  useEffect(() => {
    if (initialWisproClientId) {
      loadContractsForClient(initialWisproClientId);
    }
  }, [initialWisproClientId]);

  // ---------------------------------------------------------------------------
  // Debounced search para clientes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!clientSearchQuery || clientSearchQuery.trim().length < 3) {
      setClientSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingClients(true);
      try {
        const res = await fetch(`/api/wispro/clients?search=${encodeURIComponent(clientSearchQuery.trim())}`);
        const json = await res.json();
        if (res.ok) {
          setClientSearchResults(json.data || []);
        }
      } catch (err) {
        console.warn("[WISPRO_CLIENT_SEARCH_WARN]", err);
      } finally {
        setIsSearchingClients(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [clientSearchQuery]);

  const loadContractsForClient = async (clientId: string) => {
    setIsLoadingContracts(true);
    try {
      const res = await fetch(`/api/wispro/contracts?client_id=${encodeURIComponent(clientId)}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setClientContracts(json.data);
        if (json.data.length === 1) {
          setSelectedContractId(json.data[0].id);
          applyContractDetails(json.data[0]);
        }
      }
    } catch (err) {
      console.warn("[WISPRO_CONTRACTS_WARN]", err);
    } finally {
      setIsLoadingContracts(false);
    }
  };

  const handleSelectClient = (client: WisproClient) => {
    setSelectedClient(client);
    setClientSearchResults([]);
    setSelectedContractId("");
    void loadContractsForClient(client.id);
  };

  const applyContractDetails = (contract: WisproContract) => {
    if (contract.address) {
      setAddressStreet(contract.address);
    }
    if (contract.lat && contract.long) {
      setLatitude(Number(contract.lat));
      setLongitude(Number(contract.long));
    }
  };

  const handleSelectContract = (contractId: string) => {
    setSelectedContractId(contractId);
    const contract = clientContracts.find((c) => c.id === contractId);
    if (contract) {
      applyContractDetails(contract);
    }
  };

  // ---------------------------------------------------------------------------
  // Extracción de Datos con el Parser
  // ---------------------------------------------------------------------------
  const handleExtractData = () => {
    if (!reportText.trim()) {
      toast.warning("Pega primero el reporte técnico en el cuadro de texto");
      return;
    }

    const result = parseReporte(reportText);
    setParsedData(result);

    // No sobrescribir campos que el operador ya editó a mano
    if (!hasManuallyEditedTitle) {
      setTitle(result.title);
    }
    if (!hasManuallyEditedDesc) {
      setDescription(result.formattedDescription);
    }

    // Precargar descripción de orden con posible causa + zona si existen
    const posibleCausa = result.fields.posible_causa || "";
    const zonaOpt = result.fields.zona_opt || "";
    if (posibleCausa || zonaOpt) {
      const parts = [];
      if (posibleCausa) parts.push(`Posible causa: ${posibleCausa}`);
      if (zonaOpt) parts.push(`Zona/OPT: ${zonaOpt}`);
      setOrderDescription(parts.join("\n"));
    }

    // Sugerencia de categoría
    if (!hasManuallyEditedCategory && categories.length > 0) {
      const match = suggestCategory(result.fields.motivo || "", result.fields.posible_causa || "", categories);
      if (match) {
        setCategoryId(match.id);
        setIsCategorySuggested(true);
      }
    }

    toast.success("Datos extraídos del reporte", {
      description: `Se detectaron ${result.orderedFields.length} campos técnicos`,
    });
  };

  // ---------------------------------------------------------------------------
  // Categorías agrupadas por nivel (High primero, Low después)
  // ---------------------------------------------------------------------------
  const { highCategories, lowCategories, otherCategories } = useMemo(() => {
    const high: WisproCategory[] = [];
    const low: WisproCategory[] = [];
    const other: WisproCategory[] = [];

    for (const cat of categories) {
      const lvl = String(cat.level).toLowerCase();
      if (lvl === "high") high.push(cat);
      else if (lvl === "low") low.push(cat);
      else other.push(cat);
    }

    return {
      highCategories: high,
      lowCategories: low,
      otherCategories: other,
    };
  }, [categories]);

  // ---------------------------------------------------------------------------
  // Validación y Envío
  // ---------------------------------------------------------------------------
  const isFormValid = useMemo(() => {
    if (categoriesError) return false;
    if (!title.trim() || title.length > 80) return false;
    if (!description.trim()) return false;
    if (!categoryId) return false;
    return true;
  }, [title, description, categoryId, categoriesError]);

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      toast.error("Por favor completa los campos obligatorios del ticket");
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleExecuteCaso = async (isRetry = false) => {
    setIsSubmitting(true);
    setIsConfirmModalOpen(false);

    try {
      // Si es un reintento, recuperar IDs del estado anterior
      const existingTicketId = isRetry && executionResult?.ticket.ok ? executionResult.ticket.id : undefined;
      const existingTicketPublicId = isRetry && executionResult?.ticket.ok ? executionResult.ticket.publicId : undefined;
      const existingOrderId = isRetry && executionResult?.orden.ok ? executionResult.orden.id : undefined;

      const payload: Record<string, unknown> = {
        existing_ticket_id: existingTicketId,
        existing_ticket_public_id: existingTicketPublicId,
        existing_order_id: existingOrderId,
        ticket: {
          title: title.trim(),
          description: description.trim(),
          category_id: categoryId,
          category_name: categories.find((c) => c.id === categoryId)?.name,
          client_id: selectedClient?.id || initialWisproClientId || undefined,
          contract_id: selectedContractId || initialWisproContractId || undefined,
          assignable_id: assignableId || undefined,
          crm_client_id: crmClientId,
          agent_name: agentName,
        },
        generate_order: generateOrder,
      };

      if (generateOrder) {
        payload.order = {
          kind: orderKind,
          description: orderDescription.trim() || description.trim(),
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          ...(latitude && longitude
            ? {
                gps_point_attributes: {
                  street: addressStreet || undefined,
                  city: addressCity || undefined,
                  country_code: "VE",
                  latitude,
                  longitude,
                },
              }
            : {}),
        };

        if (technicianId) {
          payload.technician = {
            employee_id: technicianId,
            employee_name: employees.find((e) => e.id === technicianId)?.name,
            start_at: new Date(startAt).toISOString(),
            end_at: new Date(endAt).toISOString(),
          };
        }
      }

      const res = await fetch("/api/casos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result: ResultadoCaso = await res.json();
      setExecutionResult(result);

      // Persistir en sessionStorage para sobrevivir recargas accidentales
      if (result.ticket.ok) {
        const storageKey = `wispro_case_${result.ticket.publicId}`;
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            ticket: result.ticket,
            orden: result.orden,
            tecnico: result.tecnico,
            timestamp: Date.now(),
          }),
        );
      }

      if (result.ticket.ok && (result.orden.ok === true || result.orden.ok === null)) {
        toast.success(`Ticket #${result.ticket.publicId} creado exitosamente en Wispro`);
        if (onSuccess) onSuccess(result);
      } else {
        toast.warning("El proceso se ejecutó con advertencias o fallos parciales");
      }
    } catch (err) {
      console.error("[EXECUTE_CASO_ERROR]", err);
      toast.error(err instanceof Error ? err.message : "Error al procesar el caso en Wispro");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyPublicId = () => {
    if (executionResult?.ticket.ok) {
      void navigator.clipboard.writeText(String(executionResult.ticket.publicId));
      setCopiedPublicId(true);
      toast.success("Número de ticket copiado al portapapeles");
      setTimeout(() => setCopiedPublicId(false), 2000);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Barra superior de estado y cabecera */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5 dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-crm-accent/15 text-crm-accent">
            <Hammer className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">
              Crear Ticket y Orden de Trabajo (Wispro)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Convierte el reporte técnico del bot IA en un caso oficial y agenda de visita
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClose ? (
            <CrmButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Cerrar
            </CrmButton>
          ) : null}
        </div>
      </div>

      {/* Alerta de bloqueo si los catálogos fallaron */}
      {categoriesError ? (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              <strong>Error al conectar con Wispro:</strong> {categoriesError}
            </span>
            <CrmButton size="sm" variant="danger" onClick={() => void loadCategories(true)}>
              Reintentar conexión
            </CrmButton>
          </div>
        </div>
      ) : null}

      {/* Vista de Resultado y Éxito si ya se procesó */}
      {executionResult ? (
        <div className="shrink-0 border-b border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Número de Ticket para el Cliente:
                </span>
                <div className="mt-1 flex items-center gap-3">
                  <span className="font-mono text-3xl font-extrabold text-crm-accent">
                    {executionResult.ticket.ok ? `#${executionResult.ticket.publicId}` : "Fallido"}
                  </span>
                  {executionResult.ticket.ok ? (
                    <button
                      type="button"
                      onClick={handleCopyPublicId}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                      {copiedPublicId ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                      {copiedPublicId ? "Copiado" : "Copiar para WhatsApp"}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Botón de reintento granular si algo falló */}
              {(!executionResult.orden.ok && executionResult.orden.ok !== null) ||
              (!executionResult.tecnico.ok && executionResult.tecnico.ok !== null) ? (
                <CrmButton
                  type="button"
                  variant="primary"
                  onClick={() => void handleExecuteCaso(true)}
                  disabled={isSubmitting}>
                  <RefreshCw className={`mr-2 size-4 ${isSubmitting ? "animate-spin" : ""}`} />
                  Reintentar sólo pasos fallidos
                </CrmButton>
              ) : null}
            </div>

            {/* Tres filas de estado */}
            <div className="grid gap-2 sm:grid-cols-3">
              {/* Paso 1: Ticket */}
              <div
                className={`flex items-center justify-between rounded-xl border p-3 ${
                  executionResult.ticket.ok
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                    : "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400"
                }`}>
                <div className="flex items-center gap-2">
                  {executionResult.ticket.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-red-500" />
                  )}
                  <span className="text-xs font-semibold">1. Ticket Wispro</span>
                </div>
                <span className="font-mono text-[11px]">
                  {executionResult.ticket.ok ? `#${executionResult.ticket.publicId}` : "Error"}
                </span>
              </div>

              {/* Paso 2: Orden */}
              <div
                className={`flex items-center justify-between rounded-xl border p-3 ${
                  executionResult.orden.ok === null
                    ? "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400"
                    : executionResult.orden.ok
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400"
                }`}>
                <div className="flex items-center gap-2">
                  {executionResult.orden.ok === null ? (
                    <Clock className="size-4 shrink-0 text-slate-400" />
                  ) : executionResult.orden.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-red-500" />
                  )}
                  <span className="text-xs font-semibold">2. Orden técnica</span>
                </div>
                <span className="text-[11px]">
                  {executionResult.orden.ok === null
                    ? "No solicitada"
                    : executionResult.orden.ok
                      ? "Creada"
                      : "Falló"}
                </span>
              </div>

              {/* Paso 3: Técnico */}
              <div
                className={`flex items-center justify-between rounded-xl border p-3 ${
                  executionResult.tecnico.ok === null
                    ? "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400"
                    : executionResult.tecnico.ok
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400"
                }`}>
                <div className="flex items-center gap-2">
                  {executionResult.tecnico.ok === null ? (
                    <Clock className="size-4 shrink-0 text-slate-400" />
                  ) : executionResult.tecnico.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-red-500" />
                  )}
                  <span className="text-xs font-semibold">3. Asignación técnico</span>
                </div>
                <span className="text-[11px]">
                  {executionResult.tecnico.ok === null
                    ? "Sin asignar"
                    : executionResult.tecnico.ok
                      ? "Agendado"
                      : "Falló"}
                </span>
              </div>
            </div>

            {/* Mensaje de error detallado si hubo fallo parcial */}
            {!executionResult.ticket.ok && (
              <p className="rounded-lg bg-red-500/10 p-2.5 font-mono text-xs text-red-600 dark:text-red-400">
                Ticket: {executionResult.ticket.error}
              </p>
            )}
            {executionResult.orden.ok === false && (
              <p className="rounded-lg bg-red-500/10 p-2.5 font-mono text-xs text-red-600 dark:text-red-400">
                Orden: {executionResult.orden.error}
              </p>
            )}
            {executionResult.tecnico.ok === false && (
              <p className="rounded-lg bg-red-500/10 p-2.5 font-mono text-xs text-red-600 dark:text-red-400">
                Técnico: {executionResult.tecnico.error}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Contenido principal en 2 columnas responsive */}
      <div className="grid flex-1 overflow-hidden md:grid-cols-2">
        {/* =================================================================== */}
        {/* COLUMNA IZQUIERDA: RESUMEN DEL AGENTE IA */}
        {/* =================================================================== */}
        <div className="flex flex-col border-b border-slate-200 bg-white p-5 overflow-y-auto dark:border-white/10 dark:bg-slate-900/50 md:border-b-0 md:border-r">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-purple-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Resumen del agente IA
              </h2>
            </div>
            <span className="text-[11px] text-slate-500">Formato con viñetas</span>
          </div>

          <div className="flex-1 space-y-3">
            <Textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Pega aquí el reporte técnico generado por el bot IA al cerrar la conversación...&#10;&#10;Ejemplo:&#10;• Motivo: Sin conexión WiFi&#10;• Dispositivos afectados: 2&#10;• Zona/OPT: OLT MUME PON 5&#10;• Posible causa: Falla en enlace"
              className="min-h-[220px] font-mono text-xs leading-relaxed dark:bg-slate-950/60"
            />

            <CrmButton
              type="button"
              variant="violet"
              className="w-full"
              onClick={handleExtractData}>
              <Sparkles className="mr-2 size-4" />
              Extraer datos y precargar formulario
            </CrmButton>

            {/* Chips de solo lectura de los campos detectados */}
            {parsedData && parsedData.orderedFields.length > 0 ? (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Campos detectados ({parsedData.orderedFields.length})
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Autodetectado
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {parsedData.orderedFields.map((field) => (
                    <div
                      key={field.normalizedKey}
                      className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[11px] text-purple-700 dark:text-purple-300"
                      title={`${field.rawKey}: ${field.value}`}>
                      <span className="font-semibold">{field.rawKey}:</span>
                      <span className="max-w-[140px] truncate text-slate-600 dark:text-slate-400">
                        {field.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* =================================================================== */}
        {/* COLUMNA DERECHA: FORMULARIO */}
        {/* =================================================================== */}
        <div className="flex flex-col bg-slate-50/50 p-5 overflow-y-auto dark:bg-slate-950/40">
          <form onSubmit={handleOpenConfirm} className="space-y-6">
            {/* SECCIÓN 1: CLIENTE Y CONTRATO */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-crm-accent" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Cliente y contrato
                  </h3>
                </div>
                {selectedClient ? (
                  <span className="font-mono text-[10px] text-slate-400">
                    UUID: {selectedClient.id}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <Input
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    placeholder="Buscar cliente en Wispro por nombre, cédula o teléfono..."
                    className="pl-9 text-xs"
                  />
                  {isSearchingClients && (
                    <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-slate-400" />
                  )}
                </div>

                {/* Dropdown de resultados de búsqueda */}
                {clientSearchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
                    {clientSearchResults.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className="flex w-full flex-col items-start rounded-lg p-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-white/5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {client.name || "Sin nombre"}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          CI/RIF: {client.national_identification_number || "—"} · Tel: {client.phone || client.phone_mobile || "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Cliente seleccionado */}
                {selectedClient && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                    <p className="font-semibold">{selectedClient.name}</p>
                    <p className="mt-0.5 text-[10px] opacity-80">
                      ID Wispro: <span className="font-mono">{selectedClient.id}</span>
                    </p>
                  </div>
                )}

                {/* Selector de Contrato */}
                {clientContracts.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Contrato asignado</Label>
                    <Select
                      value={selectedContractId}
                      onValueChange={handleSelectContract}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Selecciona un contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientContracts.map((contract) => (
                          <SelectItem key={contract.id} value={contract.id} className="text-xs">
                            {contract.plan_name || "Plan estándar"} - {contract.address || "Sin dirección"} (
                            <span className="font-mono text-[10px]">{contract.id.slice(0, 8)}...</span>)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* SECCIÓN 2: TICKET */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ticket className="size-4 text-crm-accent" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Ticket de mesa de ayuda
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">Obligatorio</span>
              </div>

              <div className="space-y-3.5">
                {/* Título */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Título del ticket (Motivo) *</Label>
                    <span
                      className={`text-[10px] ${
                        title.length > 80 ? "font-bold text-red-500" : "text-slate-400"
                      }`}>
                      {title.length}/80
                    </span>
                  </div>
                  <Input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setHasManuallyEditedTitle(true);
                    }}
                    placeholder="Ej. Sin conexión WiFi desde hace 2 días"
                    maxLength={80}
                    className={`text-xs ${!title.trim() ? "border-red-500/60 focus-visible:ring-red-500" : ""}`}
                    required
                  />
                  {!title.trim() && (
                    <p className="text-[11px] text-red-500">
                      El título es obligatorio (motivo de la solicitud)
                    </p>
                  )}
                </div>

                {/* Categoría */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Categoría de soporte *</Label>
                    {isCategorySuggested && (
                      <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                        <Sparkles className="size-3" /> Sugerida automáticamente
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={categoryId}
                      onValueChange={(val) => {
                        setCategoryId(val);
                        setIsCategorySuggested(false);
                        setHasManuallyEditedCategory(true);
                      }}
                      disabled={isLoadingCategories || Boolean(categoriesError)}>
                      <SelectTrigger className="flex-1 text-xs">
                        <SelectValue placeholder="Selecciona una categoría..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {highCategories.length > 0 && (
                          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Principales (High)
                          </div>
                        )}
                        {highCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id} className="text-xs font-medium">
                            {cat.name}
                          </SelectItem>
                        ))}

                        {lowCategories.length > 0 && (
                          <div className="mt-1 border-t px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Secundarias (Low)
                          </div>
                        )}
                        {lowCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id} className="pl-6 text-xs text-slate-600 dark:text-slate-300">
                            ↳ {cat.name}
                          </SelectItem>
                        ))}

                        {otherCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id} className="text-xs">
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <CrmButton
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-9 shrink-0"
                      title="Refrescar categorías"
                      onClick={() => void loadCategories(true)}>
                      <RefreshCw className={`size-3.5 ${isLoadingCategories ? "animate-spin" : ""}`} />
                    </CrmButton>
                  </div>
                </div>

                {/* Descripción */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Descripción técnica completa *</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setHasManuallyEditedDesc(true);
                    }}
                    rows={4}
                    placeholder="Reporte detallado en texto plano..."
                    className="text-xs leading-relaxed"
                    required
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 3: ORDEN DE TRABAJO */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="size-4 text-amber-500" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Orden de trabajo en campo
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Genera visita técnica domiciliaria vinculada al ticket
                    </p>
                  </div>
                </div>
                <Switch
                  checked={generateOrder}
                  onCheckedChange={setGenerateOrder}
                  aria-label="Generar orden de trabajo"
                />
              </div>

              {generateOrder && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-white/5">
                  {/* Tipo de orden */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo de visita (kind)</Label>
                      <Select
                        value={orderKind}
                        onValueChange={(val: "technical" | "installation" | "resignation" | "feasibility") =>
                          setOrderKind(val)
                        }>
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technical">Visita técnica por falla</SelectItem>
                          <SelectItem value="installation">Instalación nueva</SelectItem>
                          <SelectItem value="resignation">Baja de servicio</SelectItem>
                          <SelectItem value="feasibility">Estudio de factibilidad</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>

                  {/* Técnico */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Asignar técnico</Label>
                      <button
                        type="button"
                        onClick={() => setShowAllEmployees(!showAllEmployees)}
                        className="text-[10px] text-crm-accent hover:underline">
                        {showAllEmployees ? "Ver sólo lista blanca" : "Ver todos"}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select value={technicianId} onValueChange={setTechnicianId}>
                        <SelectTrigger className="flex-1 text-xs">
                          <SelectValue placeholder="Sin asignar (Pendiente)" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          <SelectItem value="none">Sin asignar (crear en pendiente)</SelectItem>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id} className="text-xs">
                              {emp.name} {emp.phone_mobile ? `(${emp.phone_mobile})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <CrmButton
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="size-9 shrink-0"
                        title="Refrescar empleados"
                        onClick={() => void loadEmployees(true, showAllEmployees)}>
                        <RefreshCw className={`size-3.5 ${isLoadingEmployees ? "animate-spin" : ""}`} />
                      </CrmButton>
                    </div>
                  </div>
                </div>

                {/* Fechas de agendamiento */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Inicio agendado</Label>
                    <Input
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fin estimado</Label>
                    <Input
                      type="datetime-local"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Descripción específica para campo */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Instrucciones para la orden de campo</Label>
                  <Textarea
                    value={orderDescription}
                    onChange={(e) => setOrderDescription(e.target.value)}
                    rows={2}
                    placeholder="Instrucciones para el técnico..."
                    className="text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* BOTÓN DE ACCIÓN FINAL */}
          <div className="sticky bottom-0 mt-6 border-t border-slate-200 bg-slate-50/90 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-950/90">
            <CrmButton
              type="submit"
              variant="primary"
              className="w-full shadow-lg"
              disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Procesando con Wispro...
                </>
              ) : (
                <>
                  <Hammer className="mr-2 size-4" />
                  Crear ticket {generateOrder ? "y orden de trabajo" : ""}
                </>
              )}
            </CrmButton>
          </div>
        </form>
      </div>
    </div>

    {/* ===================================================================== */}
    {/* MODAL DE CONFIRMACIÓN PREVIO A DISPARAR LA CREACIÓN */}
    {/* ===================================================================== */}
    <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-5 text-crm-accent" />
            Confirmación de creación en Wispro
          </DialogTitle>
          <DialogDescription className="text-xs">
            Verifica los detalles antes de enviar. Nada se creará hasta que confirmes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          <div>
            <span className="font-semibold text-slate-900 dark:text-white">Título del Ticket:</span>
            <p className="mt-0.5">{title}</p>
          </div>

          <div>
            <span className="font-semibold text-slate-900 dark:text-white">Categoría:</span>
            <p className="mt-0.5">{categories.find((c) => c.id === categoryId)?.name || categoryId}</p>
          </div>

          <div>
            <span className="font-semibold text-slate-900 dark:text-white">Cliente:</span>
            <p className="mt-0.5">{selectedClient?.name || initialWisproClientId || "Sin cliente vinculado"}</p>
          </div>

          {selectedContractId && (
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">Contrato UUID:</span>
              <p className="mt-0.5 font-mono text-[11px]">{selectedContractId}</p>
            </div>
          )}

          {generateOrder ? (
            <div className="border-t border-slate-200 pt-2 dark:border-white/10">
              <span className="font-semibold text-amber-600 dark:text-amber-400">Orden de trabajo:</span>
              <p className="mt-0.5">
                Tipo: <span className="capitalize">{orderKind}</span> · Ventana: {startAt.replace("T", " ")} a {endAt.replace("T", " ")}
              </p>
              <p className="mt-0.5">
                Técnico: {employees.find((e) => e.id === technicianId)?.name || "Sin asignar (Pendiente)"}
              </p>
            </div>
          ) : (
            <div className="border-t border-slate-200 pt-2 dark:border-white/10 text-slate-400">
              No se generará orden de trabajo técnica.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <CrmButton
            type="button"
            variant="secondary"
            onClick={() => setIsConfirmModalOpen(false)}>
            Volver a editar
          </CrmButton>
          <CrmButton
            type="button"
            variant="primary"
            onClick={() => void handleExecuteCaso(false)}
            disabled={isSubmitting}>
            {isSubmitting ? "Enviando a Wispro..." : "Confirmar y Crear"}
          </CrmButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
  );
};
