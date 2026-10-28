"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Radio, Server } from "lucide-react";
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
import type { BoardPortTarget } from "@/app/crm/_lib/types";

/* ---------- Esquema de validación ---------- */
const schema = z.object({
  board: z.coerce
    .number({ invalid_type_error: "El board debe ser un número" })
    .int("Debe ser un número entero")
    .min(0, "El board no puede ser negativo"),
  port: z.coerce
    .number({ invalid_type_error: "El port debe ser un número" })
    .int("Debe ser un número entero")
    .min(0, "El port no puede ser negativo"),
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres"),
  body: z.string().trim().min(5, "El cuerpo del mensaje debe tener al menos 5 caracteres"),
});

type FormValues = z.infer<typeof schema>;

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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      board: defaultBoard ?? targetOptions[0]?.board ?? 1,
      port: defaultPort ?? targetOptions[0]?.port ?? 1,
      title: "",
      body: "",
    },
  });

  // Si cambian defaultBoard o defaultPort externamente, sincronizarlos
  useState(() => {
    if (defaultBoard !== undefined) setValue("board", defaultBoard);
    if (defaultPort !== undefined) setValue("port", defaultPort);
  });

  const selectedBoard = watch("board");
  const selectedPort = watch("port");

  const handleSelectQuickTarget = (target: BoardPortTarget) => {
    setValue("board", target.board, { shouldValidate: true });
    setValue("port", target.port, { shouldValidate: true });
  };

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          board: data.board,
          port: data.port,
          title: data.title,
          body: data.body,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? "Error al enviar la notificación masiva");
      }

      toast.success("✅ Notificación enviada", {
        description: result.message,
      });

      reset();
      setOpen(false);
      onSuccess?.();
    } catch (e) {
      toast.error("❌ Error al enviar", {
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

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="size-5 text-emerald-500" />
            Difusión masiva por Smart OLT
          </DialogTitle>
          <DialogDescription>
            Segmenta el envío seleccionando la Tarjeta (Board) y Puerto PON (Port) registrados en las ONUs de los clientes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Accesos rápidos a Boards/Ports registrados */}
          {targetOptions.length > 0 ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Puertos detectados con clientes vinculados:
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 border rounded-md bg-muted/20">
                {targetOptions.map((tgt) => {
                  const isCurrent =
                    Number(selectedBoard) === tgt.board &&
                    Number(selectedPort) === tgt.port;
                  return (
                    <button
                      key={`${tgt.board}-${tgt.port}`}
                      type="button"
                      onClick={() => handleSelectQuickTarget(tgt)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-mono transition-colors border ${
                        isCurrent
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold"
                          : "border-border bg-background hover:bg-accent text-foreground"
                      }`}>
                      <Server className="size-3" />
                      B{tgt.board}:P{tgt.port} ({tgt.clientCount})
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Campos Board y Port */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Board (Tarjeta / Slot)</label>
              <Input
                type="number"
                min={0}
                placeholder="Ej. 1"
                disabled={isSubmitting}
                {...register("board")}
              />
              {errors.board && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errors.board.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Port (Puerto PON)</label>
              <Input
                type="number"
                min={0}
                placeholder="Ej. 4"
                disabled={isSubmitting}
                {...register("port")}
              />
              {errors.port && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errors.port.message}
                </p>
              )}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Título de la notificación</label>
            <Input
              placeholder="Ej.: Mantenimiento preventivo en tu sector"
              disabled={isSubmitting}
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Mensaje */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Mensaje Push</label>
            <Textarea
              placeholder="Estimado cliente, le informamos que el día de hoy se estarán realizando labores técnicas..."
              rows={4}
              disabled={isSubmitting}
              {...register("body")}
            />
            {errors.body && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.body.message}
              </p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enviando difusión..." : "Enviar notificación masiva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
