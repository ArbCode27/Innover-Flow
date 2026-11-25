import { cedulaDigits, normalizePersonName } from "./client-directory.ts";

export type OnuImportClient = {
  id: number;
  name: string;
  cedula: string | null;
};

export type OnuImportRow = {
  row: number;
  id: number | null;
  name: string;
  cedula: string | null;
  serial: string;
};

export const ONU_TEMPLATE_HEADERS = [
  "Id",
  "Nombre del cliente",
  "Cédula",
  "Serial del equipo",
] as const;

const headerKey = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const readOnuImportRows = (
  header: unknown[],
  body: unknown[][],
): { rows: OnuImportRow[]; error: string | null } => {
  const keys = header.map(headerKey);
  const idIndex = keys.findIndex((key) => key === "id");
  const nameIndex = keys.findIndex(
    (key) => key === "nombre del cliente" || key === "nombre",
  );
  const cedulaIndex = keys.findIndex((key) => key === "cedula");
  const serialIndex = keys.findIndex(
    (key) => key === "serial del equipo" || key === "serial" || key === "sn",
  );

  if (nameIndex < 0 || serialIndex < 0) {
    return {
      rows: [],
      error: "La plantilla debe incluir Nombre del cliente y Serial del equipo.",
    };
  }

  const rows: OnuImportRow[] = [];
  body.forEach((cells, index) => {
    const serial = String(cells[serialIndex] || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!serial) return;
    const rawId = idIndex >= 0 ? Number(cells[idIndex]) : Number.NaN;
    rows.push({
      row: index + 2,
      id: Number.isInteger(rawId) && rawId > 0 ? rawId : null,
      name: String(cells[nameIndex] || "").trim(),
      cedula: cedulaDigits(String(cells[cedulaIndex] || "")) || null,
      serial,
    });
  });

  return { rows, error: null };
};

export const resolveOnuImportClient = (
  row: Pick<OnuImportRow, "id" | "name" | "cedula">,
  clients: OnuImportClient[],
): { client: OnuImportClient | null; error: string | null } => {
  if (row.id) {
    const byId = clients.find((client) => client.id === row.id) || null;
    if (!byId) return { client: null, error: "El cliente de esta fila ya no existe." };
    return { client: byId, error: null };
  }

  if (row.cedula) {
    const byCedula = clients.filter(
      (client) => cedulaDigits(client.cedula) === row.cedula,
    );
    if (byCedula.length === 1) return { client: byCedula[0], error: null };
    if (byCedula.length > 1) {
      return { client: null, error: "Hay más de un cliente con esta cédula." };
    }
  }

  const name = normalizePersonName(row.name);
  if (!name) return { client: null, error: "Falta el nombre del cliente." };
  const byName = clients.filter(
    (client) => normalizePersonName(client.name) === name,
  );
  if (byName.length === 1) return { client: byName[0], error: null };
  if (byName.length > 1) {
    return {
      client: null,
      error: "Hay más de un cliente con este nombre. No se modificó la fila.",
    };
  }
  return { client: null, error: "No se encontró el cliente en esta sucursal." };
};
