"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CRM_DIALOG, CRM_FOCUS_RING, CRM_SURFACES } from "../../_lib/crm-theme";
import {
  FIELD_TICKET_PRIORITY_LABELS,
  datetimeLocalToIso,
  defaultVisitWindowLocal,
  parseMapsUrlCoords,
  toDatetimeLocalValue,
  type FieldTicket,
  type FieldTicketPriority,
  type Technician,
} from "@/lib/field-tickets";
import type { TicketCategory } from "@/lib/ticket-categories";
import type { CreatePayload } from "../../_hooks/use-field-tickets";
import type { Client, Conversation, Message } from "../../_lib/types";

const UNASSIGNED = "__none__";
const FACADE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_FACADE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FACADE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const validateFacadeImage = (file: File) => {
  if (!ALLOWED_FACADE_MIME.has((file.type || "").toLowerCase())) {
    return "Formato no soportado. Usa JPG, PNG o WebP.";
  }
  if (file.size > MAX_FACADE_BYTES) {
    return "La imagen supera el límite de 5 MB.";
  }
  if (file.size <= 0) {
    return "La imagen no es válida.";
  }
  return null;
};

const formSchema = z
  .object({
    title: z.string().trim().min(1, "El título es obligatorio").max(80),
    categoryId: z.string().min(1, "Selecciona una categoría"),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    status: z.enum(["open", "scheduled", "done", "cancelled"]).optional(),
    employeeId: z.string(),
    description: z.string().max(8000).optional(),
    cause: z.string().max(240).optional(),
    addressText: z.string().max(500).optional(),
    mapsUrl: z.string().max(2000).optional(),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
    facadeMediaUrl: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    const startIso = datetimeLocalToIso(value.windowStart);
    const endIso = datetimeLocalToIso(value.windowEnd);
    if (startIso && endIso && Date.parse(endIso) < Date.parse(startIso)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windowEnd"],
        message: "El fin debe ser posterior o igual al inicio",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export type FieldTicketFormDefaults = {
  conversationId?: number | null;
  crmClientId?: number | null;
  clientName?: string | null;
  clientPhone?: string | null;
  title?: string;
  description?: string;
  addressText?: string;
  mapsUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
  facadeMediaUrl?: string;
  facadeMessageId?: string | null;
};

interface FieldTicketFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  technicians: Technician[];
  categories?: TicketCategory[];
  ticket?: FieldTicket | null;
  conversation?: Conversation | null;
  client?: Client | null;
  messages?: Message[];
  onOpenChange: (open: boolean) => void;
  onUploadFacade: (file: File) => Promise<string>;
  onSubmitCreate: (payload: CreatePayload) => Promise<void>;
  onSubmitUpdate: (id: string, payload: Record<string, unknown>) => Promise<void>;
}

const extractContext = (
  messages: Message[] | undefined,
  client: Client | null | undefined,
  conversation: Conversation | null | undefined,
): FieldTicketFormDefaults => {
  const location = [...(messages || [])]
    .reverse()
    .find((message) => message.media_type === "location" || message.latitude);
  const image = [...(messages || [])]
    .reverse()
    .find((message) => message.media_type === "image" && message.media_url);
  const mapsUrl =
    location?.latitude != null && location?.longitude != null
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : "";
  return {
    conversationId: conversation?.id ?? null,
    crmClientId: conversation?.client_id ?? client?.id ?? null,
    clientName: client?.name || client?.wa_name || null,
    clientPhone: conversation?.customer_phone || client?.phone || null,
    addressText: location?.location_address || location?.location_name || "",
    mapsUrl,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    facadeMediaUrl: image?.media_url || "",
    facadeMessageId: image?.wa_message_id || (image?.id ? String(image.id) : null),
  };
};

export const FieldTicketFormDialog = ({
  open,
  mode,
  technicians,
  categories: categoriesProp = [],
  ticket,
  conversation,
  client,
  messages,
  onOpenChange,
  onUploadFacade,
  onSubmitCreate,
  onSubmitUpdate,
}: FieldTicketFormDialogProps) => {
  const chatContext = useMemo(
    () => extractContext(messages, client, conversation),
    [messages, client, conversation],
  );
  const chatImages = useMemo(
    () =>
      (messages || []).filter(
        (message) => message.media_type === "image" && message.media_url,
      ),
    [messages],
  );

  const [categories, setCategories] = useState<TicketCategory[]>(categoriesProp);

  useEffect(() => {
    setCategories(categoriesProp);
  }, [categoriesProp]);

  useEffect(() => {
    if (!open || categoriesProp.length) return;
    let cancelled = false;
    void fetch("/api/crm/ticket-categories")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: TicketCategory[] };
        if (!cancelled) setCategories(payload.data || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, categoriesProp.length]);

  const defaultCategoryId =
    ticket?.categoryId ||
    categories.find((item) => item.slug === ticket?.kind)?.id ||
    categories[0]?.id ||
    "";

  const facadeInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFacade, setIsUploadingFacade] = useState(false);
  const [isDraggingFacade, setIsDraggingFacade] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      categoryId: "",
      priority: "medium",
      status: "open",
      employeeId: UNASSIGNED,
      description: "",
      cause: "",
      addressText: "",
      mapsUrl: "",
      ...defaultVisitWindowLocal(),
      facadeMediaUrl: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && ticket) {
      form.reset({
        title: ticket.title,
        categoryId:
          ticket.categoryId ||
          categories.find((item) => item.slug === ticket.kind)?.id ||
          "",
        priority: ticket.priority,
        status: ticket.status,
        employeeId: ticket.employeeId || UNASSIGNED,
        description: ticket.description || "",
        cause: ticket.cause || "",
        addressText: ticket.addressText || "",
        mapsUrl: ticket.mapsUrl || "",
        windowStart: toDatetimeLocalValue(ticket.windowStart),
        windowEnd: toDatetimeLocalValue(ticket.windowEnd),
        facadeMediaUrl: ticket.facadeMediaUrl || "",
      });
      return;
    }
    form.reset({
      title: chatContext.title || "",
      categoryId: categories[0]?.id || "",
      priority: "medium",
      status: "open",
      employeeId: UNASSIGNED,
      description: chatContext.description || "",
      cause: "",
      addressText: chatContext.addressText || "",
      mapsUrl: chatContext.mapsUrl || "",
      ...defaultVisitWindowLocal(),
      facadeMediaUrl: chatContext.facadeMediaUrl || "",
    });
  }, [open, mode, ticket, chatContext, form, categories]);

  const handleSubmit = form.handleSubmit(async (values) => {
    const coords = parseMapsUrlCoords(values.mapsUrl);
    const employeeId =
      values.employeeId === UNASSIGNED ? null : values.employeeId;
    const payload = {
      title: values.title,
      categoryId: values.categoryId,
      kind: categories.find((item) => item.id === values.categoryId)?.kind,
      priority: values.priority as FieldTicketPriority,
      employeeId,
      description: values.description?.trim() || null,
      cause: values.cause?.trim() || null,
      addressText: values.addressText?.trim() || null,
      mapsUrl: values.mapsUrl?.trim() || null,
      latitude: coords?.latitude ?? chatContext.latitude ?? null,
      longitude: coords?.longitude ?? chatContext.longitude ?? null,
      windowStart: datetimeLocalToIso(values.windowStart),
      windowEnd: datetimeLocalToIso(values.windowEnd),
      facadeMediaUrl: values.facadeMediaUrl?.trim() || null,
      facadeMessageId: chatContext.facadeMessageId || null,
    };

    if (mode === "edit" && ticket) {
      await onSubmitUpdate(ticket.id, {
        ...payload,
        status: values.status,
      });
    } else {
      await onSubmitCreate({
        ...payload,
        conversationId: chatContext.conversationId,
        crmClientId: chatContext.crmClientId,
        clientName: chatContext.clientName,
        clientPhone: chatContext.clientPhone,
      });
    }
    onOpenChange(false);
  });

  const handleFacadeFile = useCallback(
    async (file: File | undefined) => {
      if (!file || isUploadingFacade) return;
      const validationError = validateFacadeImage(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      setIsUploadingFacade(true);
      try {
        const url = await onUploadFacade(file);
        form.setValue("facadeMediaUrl", url, { shouldDirty: true });
      } catch (uploadError) {
        toast.error(
          uploadError instanceof Error
            ? uploadError.message
            : "No se pudo subir la imagen",
        );
      } finally {
        setIsUploadingFacade(false);
        if (facadeInputRef.current) facadeInputRef.current.value = "";
      }
    },
    [form, isUploadingFacade, onUploadFacade],
  );

  useEffect(() => {
    if (!open) return;
    const handlePaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      event.preventDefault();
      void handleFacadeFile(file);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleFacadeFile, open]);

  const facadeUrl = form.watch("facadeMediaUrl");
  const handleClearFacade = () => {
    form.setValue("facadeMediaUrl", "", { shouldDirty: true });
  };
  const handleOpenFacadePicker = () => {
    if (isUploadingFacade) return;
    facadeInputRef.current?.click();
  };
  const handleFacadeDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!isUploadingFacade) setIsDraggingFacade(true);
  };
  const handleFacadeDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDraggingFacade(false);
  };
  const handleFacadeDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingFacade(false);
    void handleFacadeFile(event.dataTransfer.files?.[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${CRM_DIALOG} max-h-[90vh] overflow-y-auto sm:max-w-2xl`}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Editar ticket" : "Crear ticket"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="field-ticket-title">Título / motivo</Label>
              <Input
                id="field-ticket-title"
                className={CRM_SURFACES.input}
                {...form.register("title")}
              />
              {form.formState.errors.title ? (
                <p className="text-xs text-rose-600">{form.formState.errors.title.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value || defaultCategoryId}
                    onValueChange={field.onChange}>
                    <SelectTrigger className={`w-full ${CRM_SURFACES.input}`}>
                      <SelectValue placeholder="Selecciona una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.categoryId ? (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.categoryId.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={`w-full ${CRM_SURFACES.input}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FIELD_TICKET_PRIORITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {mode === "edit" ? (
              <div className="space-y-2">
                <Label>Estado</Label>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={`w-full ${CRM_SURFACES.input}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Abierto</SelectItem>
                        <SelectItem value="scheduled">Agendado</SelectItem>
                        <SelectItem value="done">Cerrado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Técnico</Label>
              <Controller
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={`w-full ${CRM_SURFACES.input}`}>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
                      {technicians.map((technician) => (
                        <SelectItem key={technician.id} value={technician.id}>
                          {technician.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="field-ticket-start">Ventana inicio</Label>
                <Input
                  id="field-ticket-start"
                  type="datetime-local"
                  className={CRM_SURFACES.input}
                  {...form.register("windowStart")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="field-ticket-end">Ventana fin</Label>
                <Input
                  id="field-ticket-end"
                  type="datetime-local"
                  className={CRM_SURFACES.input}
                  {...form.register("windowEnd")}
                />
                {form.formState.errors.windowEnd ? (
                  <p className="text-xs text-rose-600">
                    {form.formState.errors.windowEnd.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="field-ticket-address">Dirección</Label>
              <Input
                id="field-ticket-address"
                className={CRM_SURFACES.input}
                {...form.register("addressText")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="field-ticket-maps">URL de Maps</Label>
              <Input
                id="field-ticket-maps"
                className={CRM_SURFACES.input}
                placeholder="https://maps.google.com/..."
                {...form.register("mapsUrl")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="field-ticket-description">Descripción</Label>
              <Textarea
                id="field-ticket-description"
                className={`min-h-24 ${CRM_SURFACES.input}`}
                {...form.register("description")}
              />
            </div>
            {mode === "edit" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="field-ticket-cause">Causa</Label>
                <Input
                  id="field-ticket-cause"
                  className={CRM_SURFACES.input}
                  {...form.register("cause")}
                />
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label
                htmlFor="field-ticket-facade"
                className={`font-normal ${CRM_SURFACES.textMuted}`}>
                Foto de fachada. Puedes reemplazarla o quitarla si el ticket no la tiene.
              </Label>
              <input
                ref={facadeInputRef}
                id="field-ticket-facade"
                type="file"
                accept={FACADE_ACCEPT}
                className="sr-only"
                aria-label="Subir foto de fachada"
                onChange={(event) => void handleFacadeFile(event.target.files?.[0])}
              />
              <div className="relative">
                <button
                  type="button"
                  disabled={isUploadingFacade}
                  aria-label="Subir o pegar foto de fachada"
                  onClick={handleOpenFacadePicker}
                  onDragOver={handleFacadeDragOver}
                  onDragLeave={handleFacadeDragLeave}
                  onDrop={handleFacadeDrop}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-dashed px-4 py-8 text-center transition-colors",
                    "border-slate-300/80 bg-white/20 text-slate-500",
                    "dark:border-white/20 dark:bg-transparent dark:text-slate-400",
                    "hover:border-slate-400 hover:bg-white/40 dark:hover:border-white/35 dark:hover:bg-white/[.04]",
                    CRM_FOCUS_RING,
                    isDraggingFacade &&
                      "border-crm-accent bg-crm-accent/10 dark:border-crm-accent",
                    isUploadingFacade && "cursor-wait opacity-80",
                  )}>
                  {facadeUrl && !isUploadingFacade ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={facadeUrl}
                      alt="Foto de fachada"
                      className="max-h-40 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <>
                      {isUploadingFacade ? (
                        <Spinner className="size-7 text-slate-400" />
                      ) : (
                        <ImageIcon className="size-7 text-slate-400" aria-hidden="true" />
                      )}
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {isUploadingFacade ? "Subiendo foto…" : "Subir o pegar foto"}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        JPG, PNG o WebP · máx. 5 MB · Ctrl+V
                      </span>
                    </>
                  )}
                </button>
                {facadeUrl && !isUploadingFacade ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Quitar foto de fachada"
                    className="absolute top-2.5 right-2.5 size-7 rounded-full"
                    onClick={handleClearFacade}>
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              {chatImages.length ? (
                <div className="flex flex-wrap gap-2">
                  {chatImages.slice(-4).map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      className="overflow-hidden rounded-lg border border-white/40"
                      onClick={() =>
                        form.setValue("facadeMediaUrl", image.media_url || "", {
                          shouldDirty: true,
                        })
                      }
                      aria-label="Usar imagen del chat como fachada">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.media_url || ""}
                        alt=""
                        className="size-12 object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Guardando..."
                : mode === "edit"
                  ? "Guardar"
                  : "Crear ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
