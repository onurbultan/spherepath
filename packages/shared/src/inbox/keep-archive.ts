import { z } from "zod";
import { noteMaxLength } from "./inbox-item.js";

/**
 * Years of an advisor's working memory usually already exist -- in Google Keep,
 * written on the phone between viewings. Asking them to retype it is asking
 * them to abandon it, so a Takeout export is read as it is.
 *
 * Takeout hands out one JSON file per note. Parsing is deliberately done here,
 * as a pure function over already-read file text, so the same archive produces
 * the same notes on either platform and can be tested without a browser, a
 * network call or a model.
 */

/** One note as Keep wrote it, reduced to the parts a note page can carry. */
export interface KeepArchiveNote {
  title: string;
  text: string;
  /** Milliseconds; Takeout stores microseconds. */
  createdAt: number;
  editedAt: number;
  archived: boolean;
  trashed: boolean;
  pinned: boolean;
  labels: string[];
  /** Files Keep held that a text note cannot carry. */
  attachmentCount: number;
}

const keepListItemSchema = z.object({
  text: z.string().default(""),
  isChecked: z.boolean().default(false),
}).passthrough();

const keepNoteSchema = z.object({
  title: z.string().default(""),
  textContent: z.string().default(""),
  listContent: z.array(keepListItemSchema).default([]),
  isArchived: z.boolean().default(false),
  isTrashed: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  createdTimestampUsec: z.number().default(0),
  userEditedTimestampUsec: z.number().default(0),
  labels: z.array(z.object({ name: z.string().default("") }).passthrough()).default([]),
  attachments: z.array(z.unknown()).default([]),
}).passthrough();

/** Takeout counts from the epoch in microseconds; everything here is in milliseconds. */
function millisFromUsec(usec: number): number {
  return usec > 0 ? Math.round(usec / 1_000) : 0;
}

/**
 * A checklist is a note too. Keep stores it as items rather than lines, and an
 * advisor's checklist ("Ara: Melis", "Portföy fotoğrafı iste") is exactly the
 * kind of page this system is for, so it is flattened back into lines with the
 * ticks preserved -- a done item should not come back as work to do.
 */
function listContentText(items: readonly z.infer<typeof keepListItemSchema>[]): string {
  return items
    .map((item) => `${item.isChecked ? "[x]" : "[ ]"} ${item.text}`.trim())
    .filter((line) => line !== "[ ]" && line !== "[x]")
    .join("\n");
}

/** One Takeout JSON file, or null when the file is not a Keep note at all. */
export function parseKeepNote(fileContent: string): KeepArchiveNote | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fileContent);
  } catch {
    return null;
  }
  const parsed = keepNoteSchema.safeParse(raw);
  if (!parsed.success) return null;
  const note = parsed.data;
  const body = note.textContent.trim() || listContentText(note.listContent);
  const createdAt = millisFromUsec(note.createdTimestampUsec);
  return {
    title: note.title.trim(),
    text: body.trim(),
    createdAt,
    editedAt: millisFromUsec(note.userEditedTimestampUsec) || createdAt,
    archived: note.isArchived,
    trashed: note.isTrashed,
    pinned: note.isPinned,
    labels: note.labels.map((label) => label.name.trim()).filter(Boolean),
    attachmentCount: note.attachments.length,
  };
}

/** The note as one page of text: its title, then what was written under it. */
export function keepNoteText(note: KeepArchiveNote): string {
  const parts = [note.title, note.text].map((part) => part.trim()).filter(Boolean);
  const labels = note.labels.length ? `\n\nEtiketler: ${note.labels.join(", ")}` : "";
  const attachments = note.attachmentCount
    ? `\n\n(Keep'te bu notta ${note.attachmentCount} dosya vardı; metin olarak aktarılamaz.)`
    : "";
  return `${parts.join("\n\n")}${labels}${attachments}`.trim().slice(0, noteMaxLength);
}

export const keepSkipReasons = ["trashed", "empty", "duplicate", "unreadable"] as const;
export type KeepSkipReason = (typeof keepSkipReasons)[number];

export const keepSkipLabels: Record<KeepSkipReason, string> = {
  trashed: "Keep'te çöp kutusunda",
  empty: "Boş veya yalnızca dosya",
  duplicate: "Aynı not zaten listede",
  unreadable: "Keep notu olarak okunamadı",
};

export interface KeepImportEntry {
  /** The Takeout file this came from, so a skipped one can be found again. */
  fileName: string;
  note: KeepArchiveNote;
  text: string;
  /** Unset until the advisor chooses; archived notes start unselected. */
  selected: boolean;
}

export interface KeepImportSkip {
  fileName: string;
  reason: KeepSkipReason;
  title: string;
}

export interface KeepImportPlan {
  entries: KeepImportEntry[];
  skipped: KeepImportSkip[];
}

export interface KeepArchiveFile {
  name: string;
  content: string;
}

/**
 * Reads a whole Takeout folder into a list the advisor can look at before
 * anything is written. Nothing is imported by this function: an archive of a
 * thousand notes is a decision, not a side effect of choosing files.
 *
 * Notes Keep already threw away stay thrown away. Notes Keep archived are
 * carried but left unticked, because an archived note is one the advisor
 * deliberately put out of sight.
 */
export function planKeepImport(files: readonly KeepArchiveFile[]): KeepImportPlan {
  const entries: KeepImportEntry[] = [];
  const skipped: KeepImportSkip[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const note = parseKeepNote(file.content);
    if (!note) {
      skipped.push({ fileName: file.name, reason: "unreadable", title: file.name });
      continue;
    }
    const title = note.title || note.text.split("\n")[0]?.slice(0, 60) || file.name;
    if (note.trashed) {
      skipped.push({ fileName: file.name, reason: "trashed", title });
      continue;
    }
    // A note that held only a photo has nothing to bring across: the page
    // would arrive saying only that a file used to be attached to it, which is
    // not the advisor's writing and cannot be acted on.
    if (!note.title && !note.text) {
      skipped.push({ fileName: file.name, reason: "empty", title });
      continue;
    }
    const text = keepNoteText(note);
    // Takeout writes a note that was edited in two places twice, and people
    // re-export before they remember they already did.
    const fingerprint = `${note.createdAt}:${text}`;
    if (seen.has(fingerprint)) {
      skipped.push({ fileName: file.name, reason: "duplicate", title });
      continue;
    }
    seen.add(fingerprint);
    entries.push({ fileName: file.name, note, text, selected: !note.archived });
  }

  entries.sort((left, right) => right.note.createdAt - left.note.createdAt
    || left.fileName.localeCompare(right.fileName));
  return { entries, skipped };
}

/** How many notes an import would write, said the way the button should say it. */
export function keepImportSummary(plan: KeepImportPlan): string {
  const selected = plan.entries.filter((entry) => entry.selected).length;
  const archived = plan.entries.filter((entry) => entry.note.archived).length;
  const parts = [`${plan.entries.length} not okundu`];
  if (archived) parts.push(`${archived} tanesi Keep'te arşivliydi`);
  if (plan.skipped.length) parts.push(`${plan.skipped.length} not atlandı`);
  parts.push(`${selected} not aktarılacak`);
  return parts.join(" · ");
}

/** The batch size one call carries, kept small enough for a single transaction. */
export const keepImportBatchSize = 25;

const keepImportNoteSchema = z.object({
  text: z.string().trim().min(1).max(noteMaxLength),
  /** Preserved so an imported archive reads as history rather than as today. */
  createdAt: z.number().int().min(0).max(4_102_444_800_000),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
}).strict();

export const importKeepNotesSchema = z.object({
  notes: z.array(keepImportNoteSchema).min(1).max(keepImportBatchSize),
}).strict();
export type ImportKeepNotesInput = z.infer<typeof importKeepNotesSchema>;
export type KeepImportNoteInput = z.infer<typeof keepImportNoteSchema>;

/** Cuts the chosen entries into the batches the command accepts. */
export function keepImportBatches(plan: KeepImportPlan): KeepImportNoteInput[][] {
  const chosen = plan.entries.filter((entry) => entry.selected).map((entry) => ({
    text: entry.text,
    createdAt: entry.note.createdAt,
    pinned: entry.note.pinned,
    archived: entry.note.archived,
  }));
  const batches: KeepImportNoteInput[][] = [];
  for (let index = 0; index < chosen.length; index += keepImportBatchSize) {
    batches.push(chosen.slice(index, index + keepImportBatchSize));
  }
  return batches;
}
