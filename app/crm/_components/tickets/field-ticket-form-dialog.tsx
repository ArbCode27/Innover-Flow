"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import {
  FIELD_TICKET_KIND_LABELS,
  FIELD_TICKET_PRIORITY_LABELS,
  datetimeLocalToIso,
  parseMapsUrlCoords,
  toDatetimeLocalValue,
  type FieldTicket,
  type FieldTicketKind,
  type FieldTicketPriority,
  type Technician,
} from "@/lib/field-tickets";
import type { CreatePayload } from "../../_hooks/use-field-tickets";
import type { Client, Conversation, Message } from "../../_lib/types";

const UNASSIGNED = "__none__";

const formSchema = z
  .object({
    title: z.string().trim().min(1, "El título es obligatorio").max(80),
    kind: z.enum(["technical", "installation", "resignation", "feasibility"]),
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      kind: "technical",
      priority: "medium",
      status: "open",
      employeeId: UNASSIGNED,
      description: "",
      cause: "",
      addressText: "",
      mapsUrl: "",
      windowStart: "",
      windowEnd: "",
      facadeMediaUrl: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && ticket) {
      form.reset({
        title: ticket.title,
        kind: ticket.kind,
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
      kind: "technical",
      priority: "medium",
      status: "open",
      employeeId: UNASSIGNED,
      description: chatContext.description || "",
      cause: "",
      addressText: chatContext.addressText || "",
      mapsUrl: chatContext.mapsUrl || "",
      windowStart: "",
      windowEnd: "",
      facadeMediaUrl: chatContext.facadeMediaUrl || "",
    });
  }, [open, mode, ticket, chatContext, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    const coords = parseMapsUrlCoords(values.mapsUrl);
    const employeeId =
      values.employeeId === UNASSIGNED ? null : values.employeeId;
    const payload = {
      title: values.title,
      kind: values.kind as FieldTicketKind,
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

  const handleFacadeFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const url = await onUploadFacade(file);
    form.setValue("facadeMediaUrl", url);
  };

  const facadeUrl = form.watch("facadeMediaUrl");

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
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={`w-full ${CRM_SURFACES.input}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FIELD_TICKET_KIND_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
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
              <Label htmlFor="field-ticket-facade">Foto de fachada</Label>
              <Input
                id="field-ticket-facade"
                className={CRM_SURFACES.input}
                placeholder="URL o sube / pega una imagen"
                {...form.register("facadeMediaUrl")}
                onPaste={(event) => {
                  const file = event.clipboardData.files?.[0];
                  if (!file || !file.type.startsWith("image/")) return;
                  event.preventDefault();
                  void handleFacadeFile(event.clipboardData.files);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  aria-label="Subir foto de fachada"
                  className={CRM_SURFACES.input}
                  onChange={(event) => void handleFacadeFile(event.target.files)}
                />
                {chatImages.length ? (
                  <div className="flex flex-wrap gap-2">
                    {chatImages.slice(-4).map((image) => (
                      <button
                        key={image.id}
                        type="button"
                        className="overflow-hidden rounded-lg border border-white/40"
                        onClick={() => form.setValue("facadeMediaUrl", image.media_url || "")}
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
              {facadeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={facadeUrl} alt="Fachada" className="mt-2 max-h-40 rounded-xl object-cover" />
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
