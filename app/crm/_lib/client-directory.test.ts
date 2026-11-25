import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountFromSaeContract,
  directoryPatch,
  findDirectoryMatch,
  type LocalClientRef,
} from "./client-directory.ts";
import { readOnuImportRows, resolveOnuImportClient } from "./onu-import.ts";

const local = (
  partial: Partial<LocalClientRef> & Pick<LocalClientRef, "id" | "name">,
): LocalClientRef => ({
  cedula: null,
  wispro_id: null,
  phone: null,
  plan: null,
  zone: null,
  account: "Prospecto",
  ...partial,
});

describe("findDirectoryMatch", () => {
  it("reuses the client with the same cédula instead of creating another", () => {
    const result = findDirectoryMatch(
      [local({ id: 4, name: "Diego", cedula: "V-16346456" })],
      { cedula: "16346456", wisproId: "wispro-1" },
    );
    assert.equal(result.conflict, false);
    assert.equal(result.match?.id, 4);
  });

  it("does not merge when cédula and Wispro point to different clients", () => {
    const result = findDirectoryMatch(
      [
        local({ id: 1, name: "Diego", cedula: "16346456" }),
        local({ id: 2, name: "Ana", wispro_id: "wispro-9" }),
      ],
      { cedula: "16346456", wisproId: "wispro-9" },
    );
    assert.equal(result.conflict, true);
    assert.equal(result.match, null);
  });
});

describe("directoryPatch", () => {
  it("fills empty phone and wispro id without replacing an existing plan", () => {
    const patch = directoryPatch(
      local({
        id: 1,
        name: "Diego",
        plan: "BASICO 200",
        account: "Al día",
      }),
      {
        name: "Diego Pérez",
        cedula: "16346456",
        phone: "584161745189",
        zone: "Urdaneta",
        plan: null,
        account: "Al día",
        wisproId: "wispro-1",
      },
    );
    assert.equal(patch.name, "Diego Pérez");
    assert.equal(patch.phone, "584161745189");
    assert.equal(patch.wispro_id, "wispro-1");
    assert.equal(patch.plan, undefined);
  });
});

describe("accountFromSaeContract", () => {
  it("maps an active contract to al día and a cut contract to suspended", () => {
    assert.equal(accountFromSaeContract("ACTIVO"), "Al día");
    assert.equal(accountFromSaeContract("CORTADO"), "Suspendido");
  });
});

describe("onu import", () => {
  const clients = [
    { id: 8, name: "Diego Pérez", cedula: "16346456" },
    { id: 9, name: "Diego Pérez", cedula: "20111222" },
  ];

  it("ignores rows without a serial and matches the prefilled id", () => {
    const parsed = readOnuImportRows(
      ["Id", "Nombre del cliente", "Cédula", "Serial del equipo"],
      [
        [8, "Diego Pérez", "16346456", ""],
        [9, "Diego Pérez", "20111222", "hwtc1234"],
      ],
    );
    assert.equal(parsed.error, null);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0]?.serial, "HWTC1234");
    assert.equal(resolveOnuImportClient(parsed.rows[0]!, clients).client?.id, 9);
  });

  it("refuses a duplicated name when the id was removed", () => {
    const resolved = resolveOnuImportClient(
      { id: null, name: "Diego Pérez", cedula: null },
      clients,
    );
    assert.equal(resolved.client, null);
    assert.match(resolved.error || "", /más de un cliente/);
  });
});
