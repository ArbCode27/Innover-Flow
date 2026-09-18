import test from "node:test";
import assert from "node:assert/strict";
import { parseReporte, suggestCategory, normalizeKey } from "./parseReporte.ts";

test("1. parseReporte: Parsea el ejemplo completo del bot de IA", () => {
  const input = `
**REPORTE TÉCNICO:**
• **Motivo:** Sin conexión WiFi desde hace 2 días
• **Comportamiento:** Señal WiFi visible pero se desconecta en segundos (reproducible)
• **Reinicio:** No resuelve (desconexión 30 seg + reconexión)
• **Dispositivos afectados:** Teléfono + Televisor (no es un solo equipo)
• **Router:** Luz verde, ~1 año de uso
• **Entorno:** Casa pequeña y abierta, sin obstáculos, todo cerca del router
• **Dispositivos conectados:** 2 (1 teléfono + 1 TV)
• **Zona/OPT:** OLT MUME PON 5
• **Posible causa:** Falla en el enlace OLT/PON o en el router (señal inestable)
`;

  const result = parseReporte(input);

  // Verificación de campos extraídos y normalizados
  assert.equal(result.fields.motivo, "Sin conexión WiFi desde hace 2 días");
  assert.equal(result.fields.zona_opt, "OLT MUME PON 5");
  assert.equal(result.fields.posible_causa, "Falla en el enlace OLT/PON o en el router (señal inestable)");
  assert.equal(result.fields.dispositivos_afectados, "Teléfono + Televisor (no es un solo equipo)");
  assert.equal(result.fields.router, "Luz verde, ~1 año de uso");
  assert.equal(result.fields.dispositivos_conectados, "2 (1 teléfono + 1 TV)");

  // Verificación del título generado
  assert.equal(result.title, "Sin conexión WiFi desde hace 2 días");
  assert.ok(result.title.length <= 80);

  // Verificación de la descripción en texto plano sin markdown
  assert.ok(!result.formattedDescription.includes("**"));
  assert.ok(result.formattedDescription.includes("Motivo: Sin conexión WiFi desde hace 2 días"));
  assert.ok(result.formattedDescription.includes("Zona/OPT: OLT MUME PON 5"));
});

test("2. parseReporte: Tolera reporte con 3 campos y sin negritas", () => {
  const input = `
Nota del operador antes del reporte.
- Motivo: Caída total de enlace
- Zona/OPT: Nodo Centro
- Posible causa: Fibra cortada por camión
Texto adicional luego del reporte.
`;

  const result = parseReporte(input);

  assert.equal(result.fields.motivo, "Caída total de enlace");
  assert.equal(result.fields.zona_opt, "Nodo Centro");
  assert.equal(result.fields.posible_causa, "Fibra cortada por camión");
  assert.equal(result.title, "Caída total de enlace");
  assert.equal(result.orderedFields.length, 3);
});

test("3. parseReporte: Maneja texto libre sin viñetas", () => {
  const input = "El cliente llamó indicando que su router no enciende tras tormenta eléctrica.";
  const result = parseReporte(input);

  assert.deepEqual(result.fields, {});
  assert.equal(result.orderedFields.length, 0);
  assert.equal(result.title, "");
  assert.equal(result.formattedDescription, "El cliente llamó indicando que su router no enciende tras tormenta eléctrica.");
});

test("4. parseReporte: Maneja string vacío o espacios en blanco", () => {
  const resultEmpty = parseReporte("");
  assert.deepEqual(resultEmpty.fields, {});
  assert.equal(resultEmpty.title, "");
  assert.equal(resultEmpty.formattedDescription, "");

  const resultWhitespace = parseReporte("   \n\t  ");
  assert.deepEqual(resultWhitespace.fields, {});
  assert.equal(resultWhitespace.title, "");
  assert.equal(resultWhitespace.formattedDescription, "");
});

test("5. normalizeKey: Normaliza correctamente acentos, mayúsculas y caracteres especiales", () => {
  assert.equal(normalizeKey("Zona/OPT"), "zona_opt");
  assert.equal(normalizeKey("Posible causa:"), "posible_causa");
  assert.equal(normalizeKey("Dispositivos afectados"), "dispositivos_afectados");
  assert.equal(normalizeKey("Dirección de Conexión"), "direccion_de_conexion");
});

test("6. suggestCategory: Sugiere la categoría adecuada por palabras clave", () => {
  const categories = [
    { id: "cat-1", name: "Falla de Fibra Óptica" },
    { id: "cat-2", name: "Problemas de Cobertura WiFi" },
    { id: "cat-3", name: "Consulta de Facturación" },
  ];

  const matchWifi = suggestCategory("Sin conexión WiFi", "Señal inestable del router", categories);
  assert.equal(matchWifi?.id, "cat-2");

  const matchFibra = suggestCategory("Alarma LOS en la ONT", "Posible rotura de fibra en la OLT", categories);
  assert.equal(matchFibra?.id, "cat-1");
});
