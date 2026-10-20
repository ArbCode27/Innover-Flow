export const digitsOnly = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "");

export const last10Digits = (value: string | null | undefined) => {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.slice(-10);
};

export const phonesMatchLast10 = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const a = last10Digits(left);
  const b = last10Digits(right);
  return a.length >= 7 && a === b;
};
