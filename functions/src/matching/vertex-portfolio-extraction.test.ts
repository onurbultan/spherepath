import { describe, expect, it } from "vitest";
import { portfolioItemDraftSchema } from "../../../packages/shared/src/index.js";
import { normalizePortfolioExtraction } from "./vertex-portfolio-extraction.js";

describe("portfolio extraction normalization", () => {
  it("preserves explicit room, pool and parking facts omitted by the model", () => {
    const draft = portfolioItemDraftSchema.parse({
      source: "whatsapp_group",
      sourceAuthorName: null,
      headline: "Bostanlı kiralık daire",
      summary: "Kiralık daire",
      transactionType: "let",
      propertyType: "apartment",
      location: "Bostanlı",
      askingPrice: { amount: 43_000, currency: "TRY" },
      bedroomCount: null,
      livingRoomCount: null,
      areaM2: null,
      landAreaM2: null,
      features: [],
      attributes: [],
      authorizationType: "unknown",
      titleDeedType: "unknown",
      constructionAllowed: null,
      listingUrl: null,
    });
    const result = normalizePortfolioExtraction("Bostanlı'da 4+1, havuz ve otopark var.", draft);
    expect(result).toMatchObject({ bedroomCount: 4, livingRoomCount: 1 });
    expect(result.features).toEqual(expect.arrayContaining(["pool", "parking"]));
  });
});
