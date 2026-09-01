"use client";

import { formatMoneyAsTyped, formatPhoneAsTyped } from "@spherepath/shared";

/**
 * Both fields keep the advisor's own text as the source of truth and only
 * re-group it, so the caret never jumps and a half-typed value stays editable.
 * What they store is still the plain string the drafts already expect.
 */

export function PhoneField({
  value,
  onChange,
  autoFocus,
  id,
  placeholder = "0532 123 45 67",
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  id?: string;
  placeholder?: string;
}) {
  return (
    <input
      autoComplete="tel"
      autoFocus={autoFocus}
      id={id}
      inputMode="tel"
      onChange={(event) => onChange(formatPhoneAsTyped(event.target.value))}
      placeholder={placeholder}
      value={value}
    />
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
  /** Shown beside the field so the grouped digits are never read as a bare number. */
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
