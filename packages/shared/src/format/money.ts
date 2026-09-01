const groupSeparator = ".";
const maxDigits = 15;

/**
 * Property prices run to eight and nine figures, and an unbroken run of digits
 * is genuinely hard to read: 5500000 and 55000000 look alike at a glance and a
 * misread zero is a different deal. Grouping while the advisor types means the
 * number is checked as it is entered rather than after it is wrong.
 */
export function formatMoneyAsTyped(raw: string): string {
  const digits = raw.replace(/\D/gu, "").slice(0, maxDigits).replace(/^0+(?=\d)/u, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, groupSeparator);
}

/**
 * Reads a grouped field back to the plain number a command carries. Zero is a
 * real answer for a commission, so only an empty field is nothing; whether zero
 * is acceptable belongs to the schema that receives it.
 */
export function parseMoneyInput(raw: string): number | null {
  const digits = raw.replace(/\D/gu, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Puts a stored amount back into the field's own grouped form. */
export function moneyInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : formatMoneyAsTyped(String(value));
}
