import { z } from "zod";
import { contactDraftSchema } from "../contacts/contact-draft.js";
import { nextActionTypes } from "../interactions/manual-interaction.js";
import { opportunityTypes } from "../opportunities/opportunity-draft.js";
import { portfolioItemDraftSchema } from "../matching/portfolio-match.js";
import { voiceInsightsSchema } from "../voice/voice-note.js";
import type { InboxItemAnalysis, InboxItemKind } from "./inbox-item.js";

/**
 * A day's notebook page holds a dozen separate things: the couple whose twin
 * villa you just took on, the neighbour who turns out to be an engineer, three
 * people to write to, three doors to knock on. The reading that follows can
 * only ever describe one subject, so until the page is cut into its items,
 * eleven of the twelve are lost.
 *
 * The cut is deterministic and visible before anything is created. A typed
 * newline is a decision -- a wrapped paragraph is one line in a textarea, and
 * a line the advisor broke is a line they meant to break -- so the rule follows
 * the shape of the page rather than guessing at meaning.
 */

export type NoteSectionIntent = "work" | "leads" | "none";

export interface NoteSegment {
  /** Stable across re-readings of the same text, so a review survives a refresh. */
  id: string;
  text: string;
  /** The heading this line sat under, kept so the review can group what it shows. */
  heading: string | null;
  sectionIntent: NoteSectionIntent;
  /** Position in the note, for ordering a review the way the page reads. */
  index: number;
}

const headingMaxLength = 60;
const headingMaxWords = 8;
const segmentMinLength = 3;
const maxSegments = 40;

/** Headings an advisor actually writes above a list of things to do. */
const workHeading = /^(yapılacaklar|yapılacak|yapacaklarım|to\s?do|görevler|işler)\b/iu;
/** Headings above people or places worth approaching, which are not yet work. */
const leadsHeading = /(portföy alma|ihtimal|aday|görüşülecek|potansiyel|fırsat olabilecek|diğer notlar)/iu;

/**
 * A heading stands alone above what it introduces: blank line before it, blank
 * line after it, and something under that. Every one of those conditions is
 * load-bearing. Without the blank line before, a real item that happens to end
 * a paragraph -- "Hüseyin elektrik mühendisi Çeşme altında arsa arıyor" -- gets
 * read as a label and the buyer it names is thrown away. Without the content
 * after, the last line of the page disappears into a heading for nothing.
 */
function isHeading(lines: readonly string[], position: number): boolean {
  const line = lines[position]!;
  if (line.length > headingMaxLength) return false;
  if (line.split(/\s+/u).length > headingMaxWords) return false;
  if (/[.!?:,]$/u.test(line)) return false;
  if (!/\p{L}/u.test(line)) return false;
  const previous = position === 0 ? "" : lines[position - 1];
  if (previous !== "" && previous !== undefined) return false;
  if (lines[position + 1] !== "") return false;
  return lines.slice(position + 2).some((rest) => rest !== "");
}

function intentOf(heading: string | null): NoteSectionIntent {
  if (!heading) return "none";
  if (workHeading.test(heading)) return "work";
  if (leadsHeading.test(heading)) return "leads";
  return "none";
}

/**
 * Cuts a note into the items it actually contains. Blank lines and headings
 * organise the page; every other non-empty line is one item. A note that is a
 * single thought comes back as a single segment, which is what it always was.
 */
export function splitNoteIntoSegments(safeText: string): NoteSegment[] {
  const lines = safeText.replace(/\r\n?/gu, "\n").split("\n").map((line) => line.trim());
  const segments: NoteSegment[] = [];
  let heading: string | null = null;

  for (let position = 0; position < lines.length; position += 1) {
    const line = lines[position]!;
    if (!line) continue;
    if (isHeading(lines, position)) {
      heading = line;
      continue;
    }
    if (line.length < segmentMinLength) continue;
    if (segments.length >= maxSegments) break;
    segments.push({
      id: `segment-${segments.length + 1}`,
      text: line,
      heading,
      sectionIntent: intentOf(heading),
      index: segments.length,
    });
  }

  return segments;
}

/**
 * What a line under a heading is, before the model has read it. The heading is
 * a default and never an override: "Hüseyin elektrik mühendisi Çeşme altında
 * arsa arıyor" is a requirement even when it is written under "Yapılacaklar",
 * and treating the heading as the answer would bury the buyer it names.
 */
export function segmentKindFor(classifiedKind: InboxItemKind, intent: NoteSectionIntent): InboxItemKind {
  if (classifiedKind !== "note") return classifiedKind;
  if (intent === "work") return "follow_up";
  return classifiedKind;
}

/**
 * Whether a segment is worth a model reading of its own. "Şafak abi görüş" has
 * nothing in it to extract, and paying a round trip to find that out for every
 * line of a long page is how a note takes a minute to process.
 */
export function segmentNeedsReading(kind: InboxItemKind, text: string): boolean {
  if (text.length < 25) return false;
  return kind === "person" || kind === "property" || kind === "requirement";
}

/**
 * One item off the page, with whatever the system managed to understand about
 * it. `analysis` is null for a line plain enough to classify without asking a
 * model -- "Şafak abi görüş" is a visit to make, and there is nothing further
 * to read out of it.
 */
export interface NoteSegmentReading extends NoteSegment {
  kind: InboxItemKind;
  analysis: InboxItemAnalysis | null;
  /** A contact already in the workspace this line appears to name. */
  matchedContactId: string | null;
  matchedContactName: string | null;
  /** Set once this segment has produced a record, so it is never applied twice. */
  appliedAt: number | null;
}

/**
 * A lead line is a name and an instruction to yourself: "Odin Otel görüş",
 * "Şafak abi görüş". The instruction is the last word and is not part of who
 * the line is about, so it comes off before the name is read.
 */
const trailingInstruction = /\s+(görüş|görüşül|ara|aran|yaz|yazıl|uğra|git|sor|konuş|bak|hatırlat|çağır)\w*\s*$/iu;

/** The name a segment is about, from the reading or from the line itself. */
export function segmentContactName(reading: Pick<NoteSegmentReading, "analysis" | "text">): string | null {
  const read = reading.analysis?.insights.contactName?.trim();
  if (read) return read;
  const line = reading.text.replace(trailingInstruction, "").trim();
  const leading = line.match(/^([\p{Lu}][\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})/u)?.[1]?.trim();
  return leading && leading.length >= 2 ? leading : null;
}

/**
 * Whether the page still has items the advisor has not decided about. A page
 * where every line became a record, or was skipped, is finished work; one with
 * three names still sitting on it is not, however many records it produced.
 */
export function unappliedSegmentCount(segments: readonly NoteSegmentReading[]): number {
  return segments.filter((segment) => segment.appliedAt === null).length;
}

/**
 * Turkish casing is not the default one: İ lowercases to i and I to ı, and a
 * comparison that ignores this fails on exactly the names an advisor writes.
 */
function comparableName(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export interface ContactNameCandidate {
  id: string;
  name: string | null;
}

/**
 * Finds the person a line is about among the contacts the advisor already has.
 * This is a suggestion shown for confirmation, never a silent link, so it
 * prefers to find nothing over finding the wrong person: a name that matches
 * two contacts equally well matches neither, because picking one of them would
 * file a conversation against a stranger.
 */
export function matchSegmentContact(
  name: string | null,
  contacts: readonly ContactNameCandidate[],
): ContactNameCandidate | null {
  const needle = name ? comparableName(name) : "";
  if (needle.length < 3) return null;

  const exact = contacts.filter((contact) => contact.name && comparableName(contact.name) === needle);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  // "Ayşe" should find "Ayşe Yılmaz", but only when she is the only Ayşe.
  const partial = contacts.filter((contact) => {
    if (!contact.name) return false;
    const candidate = comparableName(contact.name);
    return candidate.startsWith(`${needle} `) || needle.startsWith(`${candidate} `);
  });
  return partial.length === 1 ? partial[0]! : null;
}

/**
 * A decision points at a contact either by id, for somebody already in the
 * workspace, or at another segment on the same page. The second form is what
 * makes one page work as one page: the line that took Akın's field on can name
 * Akın, who does not exist until the line above him is applied in the same
 * approval.
 */
export const segmentContactRefSchema = z.union([
  z.object({ kind: z.literal("existing"), contactId: z.string().trim().min(1).max(160) }).strict(),
  z.object({ kind: z.literal("segment"), segmentId: z.string().trim().min(1).max(60) }).strict(),
]);
export type SegmentContactRef = z.infer<typeof segmentContactRefSchema>;

const decisionBase = z.object({ segmentId: z.string().trim().min(1).max(60) });

export const noteSegmentDecisionSchema = z.discriminatedUnion("action", [
  decisionBase.extend({ action: z.literal("skip") }),
  decisionBase.extend({
    action: z.literal("person"),
    contact: contactDraftSchema,
    approvedInsights: voiceInsightsSchema.optional(),
    opportunityType: z.enum(opportunityTypes).nullable().default(null),
    /**
     * A line about somebody you spoke to is a conversation; a line about
     * somebody to go and see is not. Recording one that never happened would
     * put a touch on the relationship and a date in the history that nothing
     * backs, so the line's own section decides and the advisor can overrule it.
     */
    recordInteraction: z.boolean().default(true),
  }),
  decisionBase.extend({
    action: z.literal("requirement"),
    contactRef: segmentContactRefSchema,
    opportunityType: z.enum(opportunityTypes).refine((value) => value === "buyer_requirement" || value === "tenant_requirement"),
    nextActionType: z.enum(nextActionTypes),
    nextActionAt: z.number().int().positive(),
    approvedInsights: voiceInsightsSchema,
  }),
  decisionBase.extend({
    action: z.literal("portfolio"),
    contactRef: segmentContactRefSchema.nullable(),
    portfolio: portfolioItemDraftSchema,
  }),
  decisionBase.extend({
    action: z.literal("follow_up"),
    contactRef: segmentContactRefSchema,
    nextActionType: z.enum(nextActionTypes),
    nextActionAt: z.number().int().positive(),
  }),
]);
export type NoteSegmentDecision = z.infer<typeof noteSegmentDecisionSchema>;

export const applyNoteSegmentsSchema = z.object({
  inboxItemId: z.string().trim().min(1).max(160),
  decisions: z.array(noteSegmentDecisionSchema).min(1).max(maxSegments),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  const peopleCreatedHere = new Set(
    value.decisions.filter((decision) => decision.action === "person").map((decision) => decision.segmentId),
  );
  value.decisions.forEach((decision, position) => {
    if (seen.has(decision.segmentId)) {
      context.addIssue({ code: "custom", message: "Aynı satır için iki karar verilemez.", path: ["decisions", position, "segmentId"] });
    }
    seen.add(decision.segmentId);
    const ref = "contactRef" in decision ? decision.contactRef : null;
    if (ref?.kind === "segment" && !peopleCreatedHere.has(ref.segmentId)) {
      context.addIssue({
        code: "custom",
        message: "Bağlanmak istenen kişi bu onayda oluşturulmuyor.",
        path: ["decisions", position, "contactRef"],
      });
    }
    if ((decision.action === "requirement" || decision.action === "follow_up") && decision.nextActionAt < Date.now() - 60_000) {
      context.addIssue({ code: "custom", message: "Takip zamanı geçmişte olamaz.", path: ["decisions", position, "nextActionAt"] });
    }
    if (decision.action === "person" && decision.opportunityType !== null
      && (decision.contact.nextActionType == null || decision.contact.nextActionAt == null)) {
      context.addIssue({
        code: "custom",
        message: "Fırsat oluşturmak için ilk takip ve zamanı gerekli.",
        path: ["decisions", position, "contact", "nextActionAt"],
      });
    }
  });
});
export type ApplyNoteSegmentsInput = z.infer<typeof applyNoteSegmentsSchema>;

/**
 * People are created before anything that names them, so a portfolio line can
 * be attached to a person introduced two lines above it in the same approval.
 */
export function orderedSegmentDecisions(decisions: readonly NoteSegmentDecision[]): NoteSegmentDecision[] {
  const rank = (decision: NoteSegmentDecision) => decision.action === "person" ? 0 : decision.action === "skip" ? 2 : 1;
  return [...decisions].sort((left, right) => rank(left) - rank(right));
}

/**
 * A notebook has one page per day that you keep adding to, so the day is the
 * page's identity rather than the minute it happened to be started. Returns
 * the page already open for this day, if there is one.
 */
export function findDailyPage<T extends { dayKey?: string | null; archivedAt: number | null }>(
  items: readonly T[],
  dayKey: string,
): T | null {
  return items.find((item) => item.dayKey === dayKey && item.archivedAt === null) ?? null;
}
