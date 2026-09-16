"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import {
  applyCrmAccentToDocument,
  DEFAULT_CRM_ACCENT,
  DEFAULT_CRM_COLOR_MODE,
  parseCrmAccentId,
  parseCrmColorMode,
  persistCrmAccent,
  readStoredCrmAccent,
  type CrmAccentId,
  type CrmColorMode,
} from "../../_lib/crm-accents";

interface AppearanceSnapshot {
  agentId: number | null;
  accent: CrmAccentId | null;
  mode: CrmColorMode | null;
  officeAccent: CrmAccentId;
}

interface CrmAppearanceContextValue {
  accent: CrmAccentId;
  colorMode: CrmColorMode;
  officeAccent: CrmAccentId;
  applyAccent: (accent: CrmAccentId) => void;
  applyColorMode: (mode: CrmColorMode) => void;
  hydrate: (input: AppearanceSnapshot) => void;
}

const CrmAppearanceContext = createContext<CrmAppearanceContextValue | null>(
  null,
);

interface CrmAppearanceProviderProps {
  children: ReactNode;
}

export const CrmAppearanceProvider = ({
  children,
}: CrmAppearanceProviderProps) => {
  const { theme, setTheme } = useTheme();
  const [accent, setAccent] = useState<CrmAccentId>(DEFAULT_CRM_ACCENT);
  const [officeAccent, setOfficeAccent] =
    useState<CrmAccentId>(DEFAULT_CRM_ACCENT);
  const hydratedAgentIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const stored = readStoredCrmAccent();
    const initial = stored || DEFAULT_CRM_ACCENT;
    setAccent(initial);
    applyCrmAccentToDocument(initial);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOfficeDefault = async () => {
      try {
        const response = await fetch("/api/crm/settings");
        if (!response.ok) return;
        const data = (await response.json()) as {
          settings?: { ui_accent?: unknown };
        };
        if (cancelled) return;
        const nextOffice = parseCrmAccentId(
          data.settings?.ui_accent,
          DEFAULT_CRM_ACCENT,
        );
        setOfficeAccent(nextOffice);
        if (!readStoredCrmAccent() && hydratedAgentIdRef.current === null) {
          setAccent(nextOffice);
          applyCrmAccentToDocument(nextOffice);
        }
      } catch {
        // Keep the local/default accent if settings are unavailable.
      }
    };

    void loadOfficeDefault();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAccent = useCallback((nextAccent: CrmAccentId) => {
    const resolved = parseCrmAccentId(nextAccent);
    setAccent(resolved);
    persistCrmAccent(resolved);
    applyCrmAccentToDocument(resolved);
  }, []);

  const applyColorMode = useCallback(
    (mode: CrmColorMode) => {
      setTheme(parseCrmColorMode(mode));
    },
    [setTheme],
  );

  const hydrate = useCallback(
    (input: AppearanceSnapshot) => {
      hydratedAgentIdRef.current = input.agentId;
      const nextOffice = parseCrmAccentId(input.officeAccent);
      setOfficeAccent(nextOffice);
      if (input.accent) {
        applyAccent(input.accent);
      } else if (!readStoredCrmAccent()) {
        applyAccent(nextOffice);
      }
      if (input.mode) {
        applyColorMode(input.mode);
      }
    },
    [applyAccent, applyColorMode],
  );

  const colorMode = parseCrmColorMode(theme, DEFAULT_CRM_COLOR_MODE);

  const value = useMemo(
    () => ({
      accent,
      colorMode,
      officeAccent,
      applyAccent,
      applyColorMode,
      hydrate,
    }),
    [accent, applyAccent, applyColorMode, colorMode, hydrate, officeAccent],
  );

  return (
    <CrmAppearanceContext.Provider value={value}>
      {children}
    </CrmAppearanceContext.Provider>
  );
};

export const useCrmAppearance = () => {
  const context = useContext(CrmAppearanceContext);
  if (!context) {
    throw new Error("useCrmAppearance debe usarse dentro de CrmAppearanceProvider");
  }
  return context;
};
