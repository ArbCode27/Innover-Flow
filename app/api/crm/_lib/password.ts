import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
};

export const verifyPassword = async (password: string, stored: string) => {
  if (!stored.startsWith("scrypt$")) {
    // Transitional support: a successful legacy login is immediately rehashed.
    const suppliedDigest = createHash("sha256").update(password).digest();
    const storedDigest = createHash("sha256").update(stored).digest();
    return {
      valid: timingSafeEqual(suppliedDigest, storedDigest),
      needsRehash: true,
    };
  }

  const [, saltValue, hashValue] = stored.split("$");
  if (!saltValue || !hashValue) return { valid: false, needsRehash: false };
  const expected = Buffer.from(hashValue, "base64url");
  const actual = (await scrypt(
    password,
    Buffer.from(saltValue, "base64url"),
    expected.length,
  )) as Buffer;
  return {
    valid: expected.length === actual.length && timingSafeEqual(expected, actual),
    needsRehash: false,
  };
};
