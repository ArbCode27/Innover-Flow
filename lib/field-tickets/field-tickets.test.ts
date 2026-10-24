import test from "node:test";
import assert from "node:assert/strict";
import {
  toDatetimeLocalValue,
  datetimeLocalToIso,
  defaultVisitWindowLocal,
  assertVisitWindowRange,
} from "./datetime-local.ts";
import { buildMapsUrl, parseMapsUrlCoords } from "./maps-url.ts";
import {
  resolveTicketConversationId,
  openCasosForConversation,
  ticketBelongsToClient,
} from "./conversation-match.ts";
import { matchTicketByPublicIdOrClientName } from "./ticket-match.ts";
import {
  looksLikeDetailRequest,
  observationLooksSufficient,
  shouldSkipDetailFastPath,
  extractObservationAfterCloseCue,
  formatFinalizeConfirmation,
  looksLikeCloseIntent,
} from "./technician-intent.ts";
import { last10Digits, phonesMatchLast10 } from "./phone.ts";
import { sortFieldTicketsByPriorityThenSchedule } from "./sort.ts";
import type { FieldTicket } from "./types.ts";

const ticket = (overrides: Partial<FieldTicket>): FieldTicket => ({
  id: "t1",
  organizationId: "org",
  issueId: "issue",
  publicId: 2046,
  conversationId: 10,
  crmClientId: 20,
  employeeId: "emp-1",
  employeeName: "Luis",
  employeePhone: "04141234567",
  employeeDocument: "12345678",
  status: "scheduled",
  priority: "medium",
  kind: "technical",
  categoryId: null,
  categoryName: null,
  title: "Sin internet",
  cause: null,
  description: null,
  clientName: "María Pérez",
  clientPhone: "04121112233",
  mapsUrl: null,
  latitude: null,
  longitude: null,
  addressText: "Calle 12",
  facadeMediaUrl: null,
  facadeMessageId: null,
  windowStart: null,
  windowEnd: null,
  lastTechnicianReportAt: null,
  lastTechnicianReportKey: null,
  closedAt: null,
  resolutionObservation: null,
  wisproIssueId: "issue",
  wisproOrderId: "ord-t1",
  createdAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-09-28T10:00:00.000Z",
  ...overrides,
});

test("datetime-local: roundtrip keeps local minutes", () => {
  const iso = "2026-09-28T14:30:00.000Z";
  const local = toDatetimeLocalValue(iso);
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const back = datetimeLocalToIso(local);
  assert.ok(back);
  assert.equal(new Date(back).getTime(), new Date(iso).getTime());
});

test("datetime-local: default visit window starts in one hour and lasts one hour", () => {
  const now = new Date("2026-10-20T14:30:45.123Z");
  const result = defaultVisitWindowLocal(now);
  const start = new Date(datetimeLocalToIso(result.windowStart)!);
  const end = new Date(datetimeLocalToIso(result.windowEnd)!);
  const expectedStart = new Date(now);
  expectedStart.setSeconds(0, 0);
  expectedStart.setHours(expectedStart.getHours() + 1);
  assert.match(result.windowStart, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.match(result.windowEnd, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(start.getTime(), expectedStart.getTime());
  assert.equal(end.getTime() - start.getTime(), 60 * 60 * 1000);
});

test("datetime-local: empty becomes null and range validates", () => {
  assert.equal(datetimeLocalToIso(""), null);
  assert.equal(datetimeLocalToIso("   "), null);
  assert.equal(toDatetimeLocalValue(null), "");
  assert.equal(assertVisitWindowRange(null, null).ok, true);
  assert.equal(
    assertVisitWindowRange("2026-09-28T15:00:00.000Z", "2026-09-28T14:00:00.000Z").ok,
    false,
  );
  assert.equal(
    assertVisitWindowRange("2026-09-28T14:00:00.000Z", "2026-09-28T15:00:00.000Z").ok,
    true,
  );
});

test("maps: parse google links and build fallback", () => {
  const parsed = parseMapsUrlCoords(
    "https://www.google.com/maps/place/Foo/@10.4806,-66.9036,17z",
  );
  assert.deepEqual(parsed, { latitude: 10.4806, longitude: -66.9036 });

  const qParsed = parseMapsUrlCoords("https://maps.google.com/?q=10.5,-66.9");
  assert.deepEqual(qParsed, { latitude: 10.5, longitude: -66.9 });

  assert.equal(
    buildMapsUrl({ latitude: 10.5, longitude: -66.9 }),
    "https://maps.google.com/?q=10.5,-66.9",
  );
  assert.equal(
    buildMapsUrl({ mapsUrl: "https://maps.app.goo.gl/abc" }),
    "https://maps.app.goo.gl/abc",
  );
});

test("resolveTicketConversationId: conversationId then client then last 10 digits", () => {
  const conversations = [
    { id: 1, client_id: 99, customer_phone: "584141111111" },
    { id: 2, client_id: 20, customer_phone: "584121112233" },
    { id: 3, client_id: 7, customer_phone: "04121112233" },
  ];

  assert.equal(
    resolveTicketConversationId(
      { conversationId: 2, crmClientId: 20, clientPhone: "04121112233" },
      conversations,
    ),
    2,
  );
  assert.equal(
    resolveTicketConversationId(
      { conversationId: null, crmClientId: 20, clientPhone: null },
      conversations,
    ),
    2,
  );
  assert.equal(
    resolveTicketConversationId(
      { conversationId: null, crmClientId: null, clientPhone: "0412-111-2233" },
      [{ id: 9, client_id: 1, customer_phone: "584121112233" }],
    ),
    9,
  );
  assert.equal(
    resolveTicketConversationId(
      { conversationId: 99, crmClientId: null, clientPhone: null },
      conversations,
    ),
    null,
  );
});

test("ticketBelongsToClient: matches by client id, conversation or last 10 phone digits", () => {
  assert.equal(
    ticketBelongsToClient(
      { conversationId: null, crmClientId: 20, clientPhone: null },
      { id: 20, phone: "584121112233", conversationIds: [] },
    ),
    true,
  );
  assert.equal(
    ticketBelongsToClient(
      { conversationId: 10, crmClientId: null, clientPhone: null },
      { id: 99, phone: null, conversationIds: [10, 11] },
    ),
    true,
  );
  assert.equal(
    ticketBelongsToClient(
      { conversationId: null, crmClientId: null, clientPhone: "0412-111-2233" },
      { id: 99, phone: "584121112233", conversationIds: [] },
    ),
    true,
  );
  assert.equal(
    ticketBelongsToClient(
      { conversationId: 5, crmClientId: 8, clientPhone: "04121110000" },
      { id: 20, phone: "584121112233", conversationIds: [10] },
    ),
    false,
  );
});

test("openCasosForConversation: only open/scheduled linked by conversation or client", () => {
  const tickets = [
    ticket({ id: "a", status: "scheduled", conversationId: 10, crmClientId: 20 }),
    ticket({ id: "b", status: "done", conversationId: 10, crmClientId: 20 }),
    ticket({ id: "c", status: "open", conversationId: 11, crmClientId: 20 }),
    ticket({ id: "d", status: "open", conversationId: 12, crmClientId: 21 }),
  ];
  const open = openCasosForConversation(tickets, { id: 10, client_id: 20 });
  assert.deepEqual(
    open.map((item) => item.id).sort(),
    ["a", "c"],
  );
});

test("match ticket by public id or unique client name", () => {
  const tickets = [
    { publicId: 2046, clientName: "María Pérez" },
    { publicId: 2048, clientName: "Juan Díaz" },
  ];
  assert.equal(matchTicketByPublicIdOrClientName("cierra #2046", tickets)?.publicId, 2046);
  assert.equal(matchTicketByPublicIdOrClientName("ficha de maría pérez", tickets)?.publicId, 2046);
  assert.equal(matchTicketByPublicIdOrClientName("hola", tickets), null);
});

test("technician interceptors: observation, audio, completo, confirmation copy", () => {
  assert.equal(looksLikeCloseIntent("listo"), true);
  assert.equal(looksLikeCloseIntent("ya terminé"), true);
  assert.equal(observationLooksSufficient("ok"), false);
  assert.equal(observationLooksSufficient("Cambio de conector OK"), true);
  assert.equal(looksLikeDetailRequest("completo"), false);
  assert.equal(looksLikeDetailRequest("ficha del caso"), true);
  assert.equal(
    shouldSkipDetailFastPath({
      awaitingCloseObservation: true,
      inboundIsAudio: false,
      text: "ficha",
    }),
    true,
  );
  assert.equal(
    shouldSkipDetailFastPath({
      awaitingCloseObservation: false,
      inboundIsAudio: true,
      text: "foto",
    }),
    true,
  );
  assert.ok(extractObservationAfterCloseCue("listo cambie el conector").includes("cambie"));
  assert.equal(
    formatFinalizeConfirmation(2046, "María Pérez"),
    "Listo. Cerré #2046 (María Pérez) con la observación registrada.",
  );
  assert.equal(last10Digits("58414-1234567"), "4141234567");
  assert.equal(phonesMatchLast10("04141234567", "584141234567"), true);
});

test("sort: priority high→low, then earlier windowStart within same priority", () => {
  const sorted = sortFieldTicketsByPriorityThenSchedule([
    ticket({
      id: "low-late",
      publicId: 1,
      priority: "low",
      windowStart: "2026-10-24T16:00:00.000Z",
    }),
    ticket({
      id: "high-second",
      publicId: 2,
      priority: "high",
      windowStart: "2026-10-24T15:00:00.000Z",
    }),
    ticket({
      id: "high-first",
      publicId: 3,
      priority: "high",
      windowStart: "2026-10-24T14:00:00.000Z",
    }),
    ticket({
      id: "urgent",
      publicId: 4,
      priority: "urgent",
      windowStart: "2026-10-24T18:00:00.000Z",
    }),
    ticket({
      id: "medium",
      publicId: 5,
      priority: "medium",
      windowStart: "2026-10-24T12:00:00.000Z",
    }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["urgent", "high-first", "high-second", "medium", "low-late"],
  );
});

test("sort: missing windowStart falls back to createdAt ascending", () => {
  const sorted = sortFieldTicketsByPriorityThenSchedule([
    ticket({
      id: "b",
      publicId: 20,
      priority: "high",
      windowStart: null,
      createdAt: "2026-10-24T11:00:00.000Z",
    }),
    ticket({
      id: "a",
      publicId: 10,
      priority: "high",
      windowStart: null,
      createdAt: "2026-10-24T09:00:00.000Z",
    }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["a", "b"],
  );
});
