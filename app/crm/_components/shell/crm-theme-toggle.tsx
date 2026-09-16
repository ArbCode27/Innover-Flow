"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CrmButton } from "../shared/crm-button";

interface CrmThemeToggleProps {
  className?: string;
}

export const CrmThemeToggle = ({ className }: CrmThemeToggleProps) => {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={cn("size-10 shrink-0", className)} aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <CrmButton
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-10", className)}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}>
      {isDark ? (
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
    </CrmButton>
  );
};
