import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Política de privacidad · Conexiones Innover",
  description:
    "Cómo Conexiones Innover e Innover Flow tratan los datos personales del canal de atención por app móvil y del CRM.",
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
      "Información pública sobre el uso de datos de la app de atención, clientes y pagos en Innover Flow.",
    locale: "es_VE",
    type: "website",
  },
};

const PrivacyLayout = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

export default PrivacyLayout;
