import { afterAll, beforeAll, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc, updateDoc, writeBatch, Timestamp } from "firebase/firestore";

const projectId = "spherepath-96ecd";
const runId = `advisor-${Date.now()}`;
const app = initializeApp({ apiKey: "demo-key", projectId, authDomain: `${projectId}.firebaseapp.com` }, runId);
const auth = getAuth(app); const functions = getFunctions(app, "europe-west8");
let environment: RulesTestEnvironment;
let sequence = 0;
async function call<T = Record<string, unknown>>(endpoint: string, data: unknown, commandId?: string): Promise<T> {
  return (await httpsCallable(functions, endpoint)({ data, requestId: `${runId}-${++sequence}`, ...(commandId ? { commandId: `${runId}-${commandId}` } : {}) })).data as T;
}
beforeAll(async () => {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  environment = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8080 } });
});
afterAll(async () => { await Promise.all([deleteApp(app), environment.cleanup()]); });

it("keeps the entire land negotiation, action ownership, matching and settings consistent", async () => {
  const credential = await createUserWithEmailAndPassword(auth, `${runId}@example.test`, "Test-Advisor-2026!");
  const workspace = await call<{ officeId: string }>("bootstrapWorkspace", { displayName: "Senaryo danışmanı" }, "bootstrap");
  await credential.user.getIdToken(true);
  const now = Date.now(); const day = 86_400_000;
  const noon = new Date(now + day); noon.setHours(12, 0, 0, 0);
  const seller = (await call<{ contact: { id: string } }>("createContact", { fullName: "Anıl Emene", phone: "", source: "in_person", metAtPlace: "", role: "seller", nextActionType: "call", nextActionAt: now + day * 2 }, "seller")).contact;
  const buyer = (await call<{ contact: { id: string } }>("createContact", { fullName: "Melis Şaşmaz", phone: "", source: "in_person", metAtPlace: "", role: "buyer" }, "buyer")).contact;
  const listing = (await call<{ listing: { id: string; status: string; acquiredAt: number } }>("importExistingListing", { ownerContactId: seller.id, opportunityType: "seller_listing", address: "Kadıovacık 620 m² arsa", regionSlug: "Kadıovacık", propertyType: "land", roomCount: null, areaM2: 620, features: [], authorizationType: "verbal", askingPrice: 5_000_000, currency: "TRY", expiresAt: null, acquiredAt: now - 3 * day }, "listing")).listing;
  expect(listing.status).toBe("preparing"); expect(listing.acquiredAt).toBe(now - 3 * day);
  const preferences = { transactionType: "buy", propertyTypes: ["land"], preferredLocations: ["Kadıovacık"], budgetRange: null, bedroomCountMin: null, livingRoomCountMin: null, roomCountMin: null, areaMinM2: null, areaMaxM2: null, mustHaves: [], dealBreakers: [], timeline: null };
  const demand = (await call<{ opportunity: { id: string } }>("createOpportunity", { subjectContactId: buyer.id, type: "buyer_requirement", criteria: preferences, nextActionType: "appointment", nextActionAt: noon.getTime() }, "demand")).opportunity;
  const second = (await call<{ opportunity: { id: string } }>("createOpportunity", { subjectContactId: buyer.id, type: "buyer_requirement", criteria: { ...preferences, propertyTypes: ["apartment"] }, nextActionType: "call", nextActionAt: now + 2 * day }, "second-demand")).opportunity;
  const matches = await call<{ matches: { opportunityId: string }[]; nearMisses: { opportunityId: string; portfolioItem: { sourceListingId: string; landAreaM2: number }; softMismatchKeys: string[] }[] }>("listPortfolioMatches", undefined);
  expect(matches.nearMisses).toEqual(expect.arrayContaining([expect.objectContaining({ opportunityId: demand.id, softMismatchKeys: [], portfolioItem: expect.objectContaining({ sourceListingId: listing.id, landAreaM2: 620 }) })]));
  expect([...matches.matches, ...matches.nearMisses].some((match) => match.opportunityId === second.id)).toBe(false);
  await expect(call("createPresentation", { listingId: listing.id, contactId: buyer.id, message: "Portföy sunumu", channel: "whatsapp" }, "blocked-presentation")).rejects.toThrow();
  const dealInput = { listingId: listing.id, buyerContactId: buyer.id, buyerOpportunityId: demand.id, source: "direct_inquiry", sourceNote: "Alıcı arsaya talip", occurredAt: now - day, nextActionType: "appointment", nextActionAt: noon.getTime() };
  await expect(call("createDeal", { ...dealInput, buyerOpportunityId: null }, "ambiguous-deal")).rejects.toThrow("birden fazla");
  const created = await call<{ dealId: string }>("createDeal", dealInput, "deal");
  expect(await call("createDeal", dealInput, "deal")).toEqual(created);
  const interaction = { contactId: buyer.id, channel: "phone", objective: "offer", direction: "mutual", outcome: "Alıcı 4.500.000 TL teklif etti", askOutcome: "positive", noteSummary: "", occurredAt: now - day, nextActionType: "appointment", nextActionAt: noon.getTime(), nextActionContactId: buyer.id, dealId: created.dealId, dealOffer: { party: "buyer", amount: 4_500_000, currency: "TRY" } };
  const first = await call("recordInteraction", interaction, "offer");
  expect(await call("recordInteraction", interaction, "offer")).toEqual(first);
  const counter = { ...interaction, contactId: seller.id, outcome: "4.500.000 TL iletildi; satıcı 4.800.000 TL karşı teklif verdi. Melis ile öğlen görüşme planlanacak.", occurredAt: now, dealOffer: { party: "seller", amount: 4_800_000, currency: "TRY" } };
  await call("recordInteraction", counter, "counter"); await call("recordInteraction", counter, "counter");
  const overview = await call<{ deals: { id: string; stage: string; actualAmount: null; offers: { party: string; amount: number; previousOfferId: string | null; id: string }[]; nextActionAt: number }[] }>("getClosingOverview", undefined);
  const deal = overview.deals.find((item) => item.id === created.dealId)!;
  expect(deal.stage).toBe("offer"); expect(deal.actualAmount).toBeNull(); expect(deal.nextActionAt).toBe(noon.getTime());
  expect(deal.offers.map((offer) => [offer.party, offer.amount])).toEqual([["buyer", 4_500_000], ["seller", 4_800_000]]);
  expect(deal.offers[1]?.previousOfferId).toBe(deal.offers[0]?.id);
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const sellerRecord = (await getDoc(doc(db, "contacts", seller.id))).data()!;
    expect(sellerRecord.relationship.nextActionType).toBe("call");
    expect(sellerRecord.relationship.nextActionAt.toMillis()).toBe(now + day * 2);
    const storedListing = (await getDoc(doc(db, "listings", listing.id))).data()!;
    expect(storedListing.askingPrice).toBe(5_000_000); expect(storedListing.status).toBe("preparing");
    expect(storedListing.readinessEvidence.processingBasis).toBe("pending");
  });
  await call("updateOpportunityCriteria", { opportunityId: demand.id, preferences: { ...preferences, budgetRange: { min: null, max: 5_000_000, currency: "TRY" } } }, "criteria");
  const notices = await call<{ notifications: { id: string; match: { opportunityId: string } }[] }>("listMatchNotifications", undefined);
  expect(notices.notifications.some((item) => item.match.opportunityId === demand.id)).toBe(true);
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const notice = (await getDoc(doc(db, "matchNotifications", notices.notifications[0]!.id))).data()!;
    expect(notice.ownerUid).toBe(credential.user.uid); expect(notice.officeId).toBe(workspace.officeId);
    await updateDoc(doc(db, "opportunities", demand.id), { stage: "lost", closedAt: Timestamp.now() });
  });
  const closedMatches = await call<{ matches: { opportunityId: string }[]; nearMisses: { opportunityId: string }[] }>("listPortfolioMatches", undefined);
  expect([...closedMatches.matches, ...closedMatches.nearMisses].some((item) => item.opportunityId === demand.id)).toBe(false);
  const settings = await call("getWorkspaceSettings", undefined);
  const preview = await call<{ enabled: boolean; total: number; snapshotToken: string }>("previewTestWorkspaceReset", undefined);
  expect(preview.enabled).toBe(true); expect(preview.total).toBeGreaterThan(10);
  const reset = await call("resetTestWorkspace", { snapshotToken: preview.snapshotToken }, "reset");
  expect(await call("resetTestWorkspace", { snapshotToken: preview.snapshotToken }, "reset")).toEqual(reset);
  expect(await call("getWorkspaceSettings", undefined)).toEqual(settings);
  expect((await call<{ contacts: unknown[] }>("listContacts", {})).contacts).toEqual([]);
}, 120_000);


it("keeps matching candidates beyond 500 and returns every result page", async () => {
  const credential = await createUserWithEmailAndPassword(auth, `${runId}-pages@example.test`, "Test-Advisor-2026!");
  await call("bootstrapWorkspace", { displayName: "Sayfalama testi" }, "pages-bootstrap");
  await credential.user.getIdToken(true);
  const seller = (await call<{ contact: { id: string } }>("createContact", { fullName: "Test Satıcı", phone: "", source: "in_person", metAtPlace: "", role: "seller" }, "pages-seller")).contact;
  const buyer = (await call<{ contact: { id: string } }>("createContact", { fullName: "Test Alıcı", phone: "", source: "in_person", metAtPlace: "", role: "buyer" }, "pages-buyer")).contact;
  const listing = (await call<{ listing: { id: string } }>("importExistingListing", { ownerContactId: seller.id, opportunityType: "seller_listing", address: "Kadıovacık arsa", regionSlug: "Kadıovacık", propertyType: "land", roomCount: null, areaM2: 620, features: [], authorizationType: "verbal", askingPrice: 5_000_000, currency: "TRY", expiresAt: null }, "pages-listing")).listing;
  const criteria = { transactionType: "buy", propertyTypes: ["land"], preferredLocations: ["Kadıovacık"], budgetRange: { min: null, max: 5_000_000, currency: "TRY" }, bedroomCountMin: null, livingRoomCountMin: null, roomCountMin: null, areaMinM2: null, areaMaxM2: null, mustHaves: [], dealBreakers: [], timeline: null };
  await call("createOpportunity", { subjectContactId: buyer.id, type: "buyer_requirement", criteria, nextActionType: "call", nextActionAt: Date.now() + 86_400_000 }, "pages-demand");
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore(); const seed = (await getDoc(doc(db, "listings", listing.id))).data()!;
    for (let offset = 0; offset < 505; offset += 400) {
      const batch = writeBatch(db);
      for (let index = offset; index < Math.min(offset + 400, 505); index++) batch.set(doc(db, "listings", `${runId}-candidate-${index}`), { ...seed, propertyId: `${runId}-property-${index}` });
      await batch.commit();
    }
  });
  let cursor: number | null = 0; const ids: string[] = [];
  do {
    const page: { matches: { portfolioItem: { id: string } }[]; nearMisses: { portfolioItem: { id: string } }[]; nextCursor: number | null; candidateCount: number } = await call("listPortfolioMatches", { cursor });
    expect(page.candidateCount).toBe(506);
    ids.push(...[...page.matches, ...page.nearMisses].map((row) => row.portfolioItem.id));
    expect(page.matches.length + page.nearMisses.length).toBeLessThanOrEqual(100);
    cursor = page.nextCursor;
  } while (cursor !== null);
  expect(new Set(ids).size).toBe(506); expect(ids).toHaveLength(506);
  await environment.withSecurityRulesDisabled(async (context) => { await updateDoc(doc(context.firestore(), "contacts", buyer.id), { "privacy.profilingObjection": true }); });
  expect((await call<{ matches: unknown[] }>("listPortfolioMatches", undefined)).matches).toEqual([]);
  const preview = await call<{ snapshotToken: string }>("previewTestWorkspaceReset", undefined);
  await call("resetTestWorkspace", { snapshotToken: preview.snapshotToken }, "pages-reset");
}, 120_000);
