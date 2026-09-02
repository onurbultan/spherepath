"use client";

import { useState } from "react";
import {
  defaultPhoneCountry,
  formatMoneyAsTyped,
  formatNationalAsTyped,
  joinPhone,
  phoneCountries,
  phoneCountryFlag,
  splitPhone,
} from "@spherepath/shared";

/**
 * Both fields re-group what the advisor typed rather than replacing it, so the
 * caret never jumps and a half-entered value stays editable. What they hand back
 * is still the single string the drafts already carry.
 */

export function PhoneField({
  value,
  onChange,
  autoFocus,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  id?: string;
}) {
  const parsed = splitPhone(value);
  // The dialling code lives in the stored value once a number exists; the local
  // choice only has to survive an empty field.
  const [pendingDialCode, setPendingDialCode] = useState(parsed.dialCode);
  const dialCode = value ? parsed.dialCode : pendingDialCode;

  return (
    <span className="phone-field">
      <span className="phone-field-country">
        <span aria-hidden className="phone-field-flag">
          {phoneCountryFlag(phoneCountries.find((country) => country.dialCode === dialCode)?.code ?? defaultPhoneCountry.code)}
        </span>
        <span className="phone-field-code">+{dialCode}</span>
        <select
          aria-label="Ülke kodu"
          onChange={(event) => {
            setPendingDialCode(event.target.value);
            onChange(joinPhone(event.target.value, parsed.national));
          }}
          value={dialCode}
        >
          {phoneCountries.map((country) => (
            <option key={country.code} value={country.dialCode}>
              {phoneCountryFlag(country.code)} +{country.dialCode} · {country.name}
            </option>
          ))}
        </select>
      </span>
      <input
        autoComplete="tel-national"
        autoFocus={autoFocus}
        className="phone-field-number"
        id={id}
        inputMode="tel"
        onChange={(event) => onChange(joinPhone(dialCode, formatNationalAsTyped(event.target.value, dialCode)))}
        placeholder="507 872 70 22"
        value={parsed.national}
      />
    </span>
  );
}

export function MoneyField({
  value,
  onChange,
  currency,
  id,
  placeholder = "0",
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Shown beside the field so grouped digits are never read as a bare number. */
  currency?: string;
  id?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <span className="money-field">
      <input
        id={id}
        inputMode="numeric"
        onChange={(event) => onChange(formatMoneyAsTyped(event.target.value))}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      {currency ? <span className="money-field-currency">{currency}</span> : null}
    </span>
  );
}
