import { describe, expect, it } from "vitest";
import {
  importKeepNotesSchema,
  keepImportBatchSize,
  keepImportBatches,
  keepImportSummary,
  keepNoteText,
  parseKeepNote,
  planKeepImport,
} from "./keep-archive.js";

const usec = (iso: string) => new Date(iso).getTime() * 1_000;

function keepFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    color: "DEFAULT",
    isTrashed: false,
    isPinned: false,
    isArchived: false,
    title: "",
    textContent: "",
    userEditedTimestampUsec: usec("2024-03-02T09:00:00Z"),
    createdTimestampUsec: usec("2024-03-01T09:00:00Z"),
    ...overrides,
  });
}

describe("reading one Keep note out of Takeout", () => {
  it("keeps the note's own dates rather than the moment it was imported", () => {
    const note = parseKeepNote(keepFile({ textContent: "Melis Şaşmaz aradı." }))!;
    expect(new Date(note.createdAt).toISOString()).toBe("2024-03-01T09:00:00.000Z");
    expect(new Date(note.editedAt).toISOString()).toBe("2024-03-02T09:00:00.000Z");
  });

  it("falls back to the created date when Keep never recorded an edit", () => {
    const note = parseKeepNote(keepFile({ textContent: "Kısa not", userEditedTimestampUsec: 0 }))!;
    expect(note.editedAt).toBe(note.createdAt);
  });

  it("flattens a checklist into lines and keeps the ticks", () => {
    const note = parseKeepNote(keepFile({
      listContent: [
        { text: "Melis'i ara", isChecked: true },
        { text: "Portföy fotoğrafı iste", isChecked: false },
        { text: "   ", isChecked: false },
      ],
    }))!;
    expect(note.text).toBe("[x] Melis'i ara\n[ ] Portföy fotoğrafı iste");
  });

  it("puts the title above the body and names the files it cannot carry", () => {
    const note = parseKeepNote(keepFile({
      title: "Urla gezisi",
      textContent: "Deniz manzaralı 3+1",
      labels: [{ name: "Portföy" }, { name: "" }],
      attachments: [{ filePath: "a.jpg" }, { filePath: "b.jpg" }],
    }))!;
    expect(keepNoteText(note)).toBe(
      "Urla gezisi\n\nDeniz manzaralı 3+1\n\nEtiketler: Portföy\n\n(Keep'te bu notta 2 dosya vardı; metin olarak aktarılamaz.)",
    );
  });

  it("returns null for a file that is not a Keep note", () => {
    expect(parseKeepNote("not json at all")).toBeNull();
    expect(parseKeepNote(JSON.stringify([1, 2, 3]))).toBeNull();
  });
});

describe("planning an archive import", () => {
  const files = [
    { name: "eski.json", content: keepFile({ textContent: "Eski not", createdTimestampUsec: usec("2023-01-01T00:00:00Z") }) },
    { name: "yeni.json", content: keepFile({ textContent: "Yeni not", createdTimestampUsec: usec("2025-01-01T00:00:00Z") }) },
    { name: "cop.json", content: keepFile({ textContent: "Silinmiş", isTrashed: true }) },
    { name: "bos.json", content: keepFile({ attachments: [{ filePath: "a.jpg" }] }) },
    { name: "bozuk.json", content: "{" },
  ];

  it("shows the newest note first and leaves out what Keep already threw away", () => {
    const plan = planKeepImport(files);
    expect(plan.entries.map((entry) => entry.fileName)).toEqual(["yeni.json", "eski.json"]);
    expect(plan.skipped.map((skip) => [skip.fileName, skip.reason])).toEqual([
      ["cop.json", "trashed"],
      ["bos.json", "empty"],
      ["bozuk.json", "unreadable"],
    ]);
  });

  it("carries an archived note but does not tick it, because it was put away on purpose", () => {
    const plan = planKeepImport([
      { name: "a.json", content: keepFile({ textContent: "Görünür", isArchived: false }) },
      { name: "b.json", content: keepFile({ textContent: "Arşivli", isArchived: true }) },
    ]);
    expect(plan.entries.map((entry) => [entry.text, entry.selected])).toEqual([
      ["Görünür", true],
      ["Arşivli", false],
    ]);
  });

  it("writes the same note once when the export holds it twice", () => {
    const content = keepFile({ textContent: "Aynı not" });
    const plan = planKeepImport([{ name: "a.json", content }, { name: "b.json", content }]);
    expect(plan.entries).toHaveLength(1);
    expect(plan.skipped[0]).toMatchObject({ fileName: "b.json", reason: "duplicate" });
  });

  it("says what an import would do before it does it", () => {
    const plan = planKeepImport(files);
    expect(keepImportSummary(plan)).toBe("2 not okundu · 3 not atlandı · 2 not aktarılacak");
  });
});

describe("handing the plan to the command", () => {
  it("sends only the ticked notes, in batches the command accepts", () => {
    const plan = planKeepImport(Array.from({ length: keepImportBatchSize + 3 }, (_, index) => ({
      name: `n${index}.json`,
      content: keepFile({ textContent: `Not ${index}`, createdTimestampUsec: usec("2024-01-01T00:00:00Z") + index }),
    })));
    plan.entries[0]!.selected = false;

    const batches = keepImportBatches(plan);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(keepImportBatchSize);
    expect(batches.flat()).toHaveLength(keepImportBatchSize + 2);
    for (const batch of batches) expect(importKeepNotesSchema.safeParse({ notes: batch }).success).toBe(true);
  });

  it("refuses a batch larger than one call carries", () => {
    const notes = Array.from({ length: keepImportBatchSize + 1 }, () => ({ text: "x", createdAt: 0, pinned: false, archived: false }));
    expect(importKeepNotesSchema.safeParse({ notes }).success).toBe(false);
  });

  it("refuses an empty note rather than writing a blank page", () => {
    expect(importKeepNotesSchema.safeParse({ notes: [{ text: "   ", createdAt: 0, pinned: false, archived: false }] }).success).toBe(false);
  });
});
