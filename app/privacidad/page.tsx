import Link from "next/link";
import {
  CalendarDays,
  Layers,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CRM_BADGE_TONES, CRM_SURFACES } from "@/app/crm/_lib/crm-theme";
import { PrivacyThemeToggle } from "./_components/privacy-theme-toggle";
import {
  PRIVACY_CONTROLLER,
  PRIVACY_HIGHLIGHTS,
  PRIVACY_LAST_UPDATED,
  PRIVACY_PRODUCT,
  PRIVACY_SECTIONS,
} from "./_lib/privacy-policy";

const PrivacyPage = () => (
  <div className={`min-h-svh ${CRM_SURFACES.page}`}>
    <header
      className={`sticky top-0 z-20 border-b backdrop-blur-md ${CRM_SURFACES.border} bg-white/45 dark:bg-slate-950/40`}>
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/crm"
          className="flex items-center gap-2.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-crm-accent text-crm-accent-foreground shadow-sm">
            <Layers className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span
              className={`block text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              {PRIVACY_CONTROLLER}
            </span>
            <span className={`block text-[11px] ${CRM_SURFACES.textMuted}`}>
              {PRIVACY_PRODUCT}
            </span>
          </span>
        </Link>
        <PrivacyThemeToggle />
      </div>
    </header>

    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <article>
        <section
          className={`mb-8 rounded-3xl p-6 shadow-lg sm:p-8 crm-glass-strong ${CRM_SURFACES.border} border`}>
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-crm-accent text-crm-accent-foreground shadow-md">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <p
            className={`mb-2 text-xs font-medium uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
            Documento público · WhatsApp Business
          </p>
          <h1
            className={`text-3xl font-semibold tracking-tight sm:text-4xl ${CRM_SURFACES.textPrimary}`}>
            Política de privacidad
          </h1>
          <p className={`mt-3 max-w-2xl text-sm leading-6 ${CRM_SURFACES.textSecondary}`}>
            Explica cómo {PRIVACY_CONTROLLER} usa los datos que llegan por
            WhatsApp Cloud API, el CRM de atención y las integraciones de
            facturación y pagos. Esta página es pública y no requiere inicio de
            sesión, tal como lo pide Meta para configurar la aplicación.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {PRIVACY_HIGHLIGHTS.map((item) => (
              <span
                key={item.id}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${CRM_BADGE_TONES.blue}`}>
                {item.label}
              </span>
            ))}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${CRM_BADGE_TONES.neutral}`}>
              <CalendarDays className="size-3" aria-hidden="true" />
              Actualizada el {PRIVACY_LAST_UPDATED}
            </span>
          </div>
        </section>

        <nav aria-label="Índice de la política" className="mb-8">
          <Card className={`rounded-3xl border-0 ${CRM_SURFACES.elevated}`}>
            <CardHeader className="pb-2">
              <CardTitle
                className={`flex items-center gap-2 text-base ${CRM_SURFACES.textPrimary}`}>
                <MessageCircle
                  className="size-4 text-crm-accent"
                  aria-hidden="true"
                />
                Contenido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 sm:grid-cols-2">
                {PRIVACY_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className={`block rounded-2xl border px-3 py-2.5 transition ${CRM_SURFACES.border} ${CRM_SURFACES.hover} ${CRM_SURFACES.textSecondary} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent`}>
                      <span
                        className={`block text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                        {section.title}
                      </span>
                      <span className={`mt-0.5 block text-xs ${CRM_SURFACES.textMuted}`}>
                        {section.summary}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </nav>

        <div className="space-y-4">
          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <Card className={`rounded-3xl border-0 ${CRM_SURFACES.elevated}`}>
                <CardHeader>
                  <CardTitle
                    className={`text-lg ${CRM_SURFACES.textPrimary}`}>
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className={`text-sm leading-6 ${CRM_SURFACES.textSecondary}`}>
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets ? (
                    <ul
                      className={`list-disc space-y-1.5 pl-5 text-sm leading-6 ${CRM_SURFACES.textSecondary}`}>
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.paragraphsAfter?.map((paragraph) => (
                    <p
                      key={paragraph}
                      className={`text-sm leading-6 ${CRM_SURFACES.textSecondary}`}>
                      {paragraph}
                    </p>
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      </article>

      <footer
        className={`mt-10 border-t pt-6 text-center text-xs ${CRM_SURFACES.border} ${CRM_SURFACES.textMuted}`}>
        <p>
          © {new Date().getFullYear()} {PRIVACY_CONTROLLER}. {PRIVACY_PRODUCT} ·
          Atención por WhatsApp Business.
        </p>
        <p className="mt-1">
          Documento público para la configuración de la aplicación en Meta.
        </p>
      </footer>
    </main>
  </div>
);

export default PrivacyPage;
