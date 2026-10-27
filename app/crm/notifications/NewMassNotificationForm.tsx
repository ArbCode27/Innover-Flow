"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";

/* ---------- Esquema de validación ---------- */
const schema = z.object({
  zones: z.array(z.string()).min(1, "Selecciona al menos una zona"),
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres"),
  body: z.string().trim().min(5, "El cuerpo del mensaje debe tener al menos 5 caracteres"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  zoneOptions: { label: string; value: string }[];
  organizationId?: string;
}

export const NewMassNotificationForm = ({ zoneOptions, organizationId }: Props) => {
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { zones: [], title: "", body: "" },
  });

  const selectedZones = watch("zones") || [];

  const handleToggleZone = (zoneValue: string) => {
    const isSelected = selectedZones.includes(zoneValue);
    const updated = isSelected
      ? selectedZones.filter((z) => z !== zoneValue)
      : [...selectedZones, zoneValue];
    setValue("zones", updated, { shouldValidate: true });
  };

  const handleSelectAllZones = () => {
    const all = zoneOptions.map((opt) => opt.value);
    setValue("zones", all, { shouldValidate: true });
  };

  const handleClearZones = () => {
    setValue("zones", [], { shouldValidate: true });
  };

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          zones: data.zones,
          title: data.title,
          body: data.body,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? "Error inesperado");
      }

      toast.success("✅ Notificación enviada", {
        description: result.message,
      });

      reset();
      setOpen(false);
    } catch (e) {
      toast.error("❌ Error al enviar", {
        description: (e as Error).message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Crear notificación masiva</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear notificación masiva</DialogTitle>
          <DialogDescription>
            Selecciona una o varias zonas y escribe el mensaje que recibirán los clientes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Zonas (multiselect con checkboxes) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Zona(s) destino {selectedZones.length > 0 && `(${selectedZones.length})`}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllZones}
                  className="text-xs text-primary hover:underline"
                >
                  Todas
                </button>
                <span className="text-xs text-muted-foreground">•</span>
                <button
                  type="button"
                  onClick={handleClearZones}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Ninguna
                </button>
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto rounded-md border p-2 space-y-1 bg-background">
              {zoneOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  No hay zonas registradas para clientes de esta organización.
                </p>
              ) : (
                zoneOptions.map((opt) => {
                  const isChecked = selectedZones.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer select-none transition-colors"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleZone(opt.value)}
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  );
                })
              )}
            </div>

            {errors.zones && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.zones.message}
              </p>
            )}
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Título</label>
            <Input
              placeholder="Ej.: Mantenimiento programado"
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
            <label className="text-sm font-medium">Mensaje</label>
            <Textarea
              placeholder="Escribe el contenido de la notificación push"
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
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enviando…" : "Enviar notificación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
