import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCedulaDigits,
  generateClientAppPassword,
  verifyClientAppPassword,
} from "./client-auth-utils.ts";

describe("client-auth-utils", () => {
  it("extrae dígitos de cédula correctamente", () => {
    assert.equal(extractCedulaDigits("V-28.123.456"), "28123456");
    assert.equal(extractCedulaDigits("E-84000111"), "84000111");
    assert.equal(extractCedulaDigits("12345678"), "12345678");
    assert.equal(extractCedulaDigits("  V 30.999.888 "), "30999888");
    assert.equal(extractCedulaDigits(""), "");
    assert.equal(extractCedulaDigits(null), "");
  });

  it("autogenera la contraseña con cédula e iniciales", () => {
    assert.equal(generateClientAppPassword("28123456", "Carlos Pérez"), "28123456CP");
    assert.equal(generateClientAppPassword("V-19876543", "María Elena Gómez"), "19876543ME");
    assert.equal(generateClientAppPassword("12345678", "Ana"), "12345678AN");
    assert.equal(generateClientAppPassword("V-30111222", "Ángel Rodríguez"), "30111222AR");
    assert.equal(generateClientAppPassword("", "Carlos"), "");
  });

  it("valida la contraseña correctamente con tolerancia móvil", () => {
    const cedula = "V-28.123.456";
    const name = "Carlos Pérez";

    // Coincidencia exacta
    assert.equal(verifyClientAppPassword("28123456CP", cedula, name), true);

    // Minúsculas habituales en teclado móvil
    assert.equal(verifyClientAppPassword("28123456cp", cedula, name), true);

    // Con prefijo V
    assert.equal(verifyClientAppPassword("V28123456CP", cedula, name), true);
    assert.equal(verifyClientAppPassword("V-28123456cp", cedula, name), true);

    // Contraseña incorrecta
    assert.equal(verifyClientAppPassword("wrongpass", cedula, name), false);
    assert.equal(verifyClientAppPassword("28123456XX", cedula, name), false);
    assert.equal(verifyClientAppPassword("", cedula, name), false);
    assert.equal(verifyClientAppPassword(null, cedula, name), false);
  });
});
