"use client";

import { z } from "zod";
import {
  useForm,
  SubmitHandler,
  Controller,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import { toast } from "@/components/ui/sonner";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

/* ---------- esquema de validación ---------- */
const schema = z.object({
  zones: z.array(z.string()).min(1, "Selecciona al menos una zona"),
  title: z.string().min(3, "El título es obligatorio"),
  body: z.string().min(5, "El cuerpo es obligatorio"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  zoneOptions: { label: string; value: string }[];
}

export const NewMassNotificationForm = ({ zoneOptions }: Props) => {
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

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: process.env.NEXT_PUBLIC_ORG_ID,
          zones: data.zones,
          title: data.title,
          body: data.body,
        }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error ?? "Error inesperado");

      toast.success("✅ Notificación enviada", {
        description: result.message,
      });
      reset();
    } catch (e) {
      toast.error("❌ Error al enviar", {
        description: (e as Error).message,
      });
    }
  };

  return (
    <Dialog>
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
          {/* Zonas (multiselect) */}
          <div>
            <label className="block text-sm font-medium mb-1">Zona(s)</label>
            <Select
              value={watch("zones") as string[]}
              onValueChange={(value) =>
                setValue("zones", value as string[], { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona zona(s)" />
              </SelectTrigger>
              <SelectContent>
                {zoneOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      checked={watch("zones")?.includes(opt.value)}
                      className="pointer-events-none"
                    />
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.zones && (
              <p className="text-sm text-red-600">{errors.zones.message}</p>
            )}
          </div>

          {/* Título */}
          <div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <Input placeholder="Ej.: Oferta 20 % OFF" {...register("title")} />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title.message}</p>
            )}
          </div>

          {/* Mensaje */}
          <div>
            <label className="block text-sm font-medium mb-1">Mensaje</label>
            <Textarea
              placeholder="Escribe el contenido de la notificación"
              rows={4}
              {...register("body")}
            />
            {errors.body && (
              <p className="text-sm text-red-600">{errors.body.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "Enviando…" : "Enviar notificación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
