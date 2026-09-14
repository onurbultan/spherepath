import { describe, expect, it } from "vitest";
import { propertyTypeLabels } from "../listings/listing-draft.js";
import {
  contactMemoryNotesSchema,
  createKnownProperty,
  firstSpecialCategoryRefusal,
  knownPropertyDraftSchema,
  knownPropertySummary,
  specialCategoryRefusal,
} from "./contact-memory.js";

describe("writing down what the advisor knows about a person", () => {
  it("keeps ordinary relationship knowledge exactly as written", () => {
    const result = contactMemoryNotesSchema.safeParse({
      contactId: "c1",
      keyThingsToRemember: [
        "Mühendis, üç boyutlu printer'ı var",
        "Kite sörf malzemesi satıyor",
        "Yat eğitmenliği yapmış, tekne konusunda mutlaka sor dedi",
        "Dünyayı gezmiş",
      ],
    });
    expect(result.success).toBe(true);
    expect(firstSpecialCategoryRefusal(result.success ? result.data.keyThingsToRemember : [])).toBeNull();
  });

  it("refuses special-category data rather than storing or silently stripping it", () => {
    expect(specialCategoryRefusal("Sağlık sorunu var, ameliyat olacak")).not.toBeNull();
    expect(specialCategoryRefusal("Hangi partiye oy verdiğini söyledi")).not.toBeNull();
    expect(specialCategoryRefusal("Sendika üyesi")).not.toBeNull();
  });

  it("names the first refusal so the advisor is told once and clearly", () => {
    const refusal = firstSpecialCategoryRefusal(["Mühendis", "Kanser tedavisi görüyor", "Tekne meraklısı"]);
    expect(refusal).toContain("Sağlık");
  });

  it("does not mistake everyday words that merely start like a sensitive one", () => {
    expect(specialCategoryRefusal("Hastaneye yakın bir ev arıyor")).toBeNull();
    expect(specialCategoryRefusal("Türkiye geneline yatırım yapıyor")).toBeNull();
  });
});

describe("writing down a property somebody owns", () => {
  const draft = {
    contactId: "c1",
    address: "Kadıovacık mevkii, 4 dönüm tarla",
    regionSlug: "Çeşme Altı",
    propertyType: "land" as const,
    roomCount: 4,
    areaM2: 4_000,
    features: [],
    note: "Annesine almış, şu an boş duruyor",
  };

  it("records the property without implying a mandate for it", () => {
    const property = createKnownProperty(knownPropertyDraftSchema.parse(draft), { officeId: "o1", ownerUid: "u1" }, 1_000);
    expect(property.ownerContactId).toBe("c1");
    expect(property.note).toBe("Annesine almış, şu an boş duruyor");
    expect(property).not.toHaveProperty("authorizationType");
    expect(property).not.toHaveProperty("askingPrice");
  });

  it("normalises the region the same way a listing does, so both match", () => {
    const property = createKnownProperty(knownPropertyDraftSchema.parse(draft), { officeId: "o1", ownerUid: "u1" }, 1_000);
    expect(property.regionSlug).toBe("çeşme-altı");
  });

  it("drops a room count on land, which cannot have rooms", () => {
    const property = createKnownProperty(knownPropertyDraftSchema.parse(draft), { officeId: "o1", ownerUid: "u1" }, 1_000);
    expect(property.roomCount).toBeNull();
  });

  it("keeps a room count on a home", () => {
    const home = createKnownProperty(
      knownPropertyDraftSchema.parse({ ...draft, propertyType: "villa", areaM2: 220 }),
      { officeId: "o1", ownerUid: "u1" },
      1_000,
    );
    expect(home.roomCount).toBe(4);
  });

  it("refuses special-category data in the note", () => {
    const result = knownPropertyDraftSchema.safeParse({ ...draft, note: "Sağlık sorunu yüzünden satıyor" });
    expect(result.success).toBe(false);
  });

  it("reads back as a line somebody can scan", () => {
    const property = createKnownProperty(
      knownPropertyDraftSchema.parse({ ...draft, propertyType: "villa", regionSlug: "Bodrum", areaM2: 220 }),
      { officeId: "o1", ownerUid: "u1" },
      1_000,
    );
    expect(knownPropertySummary(property, propertyTypeLabels)).toBe("bodrum · Villa · 4 oda · 220 m²");
  });
});
