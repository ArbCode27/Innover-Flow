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
  const [draftAfterHours, setDraftAfterHours] = useState(savedAfterHours);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraftOffice(savedOffice);
    setDraftAfterHours(savedAfterHours);
    setValidationError(null);
  }, [savedOffice, savedAfterHours]);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(draftOffice) !== JSON.stringify(savedOffice) ||
      draftAfterHours.enabled !== savedAfterHours.enabled
    );
  }, [draftOffice, savedOffice, draftAfterHours, savedAfterHours]);

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
        after_hours_payments: draftAfterHours,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    if (!isAdmin || isSaving) return;
    setDraftOffice(cloneOfficeHoursConfig(DEFAULT_OFFICE_HOURS));
    setDraftAfterHours({
      enabled: DEFAULT_AFTER_HOURS_PAYMENTS.enabled,
      allowedTools: [...DEFAULT_AFTER_HOURS_PAYMENTS.allowedTools],
    });
    setValidationError(null);
  };

  return (
    <section className={`rounded-2xl p-4 md:p-5 ${CRM_SURFACES.elevated}`}>
      {/* Encabezado */}
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
              Define cuándo hay asesores. Nova usa este horario para avisarle al
              cliente cuándo pueden atenderlo. Fuera de jornada también puede
              registrar pagos aunque el chat esté en modo humano.
            </p>
          </div>
        </div>
        <p
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${CRM_SURFACES.input} ${CRM_SURFACES.textSecondary}`}>
          {openDaysCount}/7 días abiertos
        </p>
      </div>

      {/* 1. FLEX ARRIBA: Contenedores de Switches y Zona Horaria */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {/* Switch: Horario programado */}
        <div
          className={`flex flex-1 min-w-[200px] items-center justify-between gap-3 rounded-2xl border p-3.5 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
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

        {/* Switch: Pagos fuera de horario */}
        <div
          className={`flex flex-1 min-w-[200px] items-center justify-between gap-3 rounded-2xl border p-3.5 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
              Pagos fuera de horario
            </p>
            <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
              Comprobantes y registro aunque sea modo humano.
            </p>
          </div>
          <Switch
            checked={draftAfterHours.enabled}
            disabled={!isAdmin || isSaving}
            onCheckedChange={(checked) =>
              setDraftAfterHours((current) => ({
                ...current,
                enabled: checked,
              }))
            }
            aria-label="Permitir pagos fuera de horario"
          />
        </div>

        {/* Input: Zona horaria */}
        <div
          className={`flex flex-1 min-w-[180px] flex-col justify-center rounded-2xl border p-3.5 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
          <label
            htmlFor="crm-office-timezone"
            className={`text-[11px] font-semibold uppercase tracking-wider ${CRM_SURFACES.textLabel}`}>
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
            className={`mt-1.5 h-8 ${CRM_SURFACES.border} ${CRM_SURFACES.elevated} ${CRM_SURFACES.textPrimary}`}
          />
        </div>
      </div>

      {validationError ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">
          {validationError}
        </p>
      ) : null}

      {/* 2. ABAJO: Inputs para modificar los horarios en 2 filas */}
      <div
        className={`mt-6 ${!draftOffice.enabled ? "pointer-events-none opacity-50" : ""}`}
        aria-disabled={!draftOffice.enabled}>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${CRM_SURFACES.textLabel}`}>
            Semana
          </p>
          <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
            Cerrado = Nova puede atender pagos
          </p>
        </div>

        <ul
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4"
          aria-label="Horario por día">
          {OFFICE_WEEKDAY_OPTIONS.map(({ key, label }) => {
            const windows = draftOffice.days[key] || [];
            const isOpen = windows.length > 0;
            const start = windows[0]?.[0] || "08:00";
            const end = windows[0]?.[1] || "17:00";

            return (
              <li
                key={key}
                className={`rounded-2xl border p-3.5 transition-colors ${CRM_SURFACES.border} ${
                  isOpen ? CRM_SURFACES.elevated : CRM_SURFACES.input
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                      {label}
                    </p>
                    <p
                      className={`text-[11px] font-medium ${
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
                    onCheckedChange={(checked) => handleToggleDay(key, checked)}
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

      {/* Botones de acción */}
      {isAdmin ? (
        <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-black/5 pt-4 dark:border-white/5">
          <CrmButton
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={handleRestoreDefaults}
            className="text-xs">
            Restaurar predeterminados
          </CrmButton>
          <CrmButton
            type="button"
            variant="primary"
            disabled={!isDirty || isSaving}
            onClick={() => void handleSave()}
            className="text-xs">
            {isSaving ? "Guardando…" : "Guardar horarios"}
          </CrmButton>
        </div>
      ) : null}
    </section>
  );
};
