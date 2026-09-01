import { z } from "zod";
import type { Contact, ContactRole, ContactSource, TenantOwned } from "../domain/entities.js";
import { emptyVoicePropertyPreferences } from "../voice/voice-note.js";
import { nextActionTypes } from "../interactions/manual-interaction.js";

export const contactSources = [
  "in_person",
  "referral",
  "listing",
  "social",
  "door",
  "area",
  "address_book",
  "inbound_call",
  "other",
] as const satisfies readonly ContactSource[];

export const contactRoles = [
  "buyer",
  "seller",
  "tenant",
  "landlord",
  "investor",
  "peer",
  "information_source",
  "referral_source",
  "unknown",
] as const satisfies readonly ContactRole[];

export const contactSourceLabels: Record<ContactSource, string> = {
  in_person: "Yüz yüze",
  referral: "Referans",
  listing: "İlan",
  social: "Sosyal medya",
  door: "Kapı çalışması",
  area: "Bölge çalışması",
  address_book: "Rehber",
  inbound_call: "Gelen arama",
  other: "Diğer",
};

export const contactRoleLabels: Record<ContactRole, string> = {
  buyer: "Alıcı",
  seller: "Satıcı",
  tenant: "Kiracı",
  landlord: "Kiraya veren",
  investor: "Yatırımcı",
  peer: "Meslektaş",
  information_source: "Bilgi kaynağı",
  referral_source: "Referans kaynağı",
  unknown: "Henüz belirlenmedi",
};

export const contactDraftSchema = z.object({
  fullName: z.string().trim().min(2, "Ad veya tanımlayıcı en az 2 karakter olmalı.").max(120),
  phone: z.string().trim().max(30, "Telefon numarası en fazla 30 karakter olabilir."),
  metAtPlace: z.string().trim().max(160, "Tanışma yeri en fazla 160 karakter olabilir."),
  source: z.enum(contactSources),
  role: z.enum(contactRoles),
  nextActionType: z.enum(nextActionTypes).nullable().optional(),
  nextActionAt: z.number().int().positive().nullable().optional(),
}).superRefine((value, context) => {
  const type = value.nextActionType ?? null;
  const at = value.nextActionAt ?? null;
  if ((type === null) !== (at === null)) context.addIssue({ code: "custom", message: "İlk aksiyon ve zamanı birlikte seçilmeli.", path: [type === null ? "nextActionType" : "nextActionAt"] });
});

export type ContactDraft = z.infer<typeof contactDraftSchema>;

export function createContact(draft: ContactDraft, tenant: TenantOwned, now: number): Contact {
  const parsed = contactDraftSchema.parse(draft);

  return {
    ...tenant,
    phone: parsed.phone || null,
    // Deriving the lookup key needs a digest, which this package cannot reach;
    // the trusted API fills it in from `normalizePhone` before the contact is stored.
    phoneHash: null,
    fullName: parsed.fullName,
    label: null,
    metAtPlace: parsed.metAtPlace || null,
    metAt: now,
    source: parsed.source,
    roles: [parsed.role],
    relationship: {
      stage: "new",
      meaningfulTouchCount: 0,
      reciprocalTouchCount: 0,
      lastTouchAt: null,
      nextActionAt: parsed.nextActionAt ?? null,
      nextActionType: parsed.nextActionType ?? null,
      lastObjective: null,
      lastAskOutcome: null,
      referralCount: 0,
    },
    memory: {
      keyThingsToRemember: [],
      propertyPreferences: emptyVoicePropertyPreferences,
      propertySituations: [],
      updatedAt: null,
    },
    privacy: {
      purposes: { core_crm: { legalBasis: "legitimate_interest", startedAt: now } },
      noticeStatus: "pending",
      noticeAt: null,
      noticeMethod: null,
      noticeVersion: null,
      marketingConsent: "unknown",
      marketingConsentAt: null,
      marketingWithdrawnAt: null,
      marketingChannels: [],
      iysStatus: "unknown",
      iysCheckedAt: null,
      profilingObjection: false,
      deletionRequestedAt: null,
    },
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
