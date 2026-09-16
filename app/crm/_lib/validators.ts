export const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

export const requireText = (value: string) => value.trim().length > 0;

export const normalizeText = (value: string) => value.trim();

export const normalizeOptionalText = (value: string, fallback: string) => {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
};
