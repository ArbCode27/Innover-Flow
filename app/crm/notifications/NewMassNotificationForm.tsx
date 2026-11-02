"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Radio,
  Server,
  Plus,
  Trash2,
  Layers,
  Send,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardPortTarget } from "@/app/crm/_lib/types";
import { CRM_SURFACES } from "@/app/crm/_lib/crm-theme";

/* ---------- Opciones de Estado de Cliente ---------- */
export type ClientStatusFilter =
  | "all"
  | "los"
  | "online"
  | "power_fail"
  | "offline"
  | "altered_power";

export interface NotificationGroupItem {
  id: string;
  board: number;
  port: number;
  status: ClientStatusFilter;
}

export const CLIENT_STATUS_OPTIONS: {
  value: ClientStatusFilter;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "all",
    label: "Todos los estados",
    badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  },
  {
    value: "los",
    label: "LOS / Caídos (Sin señal)",
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
  {
    value: "online",
    label: "En línea (Online)",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    value: "power_fail",
    label: "Falla de energía (Power fail)",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    value: "offline",
    label: "Desconectado (Offline)",
    badgeClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  },
  {
    value: "altered_power",
    label: "Potencia alterada (≤ -29 dBm)",
    badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
];

/* ---------- Esquema de validación para Título y Mensaje ---------- */
const formSchema = z.object({
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres"),
  body: z.string().trim().min(5, "El cuerpo del mensaje debe tener al menos 5 caracteres"),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  targetOptions?: BoardPortTarget[];
  organizationId?: string;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultBoard?: number;
  defaultPort?: number;
  trigger?: React.ReactNode;
}

export const NewMassNotificationForm = ({
  targetOptions = [],
  organizationId,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultBoard,
  defaultPort,
  trigger,
}: Props) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  // Lista dinámica de grupos configurados
  const [groups, setGroups] = useState<NotificationGroupItem[]>([
    {
      id: "group-init",
      board: defaultBoard ?? targetOptions[0]?.board ?? 1,
      port: defaultPort ?? targetOptions[0]?.port ?? 1,
      status: "all",
    },
  ]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      body: "",
    },
  });

  // Sincronizar board/port si cambian los defaults al abrir para un puerto específico
  useEffect(() => {
    if (defaultBoard !== undefined && defaultPort !== undefined) {
      setGroups([
        {
          id: `group-preset-${Date.now()}`,
          board: defaultBoard,
          port: defaultPort,
          status: "all",
        },
      ]);
    }
  }, [defaultBoard, defaultPort]);

  const handleAddGroup = () => {
    const nextGroupNum = groups.length + 1;
    setGroups((prev) => [
      ...prev,
      {
        id: `group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        board: 1,
        port: nextGroupNum,
        status: "all",
      },
    ]);
  };

  const handleRemoveGroup = (idToRemove: string) => {
    if (groups.length <= 1) {
      toast.warning("Debe mantener al menos un grupo de destinatarios.");
      return;
    }
    setGroups((prev) => prev.filter((g) => g.id !== idToRemove));
  };

  const handleUpdateGroup = (
    id: string,
    field: "board" | "port" | "status",
    value: number | ClientStatusFilter,
  ) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)),
    );
  };

  const handleSelectQuickTarget = (tgt: BoardPortTarget) => {
    const exists = groups.some(
      (g) => g.board === tgt.board && g.port === tgt.port,
    );
    if (exists) {
      toast.info(`El puerto B${tgt.board}:P${tgt.port} ya está en la lista de grupos.`);
      return;
    }

    // Si solo hay un grupo con valores por defecto o 1:1 sin modificar, lo actualizamos
    if (groups.length === 1 && groups[0].board === 1 && groups[0].port === 1) {
      setGroups([
        {
          ...groups[0],
          board: tgt.board,
          port: tgt.port,
        },
      ]);
    } else {
      setGroups((prev) => [
        ...prev,
        {
          id: `group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          board: tgt.board,
          port: tgt.port,
          status: "all",
        },
      ]);
    }
  };

  const onSubmit: SubmitHandler<FormValues> = async (formData) => {
    try {
      // Validar grupos
      for (const [index, group] of groups.entries()) {
        if (isNaN(group.board) || group.board < 0) {
          throw new Error(`En el Grupo #${index + 1}: el número de Tarjeta (Board) debe ser válido (≥ 0).`);
        }
        if (isNaN(group.port) || group.port < 0) {
          throw new Error(`En el Grupo #${index + 1}: el número de Puerto (Port) debe ser válido (≥ 0).`);
        }
      }

      const payload = {
        organizationId,
        groups: groups.map((g) => ({
          board: Number(g.board),
          port: Number(g.port),
          status: g.status,
        })),
        title: formData.title,
        body: formData.body,
      };

      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? "Error al enviar la notificación masiva");
      }

      toast.success("✅ Difusión procesada", {
        description: result.message,
      });

      reset();
      setOpen(false);
      onSuccess?.();
    } catch (e) {
      toast.error("❌ Error al enviar difusión", {
        description: (e as Error).message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : !isControlled ? (
        <DialogTrigger asChild>
          <Button className="flex items-center gap-2">
            <Radio className="size-4" />
            Crear notificación masiva
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Radio className="size-5 text-emerald-500 animate-pulse" />
            Difusión masiva por Smart OLT
          </DialogTitle>
          <DialogDescription className="text-xs">
            Segmenta el envío seleccionando múltiples combinaciones de Tarjetas (Boards),
            Puertos PON y Estados específicos del cliente.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Accesos rápidos a Puertos detectados */}
          {targetOptions.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3 text-emerald-500" />
                  Puertos detectados en red (clic para agregar grupo):
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 border rounded-xl bg-muted/20">
                {targetOptions.map((tgt) => {
                  const isInGroups = groups.some(
                    (g) => g.board === tgt.board && g.port === tgt.port,
                  );
                  return (
                    <button
                      key={`${tgt.board}-${tgt.port}`}
                      type="button"
                      onClick={() => handleSelectQuickTarget(tgt)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono transition-all border ${
                        isInGroups
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                          : "border-border bg-background hover:bg-accent text-foreground hover:border-emerald-500/50"
                      }`}
                      title={`Agregar Tarjeta ${tgt.board}, Puerto ${tgt.port}`}>
                      <Server className="size-3" />
                      <span>
                        B{tgt.board}:P{tgt.port}
                      </span>
                      <span className="text-[10px] opacity-75 font-sans">
                        ({tgt.clientCount})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Sección de Grupos de Notificación */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-emerald-500" />
                Grupos notificados ({groups.length})
              </label>
              <span className="text-[11px] text-muted-foreground">
                Múltiples tarjetas, puertos y estados
              </span>
            </div>

            <div className="space-y-2.5">
              {groups.map((group, index) => {
                const currentStatusOpt =
                  CLIENT_STATUS_OPTIONS.find((opt) => opt.value === group.status) ||
                  CLIENT_STATUS_OPTIONS[0];

                return (
                  <div
                    key={group.id}
                    className={`p-3.5 rounded-xl border ${CRM_SURFACES.card} ${CRM_SURFACES.border} space-y-3 shadow-xs relative transition-all`}>
                    {/* Encabezado del Grupo */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center size-5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold font-mono">
                          {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          Grupo #{index + 1}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${currentStatusOpt.badgeClass}`}>
                          {currentStatusOpt.label}
                        </span>
                      </div>

                      {groups.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveGroup(group.id)}
                          className="text-muted-foreground hover:text-rose-500 dark:hover:text-rose-400 p-1 rounded-md transition-colors"
                          title="Eliminar este grupo"
                          aria-label={`Eliminar grupo ${index + 1}`}>
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>

                    {/* Controles: Tarjeta, Puerto y Estado */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Tarjeta (Board) */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Tarjeta (Board)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={group.board}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            handleUpdateGroup(
                              group.id,
                              "board",
                              e.target.value === "" ? 0 : parseInt(e.target.value, 10),
                            )
                          }
                          className="h-8 text-xs font-mono"
                          placeholder="Ej. 1"
                        />
                      </div>

                      {/* Puerto (Port) */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Puerto PON (Port)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={group.port}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            handleUpdateGroup(
                              group.id,
                              "port",
                              e.target.value === "" ? 0 : parseInt(e.target.value, 10),
                            )
                          }
                          className="h-8 text-xs font-mono"
                          placeholder="Ej. 4"
                        />
                      </div>

                      {/* Estado del Cliente */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Estado del cliente
                        </label>
                        <Select
                          value={group.status}
                          disabled={isSubmitting}
                          onValueChange={(val: ClientStatusFilter) =>
                            handleUpdateGroup(group.id, "status", val)
                          }>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Seleccionar estado" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {CLIENT_STATUS_OPTIONS.map((opt) => (
                              <SelectItem
                                key={opt.value}
                                value={opt.value}
                                className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botón para agregar grupo notificado */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={handleAddGroup}
              className="w-full flex items-center justify-center gap-2 border-dashed border-emerald-500/40 hover:border-emerald-500 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 py-2.5 rounded-xl text-xs font-semibold transition-all">
              <Plus className="size-3.5" />
              <span>Agregar grupo notificado</span>
            </Button>
          </div>

          {/* Título de la Notificación */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Título de la notificación push
            </label>
            <Input
              placeholder="Ej.: Mantenimiento preventivo en tu sector"
              disabled={isSubmitting}
              className="h-9 text-xs"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-rose-500">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Cuerpo del Mensaje */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Mensaje a transmitir
            </label>
            <Textarea
              placeholder="Estimado cliente, le informamos que el día de hoy se estarán realizando labores de optimización de red..."
              rows={3}
              disabled={isSubmitting}
              className="text-xs resize-none"
              {...register("body")}
            />
            {errors.body && (
              <p className="text-xs text-rose-500">
                {errors.body.message}
              </p>
            )}
          </div>

          {/* Footer de Acciones */}
          <DialogFooter className="pt-2 gap-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1.5">
              <Send className="size-3.5" />
              <span>
                {isSubmitting
                  ? "Enviando difusión..."
                  : `Enviar a ${groups.length} grupo(s)`}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
