const turkishCountryCode = "90";
const turkishSubscriberLength = 10;
const minInternationalDigits = 8;
const maxInternationalDigits = 15;

/**
 * Turkish subscriber numbers are ten digits after the country code, and advisors
 * type them every way a phone will accept: with a leading zero, with +90, with
 * 0090, or bare after pasting from a message. Everything has to collapse onto one
 * value, because an inbound call arrives as E.164 and has to match the contact
 * that was saved by hand months earlier.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/gu, "");
  if (!digits) return null;

  const subscriber = turkishSubscriber(digits, hasPlus);
  if (subscriber) return `+${turkishCountryCode}${subscriber}`;

  // A number that announced itself as Turkish but did not parse is malformed
  // rather than foreign, so it must not fall through to the international branch.
  if (digits.startsWith(turkishCountryCode) || digits.startsWith(`00${turkishCountryCode}`)) return null;

  // Only an explicit + carries enough information to keep a foreign number;
  // anything else is too ambiguous to guess a country for.
  if (hasPlus && digits.length >= minInternationalDigits && digits.length <= maxInternationalDigits) {
    return `+${digits}`;
  }
  return null;
}

function turkishSubscriber(digits: string, hasPlus: boolean): string | null {
  const length = turkishSubscriberLength;
  const prefixed = `00${turkishCountryCode}`;
  let subscriber: string | null = null;

  if (digits.startsWith(prefixed) && digits.length === length + prefixed.length) {
    subscriber = digits.slice(prefixed.length);
  } else if (digits.startsWith(turkishCountryCode) && digits.length === length + turkishCountryCode.length) {
    subscriber = digits.slice(turkishCountryCode.length);
  } else if (!hasPlus && digits.startsWith("0") && digits.length === length + 1) {
    subscriber = digits.slice(1);
  } else if (!hasPlus && digits.length === length) {
    subscriber = digits;
  }

  return subscriber && !subscriber.startsWith("0") ? subscriber : null;
}
