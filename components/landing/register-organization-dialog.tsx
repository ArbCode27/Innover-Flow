"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Lock,
  Mail,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CRM_STORAGE_KEY } from "@/app/crm/_lib/constants";
import { cn } from "@/lib/utils";

interface RegisterOrganizationDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const computePreviewSlug = (name: string): string => {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const RegisterOrganizationDialog = ({
  open,
  onOpenChange,
  trigger,
}: RegisterOrganizationDialogProps) => {
  const router = useRouter();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? open : internalOpen;

  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      // Si se cierra y no está en proceso de envío, restablecer estados
      setErrorMessage(null);
      if (isSuccess) {
        setIsSuccess(false);
        setOrganizationName("");
        setName("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      }
    }

    if (isControlled) {
      onOpenChange?.(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }
  };

  const previewSlug = computePreviewSlug(organizationName);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);

    // Validaciones tempranas
    const trimmedOrgName = organizationName.trim();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedOrgName || trimmedOrgName.length < 2) {
      setErrorMessage("El nombre de la organización debe tener al menos 2 caracteres");
      return;
    }

    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage("Tu nombre completo debe tener al menos 2 caracteres");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setErrorMessage("Ingresa un correo electrónico corporativo válido");
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden");
      return;
    }

    if (!acceptedTerms) {
      setErrorMessage("Debes aceptar los términos y condiciones del servicio");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/crm/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: trimmedOrgName,
          name: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          data.error || "No se pudo registrar la organización. Por favor intenta nuevamente.";
        setErrorMessage(message);
        toast.error(message);
        setIsSubmitting(false);
        return;
      }

      // Guardar agente en localStorage para hidratación instantánea
      if (data.agent && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(data.agent));
        } catch {
          // Ignorar error de cuota en localStorage
        }
      }

      setIsSuccess(true);
      toast.success("¡Organización creada con éxito! Redirigiendo a tu espacio de trabajo...");

      // Redireccionar al CRM tras breve feedback visual
      setTimeout(() => {
        handleOpenChange(false);
        router.push("/crm");
        router.refresh();
      }, 900);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al conectar con el servidor";
      setErrorMessage(message);
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border border-white/20 bg-white/95 p-6 shadow-2xl backdrop-blur-2xl sm:max-w-xl sm:p-8 dark:border-white/10 dark:bg-[#120f18]/95">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/25">
              <Sparkles className="size-5" />
            </div>
            <Badge
              variant="outline"
              className="border-blue-500/30 bg-blue-500/10 text-xs font-semibold text-blue-600 dark:text-blue-400"
            >
              Alta Inmediata Multi-Tenant
            </Badge>
          </div>

          <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Crear Nueva Organización
          </DialogTitle>

          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Configura tu empresa en Innover Flow. Se aprovisionará un espacio de trabajo con
            canal móvil de clientes, tickets de campo y conciliación de pagos.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="flex flex-col items-center justify-center py-10 text-center animate-in fade-in-50 zoom-in-95">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 ring-8 ring-emerald-500/5">
              <CheckCircle2 className="size-8" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
              ¡Organización lista!
            </h3>
            <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Hemos preparado el entorno para <strong>{organizationName}</strong>. Entrando a tu
              workspace...
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
              <Spinner className="size-4" />
              <span>Iniciando sesión segura...</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-2 space-y-4">
            {errorMessage ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive dark:border-destructive/30 dark:bg-destructive/15"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            ) : null}

            {/* Nombre de la Organización */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="register-org-name" className="text-xs font-semibold">
                  Nombre de la Organización / ISP <span className="text-destructive">*</span>
                </Label>
                {previewSlug ? (
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    slug: /{previewSlug}
                  </span>
                ) : null}
              </div>
              <div className="relative">
                <Building2 className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="register-org-name"
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="ej. Fibra Plus Telecom"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="rounded-xl pl-9"
                  autoComplete="organization"
                />
              </div>
            </div>

            {/* Nombre del Administrador */}
            <div className="space-y-1.5">
              <Label htmlFor="register-admin-name" className="text-xs font-semibold">
                Nombre del Administrador / Propietario <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <User className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="register-admin-name"
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="ej. Alejandro Morales"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl pl-9"
                  autoComplete="name"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Se te asignará el rol de Owner con control total del espacio.
              </p>
            </div>

            {/* Correo Electrónico */}
            <div className="space-y-1.5">
              <Label htmlFor="register-email" className="text-xs font-semibold">
                Correo Electrónico de Acceso <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="register-email"
                  type="email"
                  required
                  disabled={isSubmitting}
                  placeholder="admin@tuorganizacion.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl pl-9"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Contraseñas en dos columnas en pantallas medianas */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="register-password" className="text-xs font-semibold">
                  Contraseña <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    required
                    disabled={isSubmitting}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl pr-9 pl-9"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-confirm-password" className="text-xs font-semibold">
                  Confirmar Contraseña <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="register-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    disabled={isSubmitting}
                    placeholder="Repite la contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="rounded-xl pr-9 pl-9"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Checkbox de Términos */}
            <div className="flex items-start gap-2.5 pt-1">
              <Checkbox
                id="register-terms"
                checked={acceptedTerms}
                onCheckedChange={(checked) => setAcceptedTerms(Boolean(checked))}
                disabled={isSubmitting}
                className="mt-0.5"
              />
              <Label
                htmlFor="register-terms"
                className="text-xs leading-normal font-normal text-slate-600 dark:text-slate-300"
              >
                Acepto los términos de servicio y la{" "}
                <Link
                  href="/privacidad"
                  target="_blank"
                  className="inline-flex items-center gap-0.5 font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
                >
                  política de privacidad
                  <ExternalLink className="size-3" />
                </Link>{" "}
                de Innover Flow.
              </Label>
            </div>

            {/* Botón de Enviar */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-2xl bg-blue-600 py-5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-700 hover:shadow-blue-600/40 active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Creando organización y aprovisionando espacio...
                </>
              ) : (
                <>
                  Comenzar Ahora — Crear Organización
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>

            {/* Enlace alternativo a login */}
            <div className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              ¿Ya tienes una organización o cuenta activa?{" "}
              <Link
                href="/crm"
                onClick={() => handleOpenChange(false)}
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
              >
                Iniciar sesión en el CRM
              </Link>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
