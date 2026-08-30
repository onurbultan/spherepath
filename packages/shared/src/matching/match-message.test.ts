import { describe, expect, it } from "vitest";
import { buildMatchMessageFallback, matchMessageRequestSchema, maxMatchMessageLength } from "./match-message";

const subject = {
  contactName: "Ayşe Kaya",
  headline: "Moda'da 3+1 bahçeli daire",
  location: "Moda, Kadıköy",
  askingPrice: { amount: 8_400_000, currency: "TRY" as const },
  listingUrl: "https://example.com/ilan/7",
};

describe("match message fallback", () => {
  it("names the contact, the property and the price", () => {
    const message = buildMatchMessageFallback(subject);
    expect(message).toContain("Ayşe Kaya");
    expect(message).toContain("Moda'da 3+1 bahçeli daire");
    expect(message).toContain("8.400.000");
    expect(message).toContain("https://example.com/ilan/7");
  });

  it("leaves out the price and the link when they are unknown", () => {
    const message = buildMatchMessageFallback({ ...subject, askingPrice: null, listingUrl: null });
    expect(message).not.toContain("Fiyatı");
    expect(message).not.toContain("İlan:");
  });

  it("stays inside the length the model is also held to", () => {
    expect(buildMatchMessageFallback(subject).length).toBeLessThanOrEqual(maxMatchMessageLength);
  });

  it("accepts only a contact and a portfolio item", () => {
    expect(matchMessageRequestSchema.safeParse({ contactId: "c1", portfolioItemId: "p1" }).success).toBe(true);
    expect(matchMessageRequestSchema.safeParse({ contactId: "c1", portfolioItemId: "p1", message: "hack" }).success).toBe(false);
  });
});
