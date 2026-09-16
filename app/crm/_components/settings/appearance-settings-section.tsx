"use client";

import type { KeyboardEvent } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  CRM_ACCENT_OPTIONS,
  CRM_COLOR_MODE_OPTIONS,
  type CrmAccentId,
  type CrmColorMode,
} from "../../_lib/crm-accents";
import { CRM_FOCUS_RING, CRM_SURFACES } from "../../_lib/crm-theme";
import { cn } from "@/lib/utils";

interface AppearanceSettingsSectionProps {
  isAdmin: boolean;
  accent: CrmAccentId;
  colorMode: CrmColorMode;
  officeAccent: CrmAccentId;
  isSaving: boolean;
  onAccentChange: (accent: CrmAccentId) => void;
  onColorModeChange: (mode: CrmColorMode) => void;
  onOfficeAccentChange: (accent: CrmAccentId) => void;
}

const MODE_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export const AppearanceSettingsSection = ({
  isAdmin,
  accent,
  colorMode,
  officeAccent,
  isSaving,
  onAccentChange,
  onColorModeChange,
  onOfficeAccentChange,
}: AppearanceSettingsSectionProps) => {
  const handleAccentKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    options: readonly CrmAccentId[],
    current: CrmAccentId,
    onSelect: (accent: CrmAccentId) => void,
  ) => {
    const currentIndex = options.indexOf(current);
    if (currentIndex < 0) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onSelect(options[(currentIndex + 1) % options.length]);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onSelect(
        options[(currentIndex - 1 + options.length) % options.length],
      );
    }
  };

  return (
    <section
      className={`rounded-2xl p-4 md:p-5 ${CRM_SURFACES.elevated}`}>
      <div className="flex items-start gap-3">
        <Palette
          className="mt-0.5 size-4 shrink-0 text-crm-accent"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
            Apariencia
          </h3>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            Elige el modo y un acento pastel. El fondo se mantiene neutro para
            leer el inbox sin saturación.
          </p>
        </div>
      </div>

      <fieldset className="mt-5" disabled={isSaving}>
        <legend className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
          Modo
        </legend>
        <div
          className="mt-2 grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Modo de color">
          {CRM_COLOR_MODE_OPTIONS.map((option) => {
            const Icon = MODE_ICONS[option.id];
            const isSelected = colorMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isSaving}
                onClick={() => onColorModeChange(option.id)}
                className={cn(
                  CRM_FOCUS_RING,
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition",
                  isSelected
                    ? "border-crm-accent bg-crm-accent-muted text-crm-accent-muted-foreground"
                    : `${CRM_SURFACES.border} ${CRM_SURFACES.card} ${CRM_SURFACES.textSecondary} ${CRM_SURFACES.hover}`,
                )}>
                <Icon className="size-4" aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5" disabled={isSaving}>
        <legend className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
          Color de acento
        </legend>
        <div
          className="mt-3 flex flex-wrap gap-3"
          role="radiogroup"
          aria-label="Color de acento">
          {CRM_ACCENT_OPTIONS.map((option) => {
            const isSelected = accent === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={option.label}
                title={option.description}
                disabled={isSaving}
                onClick={() => onAccentChange(option.id)}
                onKeyDown={(event) =>
                  handleAccentKeyDown(
                    event,
                    CRM_ACCENT_OPTIONS.map((item) => item.id),
                    accent,
                    onAccentChange,
                  )
                }
                className={cn(
                  CRM_FOCUS_RING,
                  "flex size-11 items-center justify-center rounded-full border-2 transition",
                  isSelected
                    ? "border-slate-900 ring-2 ring-crm-accent ring-offset-2 ring-offset-slate-50 dark:border-white dark:ring-offset-[#161922]"
                    : "border-transparent hover:border-slate-300 dark:hover:border-white/30",
                )}>
                <span
                  className="size-8 rounded-full shadow-inner"
                  style={{ backgroundColor: option.swatch }}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
        <p className={`mt-3 text-xs ${CRM_SURFACES.textMuted}`}>
          {CRM_ACCENT_OPTIONS.find((option) => option.id === accent)?.label}:{" "}
          {CRM_ACCENT_OPTIONS.find((option) => option.id === accent)?.description}
        </p>
      </fieldset>

      {isAdmin ? (
        <fieldset className="mt-6 border-t pt-5" disabled={isSaving}>
          <legend
            className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
            Predeterminado del CRM
          </legend>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            Se usa en la pantalla de acceso y para agentes que aún no eligieron
            un color.
          </p>
          <div
            className="mt-3 flex flex-wrap gap-3"
            role="radiogroup"
            aria-label="Color predeterminado del CRM">
            {CRM_ACCENT_OPTIONS.map((option) => {
              const isSelected = officeAccent === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${option.label} predeterminado`}
                  title={option.label}
                  disabled={isSaving}
                  onClick={() => onOfficeAccentChange(option.id)}
                  className={cn(
                    CRM_FOCUS_RING,
                    "flex size-10 items-center justify-center rounded-full border-2 transition",
                    isSelected
                      ? "border-slate-900 ring-2 ring-crm-accent ring-offset-2 ring-offset-slate-50 dark:border-white dark:ring-offset-[#161922]"
                      : "border-transparent hover:border-slate-300 dark:hover:border-white/30",
                  )}>
                  <span
                    className="size-7 rounded-full shadow-inner"
                    style={{ backgroundColor: option.swatch }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </section>
  );
};
