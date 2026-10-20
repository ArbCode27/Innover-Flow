"use client";

import type { ReactNode } from "react";
import { CrmAppearanceProvider } from "./crm-appearance-provider";

interface CrmThemeProviderProps {
  children: ReactNode;
}

export const CrmThemeProvider = ({ children }: CrmThemeProviderProps) => (
  <CrmAppearanceProvider>{children}</CrmAppearanceProvider>
);
