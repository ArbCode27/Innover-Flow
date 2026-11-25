import ExcelJS from "exceljs";
import { ONU_TEMPLATE_HEADERS, readOnuImportRows } from "@/app/crm/_lib/onu-import";

export type OnuTemplateClient = {
  id: number;
  name: string;
  cedula: string | null;
};

export const buildOnuTemplateBuffer = async (clients: OnuTemplateClient[]) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Innover CRM";
  const sheet = workbook.addWorksheet("Equipos");
  sheet.columns = [
    { header: ONU_TEMPLATE_HEADERS[0], key: "id", width: 12 },
    { header: ONU_TEMPLATE_HEADERS[1], key: "name", width: 36 },
    { header: ONU_TEMPLATE_HEADERS[2], key: "cedula", width: 18 },
    { header: ONU_TEMPLATE_HEADERS[3], key: "serial", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  const ordered = [...clients].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
  for (const client of ordered) {
    sheet.addRow({
      id: client.id,
      name: client.name,
      cedula: client.cedula || "",
      serial: "",
    });
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const parseOnuWorkbook = async (file: ArrayBuffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(file));
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], error: "El archivo no tiene hojas." };
  }
  const headerRow = sheet.getRow(1);
  const header = Array.isArray(headerRow.values)
    ? headerRow.values.slice(1)
    : [];
  const body: unknown[][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    body.push(values);
  });
  return readOnuImportRows(header, body);
};
