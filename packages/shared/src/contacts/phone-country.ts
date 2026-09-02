export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, used only to derive the flag. */
  code: string;
  /** Dialling code without the plus. */
  dialCode: string;
  name: string;
}

/**
 * Not every country, only the ones an Aegean office actually dials. A full list
 * costs a metadata bundle and buries Turkey behind two hundred neighbours; these
 * cover the diaspora and the foreign buyers who show up in practice, and any
 * number outside the list can still be typed with its own + prefix.
 */
export const phoneCountries: PhoneCountry[] = [
  { code: "TR", dialCode: "90", name: "Türkiye" },
  { code: "DE", dialCode: "49", name: "Almanya" },
  { code: "NL", dialCode: "31", name: "Hollanda" },
  { code: "GB", dialCode: "44", name: "Birleşik Krallık" },
  { code: "AT", dialCode: "43", name: "Avusturya" },
  { code: "BE", dialCode: "32", name: "Belçika" },
  { code: "FR", dialCode: "33", name: "Fransa" },
  { code: "CH", dialCode: "41", name: "İsviçre" },
  { code: "SE", dialCode: "46", name: "İsveç" },
  { code: "DK", dialCode: "45", name: "Danimarka" },
  { code: "NO", dialCode: "47", name: "Norveç" },
  { code: "RU", dialCode: "7", name: "Rusya" },
  { code: "UA", dialCode: "380", name: "Ukrayna" },
  { code: "IR", dialCode: "98", name: "İran" },
  { code: "IQ", dialCode: "964", name: "Irak" },
  { code: "IL", dialCode: "972", name: "İsrail" },
  { code: "US", dialCode: "1", name: "ABD" },
];

export const defaultPhoneCountry = phoneCountries[0]!;

/** Regional indicator symbols, so the flag needs no image asset. */
export function phoneCountryFlag(code: string): string {
  return code.toUpperCase().replace(/[A-Z]/gu, (char) => String.fromCodePoint(127_397 + char.charCodeAt(0)));
}

/**
 * Turkish subscriber numbers read as 3-3-2-2 once the country code is its own
 * field. Other countries vary too much to guess, so they fall back to threes,
 * which is still far easier to check than an unbroken run.
 */
export function formatNationalAsTyped(raw: string, dialCode: string): string {
  // A leading zero belongs to national dialling; with the code split out it is noise.
  const digits = raw.replace(/\D/gu, "").replace(/^0+/u, "").slice(0, 15);
  if (!digits) return "";
  const sizes = dialCode === defaultPhoneCountry.dialCode ? [3, 3, 2, 2] : [3, 3, 3, 3];
  const parts: string[] = [];
  let rest = digits;
  for (const size of sizes) {
    if (!rest) break;
    parts.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  if (rest) parts.push(rest);
  return parts.join(" ");
}

/** Builds the value a contact stores from the two halves of the field. */
export function joinPhone(dialCode: string, national: string): string {
  const digits = national.replace(/\D/gu, "").replace(/^0+/u, "");
  return digits ? `+${dialCode} ${formatNationalAsTyped(digits, dialCode)}` : "";
}

/**
 * Reads a stored contact back into the two halves. A number saved before the
 * field was split, or one from outside the list, still has to land somewhere
 * sensible: the longest matching dialling code wins, and anything unrecognised
 * is treated as a Turkish national number.
 */
export function splitPhone(stored: string | null | undefined): { dialCode: string; national: string } {
  const raw = stored?.trim() ?? "";
  if (!raw) return { dialCode: defaultPhoneCountry.dialCode, national: "" };
  const digits = raw.replace(/\D/gu, "").replace(/^00/u, "");

  if (raw.startsWith("+") || raw.trimStart().startsWith("00")) {
    const match = [...phoneCountries]
      .sort((left, right) => right.dialCode.length - left.dialCode.length)
      .find((country) => digits.startsWith(country.dialCode));
    if (match) {
      return { dialCode: match.dialCode, national: formatNationalAsTyped(digits.slice(match.dialCode.length), match.dialCode) };
    }
  }
  return { dialCode: defaultPhoneCountry.dialCode, national: formatNationalAsTyped(digits, defaultPhoneCountry.dialCode) };
}
