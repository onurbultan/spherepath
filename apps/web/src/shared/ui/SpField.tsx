"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * The form control layer. Every field on every screen comes from here, so its
 * height, border, focus ring and disabled state are decided in one place and a
 * new screen cannot introduce a slightly different input by accident.
 *
 * These are deliberately thin: they pass every native attribute through and add
 * only the shared class, so a call site keeps working exactly as the raw element
 * did and nothing has to be re-learned.
 */

function classes(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** Checkboxes and radios are their own thing and must not be stretched into fields. */
const controlTypes = new Set(["checkbox", "radio", "range", "file", "color", "hidden", "submit", "button", "reset", "image"]);

export function SpInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const bare = props.type ? controlTypes.has(props.type) : false;
  return <input {...props} className={classes(!bare && "sp-control", className)} />;
}

export function SpSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={classes("sp-control", className)}>{children}</select>;
}

export function SpTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classes("sp-control", className)} />;
}

/**
 * Label above, control below, with the optional-marker and error copy the forms
 * already use. Taking the label here keeps the two from drifting apart in the
 * way a hand-written <label> pair does.
 */
export function SpField({
  label,
  optional,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={classes("sp-field", className)} htmlFor={htmlFor}>
      <span className="sp-field-label">
        {label}
        {optional ? <span className="optional">isteğe bağlı</span> : null}
      </span>
      {children}
      {hint ? <small className="sp-field-hint">{hint}</small> : null}
      {error ? <small className="sp-field-error" role="alert">{error}</small> : null}
    </label>
  );
}
