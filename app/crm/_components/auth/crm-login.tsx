"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Building2,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Mail,
  Moon,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { CrmButton } from "../shared/crm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { requireText } from "../../_lib/validators";
import { ShinyText } from "@/components/react-bits/shiny-text";

interface CrmLoginProps {
  isSubmitting: boolean;
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister?: (data: {
    organizationName: string;
    name: string;
    email: string;
    password: string;
  }) => Promise<boolean>;
}

export const CrmLogin = ({
  isSubmitting,
  onLogin,
  onRegister,
}: CrmLoginProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleToggleMode = (nextMode: "login" | "register") => {
    setError("");
    setMode(nextMode);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (mode === "login") {
      if (!requireText(email) || !requireText(password)) {
        setError("Completa todos los campos");
        return;
      }

      const success = await onLogin(email.trim(), password);
      if (!success) {
        setError("Correo o contraseña incorrectos");
      }
      return;
    }

    // Modo registro de organización
    if (
      !requireText(organizationName) ||
      !requireText(name) ||
      !requireText(email) ||
      !requireText(password)
    ) {
      setError("Completa todos los campos obligatorios");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!onRegister) {
      setError("El registro público no está disponible en este momento");
      return;
    }

    const success = await onRegister({
      organizationName: organizationName.trim(),
      name: name.trim(),
      email: email.trim(),
      password,
    });

    if (!success) {
      setError("No se pudo registrar la organización. Revisa los datos.");
    }
  };

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <main
      className={`relative flex min-h-screen items-center justify-center p-4 ${CRM_SURFACES.page}`}>
      {mounted ? (
        <CrmButton
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 size-10"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
          title={isDark ? "Modo claro" : "Modo oscuro"}>
          {isDark ? (
            <Sun className="size-5" aria-hidden="true" />
          ) : (
            <Moon className="size-5" aria-hidden="true" />
          )}
        </CrmButton>
      ) : null}

      <div className="w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-3xl p-8 md:p-9 crm-glass-strong shadow-2xl transition-all">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-crm-accent text-crm-accent-foreground shadow-md">
            {mode === "login" ? (
              <Layers className="size-6" aria-hidden="true" />
            ) : (
              <Building2 className="size-6" aria-hidden="true" />
            )}
          </div>

          <div className="mb-6 text-center">
            <h1 className={`text-xl font-bold ${CRM_SURFACES.textPrimary}`}>
              <ShinyText
                text={
                  mode === "login"
                    ? "Conexiones Innover"
                    : "Registrar Organización"
                }
                className="text-xl font-bold"
                color="var(--foreground)"
                speed={3}
                delay={1.4}
              />
            </h1>
            <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
              {mode === "login"
                ? "CRM Multi-Organización · Acceso de equipo"
                : "Crea tu espacio de trabajo y gestiona tus clientes de forma aislada"}
            </p>
          </div>

          {/* Selector de pestañas Login / Registro */}
          <Tabs
            value={mode}
            onValueChange={(val) => handleToggleMode(val as "login" | "register")}
            className="mb-5">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-black/10 p-1 dark:bg-white/10">
              <TabsTrigger
                value="login"
                className="rounded-lg py-1.5 text-xs font-medium transition-all data-[state=active]:bg-crm-accent data-[state=active]:text-crm-accent-foreground data-[state=active]:shadow-sm">
                Iniciar sesión
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="rounded-lg py-1.5 text-xs font-medium transition-all data-[state=active]:bg-crm-accent data-[state=active]:text-crm-accent-foreground data-[state=active]:shadow-sm">
                Nueva Empresa
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-3.5">
            {mode === "register" ? (
              <>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="crm-org-name"
                    className={`flex items-center gap-1.5 text-xs font-medium ${CRM_SURFACES.textMuted}`}>
                    <Building2 className="size-3.5" aria-hidden="true" />
                    Nombre de tu Empresa u Organización
                  </Label>
                  <Input
                    id="crm-org-name"
                    type="text"
                    required
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    placeholder="Ej. Redes del Norte C.A."
                    className={`${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="crm-admin-name"
                    className={`flex items-center gap-1.5 text-xs font-medium ${CRM_SURFACES.textMuted}`}>
                    <User className="size-3.5" aria-hidden="true" />
                    Tu Nombre y Apellido (Administrador)
                  </Label>
                  <Input
                    id="crm-admin-name"
                    type="text"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className={`${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
                  />
                </div>
              </>
            ) : null}

            <div className="space-y-1.5">
              <Label
                htmlFor="crm-email"
                className={`flex items-center gap-1.5 text-xs font-medium ${CRM_SURFACES.textMuted}`}>
                <Mail className="size-3.5" aria-hidden="true" />
                Correo electrónico
              </Label>
              <Input
                id="crm-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@empresa.com"
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="crm-password"
                className={`flex items-center gap-1.5 text-xs font-medium ${CRM_SURFACES.textMuted}`}>
                <Lock className="size-3.5" aria-hidden="true" />
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="crm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className={`pr-10 ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }>
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {mode === "register" ? (
              <div className="space-y-1.5">
                <Label
                  htmlFor="crm-confirm-password"
                  className={`flex items-center gap-1.5 text-xs font-medium ${CRM_SURFACES.textMuted}`}>
                  <Lock className="size-3.5" aria-hidden="true" />
                  Confirmar contraseña
                </Label>
                <Input
                  id="crm-confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  className={`${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
                />
              </div>
            ) : null}
          </div>

          <CrmButton
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full font-medium">
            {isSubmitting ? (
              "Procesando..."
            ) : mode === "login" ? (
              "Entrar"
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="size-4" aria-hidden="true" />
                Crear Empresa y Empezar
              </span>
            )}
          </CrmButton>

          {error ? (
            <p
              className="mt-3 rounded-lg bg-red-500/10 p-2 text-center text-xs text-red-600 dark:text-red-300"
              aria-live="polite">
              {error}
            </p>
          ) : (
            <p className="mt-3 min-h-5" />
          )}

          <div className="mt-2 text-center">
            {mode === "login" ? (
              <button
                type="button"
                onClick={() => handleToggleMode("register")}
                className="text-xs text-crm-accent hover:underline">
                ¿No tienes cuenta? Registra tu empresa aquí
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleToggleMode("login")}
                className="text-xs text-crm-accent hover:underline">
                ¿Ya tienes una cuenta de asesor o admin? Inicia sesión
              </button>
            )}
          </div>

          <p className="mt-4 text-center">
            <a
              href="/privacidad"
              className={`text-[11px] underline-offset-2 hover:underline ${CRM_SURFACES.textMuted}`}>
              Política de privacidad
            </a>
          </p>
        </form>
      </div>
    </main>
  );
};
