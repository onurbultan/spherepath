import { describe, expect, it } from "vitest";
import type { PropertyPreferences } from "../domain/entities.js";
import { portfolioItemDraftSchema, scorePortfolioItem, type PortfolioItemDraft } from "./portfolio-match.js";

const demand: PropertyPreferences = {
  transactionType: "buy",
  propertyTypes: ["land"],
  preferredLocations: ["Urla civarı"],
  budgetRange: { min: null, max: 5_000_000, currency: "TRY" },
  bedroomCountMin: null,
  livingRoomCountMin: null,
  roomCountMin: null,
  areaMinM2: 500,
  areaMaxM2: null,
  mustHaves: ["Tapulu olacak", "Ev yapmaya uygun"],
  dealBreakers: [],
  timeline: null,
};

const item: PortfolioItemDraft = {
  source: "whatsapp_group",
  sourceAuthorName: "Kaan",
  headline: "Kadıovacık'ta ev yapmaya uygun arsa",
  summary: "Köy içi imar sınırında 620 m² hisse tapulu arsa.",
  transactionType: "sell",
  propertyType: "land",
  location: "Kadıovacık, Urla",
  askingPrice: { amount: 4_800_000, currency: "TRY" },
  bedroomCount: null,
  livingRoomCount: null,
  areaM2: null,
  landAreaM2: 620,
  features: [],
  attributes: ["Köy içi imar sınırında"],
  authorizationType: "none",
  titleDeedType: "shared",
  constructionAllowed: true,
  listingUrl: "https://example.com/ilan/1",
};

describe("portfolio matching", () => {
  it("matches Kaan's Urla portfolio with Arzu's requirement", () => {
    expect(portfolioItemDraftSchema.parse(item)).toEqual(item);
    const result = scorePortfolioItem(demand, item);
    expect(result.eligible).toBe(true);
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBe(result.coverage);
    expect(result.coverage).toBeGreaterThanOrEqual(85);
    expect(result.reasons.find((reason) => reason.key === "location")?.status).toBe("match");
    expect(result.reasons.find((reason) => reason.key === "must_have")?.status).toBe("match");
  });

  it("rejects items over budget", () => {
    const result = scorePortfolioItem(demand, { ...item, askingPrice: { amount: 5_500_000, currency: "TRY" } });
    expect(result.eligible).toBe(false);
    expect(result.reasons.find((reason) => reason.key === "budget")?.status).toBe("mismatch");
  });

  it("does not reject a candidate when a portfolio fact is unknown", () => {
    const result = scorePortfolioItem(demand, { ...item, titleDeedType: "unknown", constructionAllowed: null });
    expect(result.eligible).toBe(true);
    expect(result.reasons.find((reason) => reason.key === "must_have")?.status).toBe("unknown");
    expect(result.coverage).toBeLessThan(100);
    expect(result.score).toBe(result.coverage);
  });

  it("rejects obsolete transaction and location combinations", () => {
    const result = scorePortfolioItem(demand, { ...item, transactionType: "let", location: "Çeşme" });
    expect(result.eligible).toBe(false);
    expect(result.reasons.filter((reason) => reason.status === "mismatch").map((reason) => reason.key)).toEqual(expect.arrayContaining(["transaction", "location"]));
  });

  it("does not claim a deal-breaker match when absence cannot be proven", () => {
    const result = scorePortfolioItem({ ...demand, dealBreakers: ["Ana yola cepheli"] }, item);
    expect(result.eligible).toBe(true);
    expect(result.reasons.find((reason) => reason.key === "deal_breaker")?.status).toBe("unknown");
    expect(result.score).toBeLessThan(100);
  });

  it("recognizes an explicitly negated road-frontage deal-breaker", () => {
    const result = scorePortfolioItem(
      { ...demand, dealBreakers: ["Ana yola cepheli"] },
      { ...item, attributes: [...item.attributes, "Ana yola cepheli değil"] },
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons.find((reason) => reason.key === "deal_breaker")?.status).toBe("match");
  });
});
