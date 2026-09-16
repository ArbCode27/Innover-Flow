"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { CrmAppearanceProvider } from "./crm-appearance-provider";

interface CrmThemeProviderProps {
  children: ReactNode;
}

export const CrmThemeProvider = ({ children }: CrmThemeProviderProps) => (
  <ThemeProvider
    attribute="class"
    defaultTheme="dark"
    enableSystem
    storageKey="crm-theme"
    disableTransitionOnChange>
    <CrmAppearanceProvider>{children}</CrmAppearanceProvider>
  </ThemeProvider>
);
