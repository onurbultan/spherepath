import { z } from "zod";
import type { CurrencyCode } from "../domain/entities.js";

export const matchMessageRequestSchema = z.object({
  opportunityId: z.string().min(1).max(160).nullable().optional(),
  contactId: z.string().min(1).max(160),
  portfolioItemId: z.string().min(1).max(160),
}).strict();
export type MatchMessageRequest = z.infer<typeof matchMessageRequestSchema>;

export const matchMessageSources = ["ai", "template"] as const;
export type MatchMessageSource = (typeof matchMessageSources)[number];

export interface MatchMessageDraft {
  message: string;
  /** "template" means the model was unavailable or its answer was rejected. */
  source: MatchMessageSource;
}

export interface MatchMessageSubject {
  mismatchReasons?: string[];
  contactName: string;
  headline: string;
  location: string;
  askingPrice: { amount: number; currency: CurrencyCode } | null;
  listingUrl: string | null;
}

const money = (amount: number, currency: CurrencyCode): string =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

/**
 * The plain draft used when the model cannot be reached, and by the client before its
 * answer arrives. Kept in one place so the two never drift apart.
 */
export function buildMatchMessageFallback(subject: MatchMessageSubject): string {
  const price = subject.askingPrice ? ` Fiyatı ${money(subject.askingPrice.amount, subject.askingPrice.currency)}.` : "";
  const listing = subject.listingUrl ? ` İlan: ${subject.listingUrl}` : "";
  if (subject.mismatchReasons?.length) return `Merhaba ${subject.contactName}, aradığınız kriterlerden farklı bir alternatif var: ${subject.headline}. ${subject.location}.${price} ${subject.mismatchReasons.map((reason) => reason.replace(/\. Alternatif bölge; uyum puanı en fazla %\d+\./gu, ".")).join(" ")} Bu farklılıklara rağmen değerlendirmek ister misiniz?${listing}`;
  return `Merhaba ${subject.contactName}, arayışınıza uygun olabileceğini düşündüğüm bir portföy var: ${subject.headline}. ${subject.location}.${price}${listing}`;
}

export const maxMatchMessageLength = 700;
