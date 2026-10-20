/**
 * Normaliza una cadena eliminando marcas diacríticas/acentos y caracteres no alfanuméricos.
 * Ejemplo: "Á" -> "A", "é" -> "e", "ñ" -> "n"
 */
export const normalizeToAscii = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
};

/**
 * Extrae las iniciales de un nombre (Unicode-aware y normalizado a ASCII).
 * - Si es 1 palabra: las 2 primeras letras (ej. "Ana" -> "AN").
 * - Si son 2 o más palabras: primera letra de las dos primeras palabras (ej. "Carlos Pérez" -> "CP", "Ángel Rodríguez" -> "AR").
 */
export const getClientInitials = (value: string | null | undefined): string => {
  const words = (value || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  if (words.length === 1) {
    const letters = [...words[0]].filter((char) => /\p{L}/u.test(char));
    const twoChars = letters.slice(0, 2).join("");
    return normalizeToAscii(twoChars).toUpperCase();
  }

  const letters = words
    .slice(0, 2)
    .map((word) => [...word].find((char) => /\p{L}/u.test(char)))
    .filter((char): char is string => Boolean(char));

  return normalizeToAscii(letters.join("")).toUpperCase();
};

/**
 * Extrae exclusivamente los dígitos numéricos de un documento de identidad o cédula.
 * Ejemplo: "V-28.123.456" -> "28123456"
 */
export const extractCedulaDigits = (cedula: string | null | undefined): string => {
  if (!cedula) return "";
  return cedula.replace(/\D/g, "").trim();
};

/**
 * Autogenera la contraseña de acceso a la app móvil para un cliente.
 * Regla: Dígitos de la cédula + iniciales del cliente en mayúsculas.
 * Ejemplo: Cédula "28123456", Nombre "Carlos Pérez" -> "28123456CP"
 */
export const generateClientAppPassword = (
  cedula: string | null | undefined,
  name: string | null | undefined,
): string => {
  const digits = extractCedulaDigits(cedula);
  if (!digits) return "";

  const initials = getClientInitials(name);
  return `${digits}${initials}`;
};

/**
 * Normaliza una contraseña para comparación:
 * Extrae dígitos y letras mayúsculas eliminando guiones, espacios o prefijos.
 */
export const normalizePasswordForComparison = (rawPassword: string): string => {
  return normalizeToAscii(
    rawPassword
      .trim()
      .replace(/^V-?|^E-?|^J-?|^G-?/i, "")
  ).toUpperCase();
};

/**
 * Valida si la contraseña provista coincide con la contraseña autogenerada del cliente.
 * Es tolerante a mayúsculas/minúsculas en el teclado móvil y a prefijos V-.
 */
export const verifyClientAppPassword = (
  inputPassword: string | null | undefined,
  cedula: string | null | undefined,
  name: string | null | undefined,
): boolean => {
  if (!inputPassword?.trim()) return false;
  const expected = generateClientAppPassword(cedula, name);
  if (!expected) return false;

  const normalizedInput = normalizePasswordForComparison(inputPassword);
  const normalizedExpected = normalizePasswordForComparison(expected);

  return normalizedInput === normalizedExpected;
};
