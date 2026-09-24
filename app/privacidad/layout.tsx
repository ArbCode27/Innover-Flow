import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Política de privacidad · Conexiones Innover",
  description:
    "Cómo Conexiones Innover e Innover Flow tratan los datos personales recibidos por WhatsApp Business y Meta Cloud API.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/privacidad",
  },
  openGraph: {
    title: "Política de privacidad · Conexiones Innover",
    description:
      "Información pública sobre el uso de datos de WhatsApp, clientes y pagos en Innover Flow.",
    locale: "es_VE",
    type: "website",
  },
};

const PrivacyLayout = ({ children }: { children: ReactNode }) => (
  <ThemeProvider
    attribute="class"
    defaultTheme="dark"
    enableSystem
    storageKey="crm-theme"
    disableTransitionOnChange>
    {children}
  </ThemeProvider>
);

export default PrivacyLayout;
