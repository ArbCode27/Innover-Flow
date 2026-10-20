import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFieldScore,
  calculateOfficeScore,
  calculateScore,
  formatScore,
  normalizeSlaCompliance,
  recurrenceRatePercent,
  sortTeamByScoreDesc,
  topPerformerByRole,
  type FieldTeamRow,
  type OfficeTeamRow,
} from "./scoring.ts";
import {
  countRecurrences72h,
  slaComplianceRatio,
  type DerivedTicket,
} from "./dashboard-derived-metrics.ts";

test("oficina: C=20 T=10 P=8 TR=4 → 45", () => {
  const score = calculateOfficeScore({
    chatsResolved: 20,
    ticketsCreated: 10,
    paymentsValidated: 8,
    firstResponseMinutes: 4,
  });
  assert.equal(score, 45);
  assert.equal(calculateScore("office", {
    chatsResolved: 20,
    ticketsCreated: 10,
    paymentsValidated: 8,
    firstResponseMinutes: 4,
  }), 45);
  assert.equal(formatScore(score), "45.0");
});

test("técnico: TR_tech=10 R=1 SLA=0.9 → 66.5", () => {
  const score = calculateFieldScore({
    ticketsAssigned: 12,
    ticketsResolved: 10,
    recurrences72h: 1,
    slaCompliance: 0.9,
  });
  assert.equal(score, 66.5);
  assert.equal(formatScore(score), "66.5");
});

test("técnico con más reincidencias que resueltos → score negativo válido", () => {
  const score = calculateFieldScore({
    ticketsAssigned: 3,
    ticketsResolved: 1,
    recurrences72h: 2,
    slaCompliance: 0,
  });
  assert.equal(score, -25);
  assert.ok(score < 0);
  assert.equal(formatScore(score), "-25.0");
});

test("SLA en porcentaje 0-100 se normaliza a 0-1", () => {
  assert.equal(normalizeSlaCompliance(90), 0.9);
  assert.equal(normalizeSlaCompliance(1.2), 0.012);
  assert.equal(normalizeSlaCompliance(-4), 0);
  assert.equal(normalizeSlaCompliance(150), 1);
  const fromPercent = calculateFieldScore({
    ticketsAssigned: 10,
    ticketsResolved: 10,
    recurrences72h: 1,
    slaCompliance: 90,
  });
  assert.equal(fromPercent, 66.5);
});

test("tasa de reincidencia nula si no hay resueltos", () => {
  assert.equal(recurrenceRatePercent(2, 0), null);
  assert.equal(recurrenceRatePercent(1, 4), 25);
});

test("top performer se calcula por rol, sin mezclar escalas", () => {
  const officeA: OfficeTeamRow = {
    role: "office",
    id: "office:1",
    name: "Ana",
    status: "online",
    metrics: {
      chatsResolved: 20,
      ticketsCreated: 10,
      paymentsValidated: 8,
      firstResponseMinutes: 4,
    },
    score: 45,
    rankInRole: 1,
  };
  const fieldA: FieldTeamRow = {
    role: "field",
    id: "field:1",
    name: "Luis",
    metrics: {
      ticketsAssigned: 12,
      ticketsResolved: 10,
      recurrences72h: 1,
      slaCompliance: 0.9,
    },
    score: 66.5,
    rankInRole: 1,
    slaSampleSize: 10,
  };
  const mixed = sortTeamByScoreDesc([officeA, fieldA]);
  assert.equal(mixed[0]?.name, "Luis");
  assert.equal(topPerformerByRole(mixed, "office")?.name, "Ana");
  assert.equal(topPerformerByRole(mixed, "field")?.name, "Luis");
  assert.equal(topPerformerByRole([], "office"), null);
});

test("reincidencia 72h se deriva de crm_client_id + closed_at", () => {
  const tickets: DerivedTicket[] = [
    {
      id: "a",
      crmClientId: 10,
      employeeId: "tech-1",
      status: "done",
      createdAt: "2026-09-01T10:00:00.000Z",
      closedAt: "2026-09-10T10:00:00.000Z",
      windowEnd: "2026-09-10T18:00:00.000Z",
    },
    {
      id: "b",
      crmClientId: 10,
      employeeId: "tech-2",
      status: "open",
      createdAt: "2026-09-11T08:00:00.000Z",
      closedAt: null,
      windowEnd: null,
    },
  ];
  const period = {
    fromMs: Date.parse("2026-09-01T00:00:00.000Z"),
    toMs: Date.parse("2026-09-30T23:59:59.000Z"),
  };
  assert.equal(countRecurrences72h(new Set(["tech-1"]), tickets, period), 1);
  assert.equal(countRecurrences72h(new Set(["tech-2"]), tickets, period), 0);
});

test("SLA derivado usa window_end vs closed_at", () => {
  const tickets: DerivedTicket[] = [
    {
      id: "on-time",
      crmClientId: 1,
      employeeId: "tech-1",
      status: "done",
      createdAt: "2026-09-01T10:00:00.000Z",
      closedAt: "2026-09-02T10:00:00.000Z",
      windowEnd: "2026-09-02T18:00:00.000Z",
    },
    {
      id: "late",
      crmClientId: 2,
      employeeId: "tech-1",
      status: "done",
      createdAt: "2026-09-01T10:00:00.000Z",
      closedAt: "2026-09-03T20:00:00.000Z",
      windowEnd: "2026-09-03T12:00:00.000Z",
    },
  ];
  const period = {
    fromMs: Date.parse("2026-09-01T00:00:00.000Z"),
    toMs: Date.parse("2026-09-30T23:59:59.000Z"),
  };
  const result = slaComplianceRatio(new Set(["tech-1"]), tickets, period);
  assert.equal(result.sampleSize, 2);
  assert.equal(result.onTime, 1);
  assert.equal(result.ratio, 0.5);
});
