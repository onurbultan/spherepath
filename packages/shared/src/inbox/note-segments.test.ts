import { describe, expect, it } from "vitest";
import { classifyInboxText, maskSensitiveInboxText } from "./inbox-item.js";
import { applyNoteSegmentsSchema, matchSegmentContact, orderedSegmentDecisions, segmentContactName, segmentKindFor, segmentNeedsReading, splitNoteIntoSegments, unappliedSegmentCount } from "./note-segments.js";

/** A real day from an advisor's notebook, kept verbatim because it is the case. */
const notebookPage = `2kişi Ayşe Murat zeytinler ikiz villa portföy aldık yetkili içmeler tarafında oturuyorlar altı dönüm bir tarlaları var içinde villa var iki tane oğulları var İzmir merkezde yaşıyor
2kişi Perihan. Murat komşu ayşe hanım Zeytinlerde oturuyorlar adam mühendismiş üç boyutlu printer var kite sörf malzemeleri satıyor
1kişi garip Akın ms 4 dönüm tarlası var yetki aldım portföy olarak normalde Bodrum'da yaşıyor

Yapılacaklar

Düğün salonu gurubu yaz
Gökhan adamına tarlanın durumunu yaz
Hüseyin elektrik mühendisi Çeşme altında arsa arıyor bir villalık

Portföy alma ihtimalin olanlar ve diğer notlar

Akın garip görüş
Odin Otel görüş
Şafak abi görüş`;

describe("cutting a notebook page into its items", () => {
  const segments = splitNoteIntoSegments(notebookPage);

  it("finds every item on the page and no headings among them", () => {
    expect(segments).toHaveLength(9);
    expect(segments.map((segment) => segment.text)).not.toContain("Yapılacaklar");
    expect(segments.map((segment) => segment.text)).not.toContain("Portföy alma ihtimalin olanlar ve diğer notlar");
  });

  it("keeps the last line of the page, which has no blank line after it", () => {
    expect(segments.at(-1)?.text).toBe("Şafak abi görüş");
  });

  it("does not mistake a long item that ends a paragraph for a heading", () => {
    const requirement = segments.find((segment) => segment.text.startsWith("Hüseyin"));
    expect(requirement).toBeDefined();
    expect(requirement?.heading).toBe("Yapılacaklar");
  });

  it("carries each heading down to the lines under it", () => {
    expect(segments.filter((segment) => segment.sectionIntent === "work")).toHaveLength(3);
    expect(segments.filter((segment) => segment.sectionIntent === "leads")).toHaveLength(3);
    expect(segments.filter((segment) => segment.sectionIntent === "none")).toHaveLength(3);
  });

  it("gives every item a stable identity so a review survives a reload", () => {
    expect(splitNoteIntoSegments(notebookPage).map((segment) => segment.id)).toEqual(segments.map((segment) => segment.id));
    expect(new Set(segments.map((segment) => segment.id)).size).toBe(segments.length);
  });

  it("leaves a single thought as the one item it always was", () => {
    const single = splitNoteIntoSegments("Ayşe Hanım aradı, salı günü tekrar arayacağım.");
    expect(single).toHaveLength(1);
    expect(single[0]?.heading).toBeNull();
  });

  it("returns nothing for an empty page", () => {
    expect(splitNoteIntoSegments("")).toEqual([]);
    expect(splitNoteIntoSegments("\n\n  \n")).toEqual([]);
  });

  it("survives masking, which must not flatten the page into one line", () => {
    const masked = maskSensitiveInboxText(notebookPage);
    expect(splitNoteIntoSegments(masked.text)).toHaveLength(9);
  });
});

describe("what a line under a heading is taken to be", () => {
  it("treats a plain line under a work heading as something to do", () => {
    expect(segmentKindFor("note", "work")).toBe("follow_up");
  });

  it("never lets a heading overrule what the line itself says", () => {
    expect(segmentKindFor("requirement", "work")).toBe("requirement");
    expect(segmentKindFor("property", "work")).toBe("property");
  });

  it("reads the buyer in a line written under Yapılacaklar", () => {
    const line = "Hüseyin elektrik mühendisi Çeşme altında arsa arıyor bir villalık";
    expect(segmentKindFor(classifyInboxText(line).kind, "work")).toBe("requirement");
  });

  it("leaves a lead line as a note rather than inventing work", () => {
    expect(segmentKindFor("note", "leads")).toBe("note");
  });
});

describe("choosing which items are worth a model reading", () => {
  it("does not pay a round trip to learn that a name and a verb are a name and a verb", () => {
    expect(segmentNeedsReading("note", "Şafak abi görüş")).toBe(false);
    expect(segmentNeedsReading("follow_up", "Düğün salonu gurubu yaz")).toBe(false);
  });

  it("reads the lines that carry a person, a property or a requirement", () => {
    expect(segmentNeedsReading("requirement", "Hüseyin elektrik mühendisi Çeşme altında arsa arıyor bir villalık")).toBe(true);
    expect(segmentNeedsReading("property", "Akın'ın 4 dönüm tarlası var, yetki aldım portföy olarak")).toBe(true);
  });
});

describe("finding the person a line is about", () => {
  const contacts = [
    { id: "c1", name: "Ayşe Yılmaz" },
    { id: "c2", name: "Akın Demir" },
    { id: "c3", name: "Şafak Kaya" },
    { id: "c4", name: null },
  ];

  it("matches a full name", () => {
    expect(matchSegmentContact("Akın Demir", contacts)?.id).toBe("c2");
  });

  it("matches a first name when only one contact carries it", () => {
    expect(matchSegmentContact("Ayşe", contacts)?.id).toBe("c1");
  });

  it("handles Turkish casing, where İ lowercases to i and I to ı", () => {
    expect(matchSegmentContact("AKIN DEMİR", contacts)?.id).toBe("c2");
    expect(matchSegmentContact("şafak kaya", contacts)?.id).toBe("c3");
  });

  it("finds nobody rather than the wrong person when a name is ambiguous", () => {
    const twoAyses = [...contacts, { id: "c5", name: "Ayşe Demir" }];
    expect(matchSegmentContact("Ayşe", twoAyses)).toBeNull();
  });

  it("does not guess from a fragment too short to identify anyone", () => {
    expect(matchSegmentContact("Ay", contacts)).toBeNull();
    expect(matchSegmentContact(null, contacts)).toBeNull();
  });

  it("reads the name off a lead line that has no model reading", () => {
    expect(segmentContactName({ analysis: null, text: "Şafak abi görüş" })).toBe("Şafak abi");
    expect(segmentContactName({ analysis: null, text: "Odin Otel görüş" })).toBe("Odin Otel");
  });
});

describe("approving a page of decisions at once", () => {
  const soon = Date.now() + 86_400_000;
  const person = (segmentId: string, fullName: string) => ({
    segmentId, action: "person" as const, opportunityType: null, recordInteraction: true, credits: [],
    contact: { fullName, phone: "", metAtPlace: "", source: "in_person" as const, role: "unknown" as const },
  });

  it("accepts several people from one page, which one note could never do", () => {
    const result = applyNoteSegmentsSchema.safeParse({
      inboxItemId: "note-1",
      decisions: [person("segment-1", "Ayşe Yılmaz"), person("segment-2", "Perihan Demir"), person("segment-3", "Akın Kaya")],
    });
    expect(result.success).toBe(true);
  });

  it("refuses two decisions for the same line", () => {
    const result = applyNoteSegmentsSchema.safeParse({
      inboxItemId: "note-1",
      decisions: [person("segment-1", "Ayşe Yılmaz"), person("segment-1", "Başka Kişi")],
    });
    expect(result.success).toBe(false);
  });

  it("lets a line attach to a person introduced by another line on the same page", () => {
    const result = applyNoteSegmentsSchema.safeParse({
      inboxItemId: "note-1",
      decisions: [
        person("segment-3", "Akın Kaya"),
        { segmentId: "segment-9", action: "follow_up", contactRef: { kind: "segment", segmentId: "segment-3" }, nextActionType: "call", nextActionAt: soon },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("refuses to attach a line to a person nobody is creating", () => {
    const result = applyNoteSegmentsSchema.safeParse({
      inboxItemId: "note-1",
      decisions: [
        { segmentId: "segment-9", action: "follow_up", contactRef: { kind: "segment", segmentId: "segment-3" }, nextActionType: "call", nextActionAt: soon },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("creates people before anything that names them", () => {
    const decisions = [
      { segmentId: "segment-9", action: "follow_up" as const, credits: [], contactRef: { kind: "segment" as const, segmentId: "segment-3" }, nextActionType: "call" as const, nextActionAt: soon },
      { segmentId: "segment-1", action: "skip" as const, credits: [] },
      person("segment-3", "Akın Kaya"),
    ];
    expect(orderedSegmentDecisions(decisions).map((decision) => decision.action)).toEqual(["person", "follow_up", "skip"]);
  });

  it("refuses a follow-up scheduled in the past", () => {
    const result = applyNoteSegmentsSchema.safeParse({
      inboxItemId: "note-1",
      decisions: [{ segmentId: "segment-1", action: "follow_up", contactRef: { kind: "existing", contactId: "c1" }, nextActionType: "call", nextActionAt: Date.now() - 86_400_000 }],
    });
    expect(result.success).toBe(false);
  });

  it("counts what is still waiting on the page", () => {
    const base = { text: "x", heading: null, sectionIntent: "none" as const, kind: "note" as const, analysis: null, matchedContactId: null, matchedContactName: null };
    expect(unappliedSegmentCount([
      { ...base, id: "segment-1", index: 0, appliedAt: 1 },
      { ...base, id: "segment-2", index: 1, appliedAt: null },
      { ...base, id: "segment-3", index: 2, appliedAt: null },
    ])).toBe(2);
  });
});
