"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  Layers,
  MapPin,
  MessageSquare,
  Receipt,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShinyText } from "@/components/react-bits/shiny-text";
import { RegisterOrganizationDialog } from "@/components/landing/register-organization-dialog";

interface FeatureCardItem {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  colSpan?: string;
  badge?: string;
}

const FEATURE_ITEMS: FeatureCardItem[] = [
  {
    id: "app-movil",
    title: "App Móvil de Atención Directa",
    description:
      "Canal propio de atención al cliente. Inicio de sesión seguro con Teléfono y Cédula registrados por la organización, eliminando el riesgo de bloqueo o tarifas de WhatsApp/Meta.",
    icon: Smartphone,
    accentColor: "bg-blue-500/10 text-blue-500 dark:bg-blue-500/20",
    badge: "Canal Propio",
  },
  {
    id: "campo",
    title: "Órdenes de Trabajo & Campo",
    description:
      "Despacho rápido con ventanas horarias, geolocalización, subida de foto de fachada y confirmación de cierre con observaciones directas del técnico.",
    icon: Wrench,
    accentColor: "bg-amber-500/10 text-amber-500 dark:bg-amber-500/20",
    badge: "Tickets Locales",
  },
  {
    id: "pagos",
    title: "Conciliación de Pagos con IA",
    description:
      "Lectura inteligente de comprobantes bancarios, conversión con tasa BCV del día, matching automático con facturas pendientes y registro directo en Wispro Cloud.",
    icon: Receipt,
    accentColor: "bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20",
    badge: "Wispro Sync",
  },
  {
    id: "productividad",
    title: "Scoring de Rendimiento Diferenciado",
    description:
      "Fórmulas transparentes según el rol: evaluación de asesores de oficina (conversaciones, tickets creados, pagos procesados y tiempo de respuesta) y técnicos de campo (tickets resueltos, tasa de reincidencia a 72h y cumplimiento de SLA).",
    icon: TrendingUp,
    accentColor: "bg-purple-500/10 text-purple-500 dark:bg-purple-500/20",
    colSpan: "md:col-span-2",
    badge: "Métricas Duales",
  },
  {
    id: "multi-tenant",
    title: "Arquitectura Multi-Organización",
    description:
      "Aislamiento estricto por sucursales o empresas con sus propios clientes, conversaciones, agentes y configuraciones independientes bajo un mismo despliegue.",
    icon: Layers,
    accentColor: "bg-cyan-500/10 text-cyan-500 dark:bg-cyan-500/20",
    badge: "Multi-Tenant",
  },
];

interface HeaderProps {
  onOpenRegister: () => void;
}

const LandingHeader = ({ onOpenRegister }: HeaderProps) => {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-md backdrop-blur-xl dark:border-white/10 dark:bg-[#120f18]/90">
        <div className="flex items-center gap-3 pl-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/25">
            <Sparkles className="size-5" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-base font-bold tracking-tight">Innover Flow</span>
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
              CRM & Telecom Suite
            </span>
          </div>
        </div>

        <nav aria-label="Navegación principal" className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
          <a href="#modulos" className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
            Módulos
          </a>
          <a href="#app-movil" className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
            Canal Móvil
          </a>
          <a href="#campo" className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
            Técnicos de Campo
          </a>
          <a href="#productividad" className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
            Productividad
          </a>
        </nav>

        <div className="flex items-center gap-2.5">
          <Link href="/crm">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 shadow-xs hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20 dark:hover:text-white"
            >
              Iniciar Sesión
            </Button>
          </Link>
          <Button
            onClick={onOpenRegister}
            size="sm"
            className="rounded-xl bg-blue-600 font-semibold text-white shadow-md shadow-blue-600/30 transition-all hover:bg-blue-700 hover:text-white hover:shadow-lg active:scale-[0.98]"
          >
            <Building2 className="mr-1.5 size-4" />
            Crear Organización
          </Button>
        </div>
      </div>
    </header>
  );
};

const CrmInteractivePreview = () => {
  return (
    <div className="relative z-10 mx-auto mt-16 w-full max-w-5xl rounded-3xl border border-white/30 bg-white/40 p-3 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.03]">
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/80 shadow-inner dark:border-white/5 dark:bg-[#120f18]/90">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-red-400/80" />
            <span className="size-3 rounded-full bg-amber-400/80" />
            <span className="size-3 rounded-full bg-emerald-400/80" />
            <span className="ml-2 font-mono text-xs text-slate-400">
              innover-crm://workspace
            </span>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/30 text-[11px] font-normal text-emerald-600 dark:text-emerald-400"
          >
            ● Live Realtime Sync
          </Badge>
        </div>

        <div className="grid grid-cols-1 divide-y divide-black/5 text-left text-xs md:grid-cols-3 md:divide-y-0 md:divide-x dark:divide-white/5">
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-blue-600" /> Canal Móvil
              </span>
              <Badge variant="secondary" className="text-[10px]">
                App Directa
              </Badge>
            </div>
            <div className="space-y-2 pt-1">
              <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-white/5">
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  Carlos Pérez (0412-***)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Envié comprobante de pago por 25$
                </p>
              </div>
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5">
                <p className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                  <Bot className="size-3" /> Bot Asistente
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Recibo validado. Pendiente de aprobación.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                <Wrench className="size-3.5 text-amber-500" /> Visitas de Campo
              </span>
              <span className="text-[10px] text-slate-400">Tickets Locales</span>
            </div>
            <div className="space-y-2 pt-1">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    #TK-1082
                  </span>
                  <span className="text-[10px] text-slate-400">Ventana: 2pm - 4pm</span>
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-300">
                  Revisión de fibra caída
                </p>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                  <MapPin className="size-3 text-red-400" /> Sector Los Samanes
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-purple-500" /> Productividad
              </span>
              <span className="text-[10px] font-medium text-emerald-500">
                94.8% SLA
              </span>
            </div>
            <div className="space-y-2 pt-1">
              <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-white/5">
                <div className="flex justify-between text-[11px]">
                  <span>Asesores Oficina</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">Score 88.5</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10">
                  <div className="h-full w-[88%] rounded-full bg-blue-600" />
                </div>
              </div>
              <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-white/5">
                <div className="flex justify-between text-[11px]">
                  <span>Técnicos de Campo</span>
                  <span className="font-bold text-purple-500">Score 92.1</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10">
                  <div className="h-full w-[92%] rounded-full bg-purple-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface HeroProps {
  onOpenRegister: () => void;
}

const LandingHero = ({ onOpenRegister }: HeroProps) => {
  return (
    <section className="relative flex min-h-[90vh] flex-col items-center justify-center px-4 pt-32 pb-20 sm:px-6">
      {/* Fondo estático limpio y elegante (sin partículas ni movimiento) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-[650px] rounded-full bg-gradient-to-b from-blue-500/10 via-indigo-500/5 to-transparent blur-3xl dark:from-blue-600/15 dark:via-indigo-600/10" />
        <div className="absolute top-1/4 -left-48 size-[450px] rounded-full bg-sky-400/10 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute top-1/3 -right-48 size-[450px] rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-600/10" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-4 py-1.5 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-white/[0.08]">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
          <ShinyText
            text="✦ Plataforma Integral Multi-Organización para ISPs"
            speed={3}
            className="text-xs font-semibold tracking-wider uppercase text-slate-700 dark:text-slate-300"
          />
        </div>

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
          Atención, pagos y soporte técnico en un{" "}
          <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
            solo flujo
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 sm:text-lg dark:text-slate-300">
          Canal propio de atención móvil, gestión de tickets de campo,
          conciliación de pagos automatizada con IA y tablero de productividad con
          scoring en tiempo real.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={onOpenRegister}
            className="rounded-2xl bg-blue-600 px-8 py-6 text-base font-bold text-white shadow-xl shadow-blue-600/30 transition-all hover:bg-blue-700 hover:text-white hover:shadow-2xl hover:shadow-blue-600/40 active:scale-[0.98]"
          >
            <Building2 className="mr-2 size-5" />
            Crear Organización
            <ArrowRight className="ml-2 size-5" />
          </Button>
          <Link href="/crm">
            <Button
              size="lg"
              variant="outline"
              className="rounded-2xl border-2 border-slate-300 bg-white px-7 py-6 text-base font-bold text-slate-900 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 dark:hover:text-white active:scale-[0.98]"
            >
              Acceder al CRM
            </Button>
          </Link>
          <a href="#modulos">
            <Button
              size="lg"
              variant="ghost"
              className="rounded-2xl border border-slate-200/80 bg-slate-100/80 px-6 py-6 text-base font-semibold text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
            >
              Explorar Capacidades
            </Button>
          </a>
        </div>
      </div>

      <CrmInteractivePreview />
    </section>
  );
};

const LandingFeatures = () => {
  return (
    <section id="modulos" className="px-4 py-24 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <Badge
            variant="outline"
            className="rounded-xl border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400"
          >
            Arquitectura Moderna
          </Badge>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Diseñado para operar tu ISP sin fricción
          </h2>
          <p className="mt-3 text-slate-500 dark:text-slate-400">
            Elimina intermediarios externos y centraliza cada punto de contacto de tu
            negocio.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.id}
                id={item.id}
                className={`rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.04] ${
                  item.colSpan || ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex size-12 items-center justify-center rounded-2xl ${item.accentColor}`}
                  >
                    <Icon className="size-6" />
                  </div>
                  {item.badge ? (
                    <Badge variant="secondary" className="text-xs font-semibold">
                      {item.badge}
                    </Badge>
                  ) : null}
                </div>
                <CardTitle className="mt-5 text-xl font-bold">
                  {item.title}
                </CardTitle>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.description}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

interface FooterProps {
  onOpenRegister: () => void;
}

const LandingCallToAction = ({ onOpenRegister }: { onOpenRegister: () => void }) => {
  return (
    <section className="px-4 py-20 sm:px-8">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/50 p-8 shadow-2xl sm:p-14 dark:border-white/10 dark:from-[#151221] dark:via-[#120f18] dark:to-blue-950/20">
        <div className="relative z-10 flex flex-col items-center text-center">
          <Badge
            variant="outline"
            className="border-blue-500/30 bg-blue-500/10 text-xs font-semibold text-blue-600 dark:text-blue-400"
          >
            Despliegue Inmediato
          </Badge>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Comienza a operar tu ISP hoy mismo
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
            Registra tu empresa en menos de un minuto. Obtendrás un espacio completamente
            aislado con canal de chat directo para clientes, tablero de despacho de técnicos
            y validación de transferencias bancarias con IA.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={onOpenRegister}
              className="rounded-2xl bg-blue-600 px-8 py-6 text-base font-bold text-white shadow-xl shadow-blue-600/30 transition-all hover:bg-blue-700 hover:text-white hover:shadow-2xl hover:shadow-blue-600/40 active:scale-[0.98]"
            >
              <Building2 className="mr-2 size-5" />
              Registrar mi Organización
              <ArrowRight className="ml-2 size-5" />
            </Button>
            <Link href="/crm">
              <Button
                size="lg"
                variant="outline"
                className="rounded-2xl border-2 border-slate-300 bg-white px-7 py-6 text-base font-bold text-slate-900 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 dark:hover:text-white active:scale-[0.98]"
              >
                Ya tengo cuenta · Entrar al CRM
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

const LandingFooter = ({ onOpenRegister }: FooterProps) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200/80 bg-white/60 py-12 backdrop-blur-lg dark:border-white/5 dark:bg-black/20">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white shadow-xs">
            IF
          </span>
          <span className="font-semibold">Innover Flow</span>
          <span className="text-xs text-slate-400">© {currentYear}</span>
        </div>

        <div className="flex items-center gap-6 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={onOpenRegister}
            className="cursor-pointer font-medium transition-colors hover:text-blue-600 dark:hover:text-blue-400"
          >
            Registrar Organización
          </button>
          <Link
            href="/privacidad"
            className="transition-colors hover:text-blue-600 dark:hover:text-blue-400"
          >
            Política de Privacidad
          </Link>
          <Link
            href="/crm"
            className="font-semibold text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400"
          >
            Acceder al CRM
          </Link>
        </div>
      </div>
    </footer>
  );
};

const LandingPage = () => {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const handleOpenRegister = () => {
    setIsRegisterOpen(true);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f4f7fb] text-slate-900 transition-colors selection:bg-crm-accent selection:text-white dark:bg-[#0c0a0f] dark:text-slate-100">
      <LandingHeader onOpenRegister={handleOpenRegister} />
      <main>
        <LandingHero onOpenRegister={handleOpenRegister} />
        <LandingFeatures />
        <LandingCallToAction onOpenRegister={handleOpenRegister} />
      </main>
      <LandingFooter onOpenRegister={handleOpenRegister} />

      <RegisterOrganizationDialog
        open={isRegisterOpen}
        onOpenChange={setIsRegisterOpen}
      />
    </div>
  );
};

export default LandingPage;
