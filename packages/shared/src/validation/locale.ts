import { z } from "zod";

/**
 * Zod's messages reach the screen. Without this a rejected price told the
 * advisor "Too small: expected number to be >0" -- English, and phrased for
 * whoever wrote the schema -- in a product that is otherwise entirely Turkish.
 * Configuring the locale once covers every schema in the codebase.
 */
z.config(z.locales.tr());

export const validationLocale = "tr" as const;
