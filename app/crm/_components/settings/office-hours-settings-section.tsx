"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  cloneOfficeHoursConfig,
  DEFAULT_AFTER_HOURS_PAYMENTS,
  DEFAULT_OFFICE_HOURS,
  DEFAULT_OFFICE_TIMEZONE,
  OFFICE_WEEKDAY_OPTIONS,
  type AfterHoursPaymentsConfig,
  type OfficeHoursConfig,
  type WeekdayKey,
} from "../../_lib/office-hours";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

interface OfficeHoursSettingsSectionProps {
  isAdmin: boolean;
  officeHours?: OfficeHoursConfig | null;
  afterHoursPayments?: AfterHoursPaymentsConfig | null;
  onSave: (input: {
    office_hours: OfficeHoursConfig;
    after_hours_payments: AfterHoursPaymentsConfig;
  }) => Promise<void>;
}

const DAY_SHORT: Record<WeekdayKey, string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mié",
  thu: "Jue",
  fri: "Vie",
  sat: "Sáb",
  sun: "Dom",
};

const normalizeHm = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const toMinutes = (value: string) => {
  const normalized = normalizeHm(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
};

export const OfficeHoursSettingsSection = ({
  isAdmin,
  officeHours,
  afterHoursPayments,
  onSave,
}: OfficeHoursSettingsSectionProps) => {
  const savedOffice = useMemo(
    () => cloneOfficeHoursConfig(officeHours || DEFAULT_OFFICE_HOURS),
    [officeHours],
  );
  const savedAfterHours = useMemo(
    () => ({
      enabled:
        afterHoursPayments?.enabled ?? DEFAULT_AFTER_HOURS_PAYMENTS.enabled,
      allowedTools: [
        ...(afterHoursPayments?.allowedTools ||
          DEFAULT_AFTER_HOURS_PAYMENTS.allowedTools),
      ],
    }),
    [afterHoursPayments],
  );

  const [draftOffice, setDraftOffice] = useState(savedOffice);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraftOffice(savedOffice);
    setValidationError(null);
  }, [savedOffice]);

  const isDirty = useMemo(() => {
    return JSON.stringify(draftOffice) !== JSON.stringify(savedOffice);
  }, [draftOffice, savedOffice]);

  const openDaysCount = useMemo(
    () =>
      OFFICE_WEEKDAY_OPTIONS.filter(
        ({ key }) => (draftOffice.days[key] || []).length > 0,
      ).length,
    [draftOffice.days],
  );

  const handleToggleDay = (day: WeekdayKey, open: boolean) => {
    setDraftOffice((current) => {
      const next = cloneOfficeHoursConfig(current);
      if (!open) {
        next.days[day] = [];
        return next;
      }
      if (!next.days[day].length) {
        next.days[day] =
          day === "sat" || day === "sun"
            ? [["08:00", "12:00"]]
            : [["08:00", "17:00"]];
      }
      return next;
    });
  };

  const handleTimeChange = (
    day: WeekdayKey,
    edge: "start" | "end",
    value: string,
  ) => {
    setDraftOffice((current) => {
      const next = cloneOfficeHoursConfig(current);
      const window = next.days[day][0] || ["08:00", "17:00"];
      const updated: [string, string] = [...window];
      updated[edge === "start" ? 0 : 1] = value;
      next.days[day] = [updated];
      return next;
    });
  };

  const handleSave = async () => {
    if (!isAdmin || !isDirty || isSaving) return;

    const normalized = cloneOfficeHoursConfig(draftOffice);
    normalized.timezone = normalized.timezone.trim() || DEFAULT_OFFICE_TIMEZONE;

    for (const { key, label } of OFFICE_WEEKDAY_OPTIONS) {
      const windows = normalized.days[key];
      if (!windows.length) continue;

      const start = normalizeHm(windows[0][0]);
      const end = normalizeHm(windows[0][1]);
      if (!start || !end) {
        setValidationError(`Horario inválido en ${label}. Usa formato HH:mm.`);
        return;
      }

      const startMin = toMinutes(start);
      const endMin = toMinutes(end);
      if (startMin === null || endMin === null || startMin >= endMin) {
        setValidationError(
          `En ${label}, la hora de apertura debe ser anterior al cierre.`,
        );
        return;
      }

      normalized.days[key] = [[start, end]];
    }

    setValidationError(null);
    setIsSaving(true);
    try {
      await onSave({
        office_hours: normalized,
        after_hours_payments: savedAfterHours,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    if (!isAdmin || isSaving) return;
    setDraftOffice(cloneOfficeHoursConfig(DEFAULT_OFFICE_HOURS));
    setValidationError(null);
  };

  return (
    <section
      className={`rounded-2xl p-4 md:p-5 ${CRM_SURFACES.elevated}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Clock3
            className="mt-0.5 size-4 shrink-0 text-crm-accent"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3
              className={`text-base font-semibold ${CRM_SURFACES.textPrimary}`}>
              Horario de oficina
            </h3>
            <p className={`mt-1 max-w-xl text-sm ${CRM_SURFACES.textMuted}`}>
              Define cuándo hay asesores. Nova usa este horario para
              avisarle al cliente cuándo pueden atenderlo. Si el chat está
              en modo humano, Nova no responde, ni siquiera fuera de horario.
            </p>
          </div>
        </div>
        <p
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${CRM_SURFACES.input} ${CRM_SURFACES.textSecondary}`}>
          {openDaysCount}/7 días abiertos
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        {/* Left: policy controls */}
        <aside className="flex flex-col gap-3">
          <div
            className={`rounded-2xl border p-3 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                  Horario programado
                </p>
                <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
                  Activa la regla de apertura/cierre.
                </p>
              </div>
              <Switch
                checked={draftOffice.enabled}
                disabled={!isAdmin || isSaving}
                onCheckedChange={(checked) =>
                  setDraftOffice((current) => ({
                    ...current,
                    enabled: checked,
                  }))
                }
                aria-label="Activar horario de oficina"
              />
            </div>
          </div>

          <div
            className={`rounded-2xl border p-3 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
              Modo humano
            </p>
            <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
              Si un asesor toma el chat, Nova no escribe. Tampoco fuera de
              horario ni los domingos.
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
            <label
              htmlFor="crm-office-timezone"
              className={`text-xs font-medium uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
              Zona horaria
            </label>
            <Input
              id="crm-office-timezone"
              value={draftOffice.timezone}
              onChange={(event) =>
                setDraftOffice((current) => ({
                  ...current,
                  timezone: event.target.value,
                }))
              }
              disabled={!isAdmin || isSaving || !draftOffice.enabled}
              placeholder={DEFAULT_OFFICE_TIMEZONE}
              className={`mt-2 ${CRM_SURFACES.border} ${CRM_SURFACES.elevated} ${CRM_SURFACES.textPrimary}`}
            />
          </div>

          {validationError ? (
            <p className="text-sm text-red-600 dark:text-red-300" role="alert">
              {validationError}
            </p>
          ) : null}

          {!isAdmin ? (
            <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
              Solo un administrador puede editar los horarios.
            </p>
          ) : (
            <div className="mt-auto flex flex-col gap-2 pt-1">
              <CrmButton
                type="button"
                variant="primary"
                disabled={!isDirty || isSaving}
                onClick={() => void handleSave()}>
                {isSaving ? "Guardando…" : "Guardar horarios"}
              </CrmButton>
              <CrmButton
                type="button"
                variant="secondary"
                disabled={isSaving}
                onClick={handleRestoreDefaults}>
                Restaurar predeterminados
              </CrmButton>
            </div>
          )}
        </aside>

        {/* Right: week grid */}
        <div
          className={!draftOffice.enabled ? "pointer-events-none opacity-50" : ""}
          aria-disabled={!draftOffice.enabled}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p
              className={`text-xs font-medium uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
              Semana
            </p>
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Cerrado = sin asesores en línea
            </p>
          </div>

          <ul
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            aria-label="Horario por día">
            {OFFICE_WEEKDAY_OPTIONS.map(({ key, label }) => {
              const windows = draftOffice.days[key] || [];
              const isOpen = windows.length > 0;
              const start = windows[0]?.[0] || "08:00";
              const end = windows[0]?.[1] || "17:00";

              return (
                <li
                  key={key}
                  className={`rounded-2xl border p-3 transition-colors ${CRM_SURFACES.border} ${
                    isOpen ? CRM_SURFACES.elevated : CRM_SURFACES.input
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                        <span className="sm:hidden">{DAY_SHORT[key]}</span>
                        <span className="hidden sm:inline">{label}</span>
                      </p>
                      <p
                        className={`text-[11px] ${
                          isOpen
                            ? "text-emerald-600 dark:text-emerald-400"
                            : CRM_SURFACES.textMuted
                        }`}>
                        {isOpen ? "Abierto" : "Cerrado"}
                      </p>
                    </div>
                    <Switch
                      checked={isOpen}
                      disabled={!isAdmin || isSaving || !draftOffice.enabled}
                      onCheckedChange={(checked) =>
                        handleToggleDay(key, checked)
                      }
                      aria-label={`${label} abierto`}
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <Input
                      type="time"
                      value={start}
                      disabled={
                        !isAdmin || isSaving || !draftOffice.enabled || !isOpen
                      }
                      onChange={(event) =>
                        handleTimeChange(key, "start", event.target.value)
                      }
                      aria-label={`${label} apertura`}
                      className={`h-8 min-w-0 flex-1 px-1.5 text-xs ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
                    />
                    <span
                      className={`shrink-0 text-[11px] ${CRM_SURFACES.textMuted}`}>
                      –
                    </span>
                    <Input
                      type="time"
                      value={end}
                      disabled={
                        !isAdmin || isSaving || !draftOffice.enabled || !isOpen
                      }
                      onChange={(event) =>
                        handleTimeChange(key, "end", event.target.value)
                      }
                      aria-label={`${label} cierre`}
                      className={`h-8 min-w-0 flex-1 px-1.5 text-xs ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
};
