import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CrmThemeProvider } from "./_components/shell/crm-theme-provider";

export const metadata: Metadata = {
  title: "CRM · Conexiones Innover",
  description: "Módulo CRM independiente para gestión de conversaciones.",
};

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <CrmThemeProvider>
      <div className="h-svh overflow-hidden">{children}</div>
    </CrmThemeProvider>
  );
}
