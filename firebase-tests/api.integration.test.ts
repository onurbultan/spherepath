import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const projectId = "spherepath-96ecd";
const app = initializeApp({ apiKey: "demo-key", projectId, authDomain: `${projectId}.firebaseapp.com` }, "api-integration");
const auth = getAuth(app);
const functions = getFunctions(app, "europe-west8");
let testEnvironment: RulesTestEnvironment;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const requirementInsights = { keyThingsToRemember: ["Urla'da kiralık daire arıyor"], propertyContext: "search_preference", propertyPreferences: { transactionType: "rent", propertyTypes: ["apartment"], preferredLocations: ["Urla"], budgetRange: { min: null, max: 60_000, currency: "TRY" }, bedroomCountMin: 2, livingRoomCountMin: 1, roomCountMin: null, areaMinM2: null, areaMaxM2: null, mustHaves: ["Otoparklı"], dealBreakers: [], timeline: null }, propertySituations: [], suggestedActionReason: "Uygun portföyleri mesajla" } as const;

function envelope<T>(data: T, requestId: string, commandId?: string) {
  return { data, requestId: `${requestId}-${runId}`, commandId: commandId ? `${commandId}-${runId}` : undefined };
}

beforeAll(async () => {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  testEnvironment = await initializeTestEnvironment({ projectId });
});

afterAll(async () => {
  await Promise.all([deleteApp(app), testEnvironment.cleanup()]);
});

describe("callable API vertical slice", () => {
  it("bootstraps, creates one idempotent contact, records one interaction, and builds Today", async () => {
    const credential = await createUserWithEmailAndPassword(auth, `api-${Date.now()}@example.test`, "Test1234!");
    const bootstrap = httpsCallable(functions, "bootstrapWorkspace");
    const workspace = (await bootstrap(envelope({ displayName: "API Test" }, "request-bootstrap", "command-bootstrap"))).data as { officeId: string };
    await credential.user.getIdToken(true);

    const createContact = httpsCallable(functions, "createContact");
    const contactRequest = envelope({
      fullName: "Integration Contact",
      phone: "",
      metAtPlace: "Test",
      source: "in_person",
      role: "seller",
    }, "request-create-1", "command-create-contact");
    const created = (await createContact(contactRequest)).data as { contact: { id: string } };
    const replayed = (await createContact({ ...contactRequest, requestId: "request-create-2" })).data as { contact: { id: string } };
    expect(replayed.contact.id).toBe(created.contact.id);

    const listContacts = httpsCallable(functions, "listContacts");
    const listed = (await listContacts(envelope(undefined, "request-list"))).data as { contacts: Array<{ id: string }> };
    expect(listed.contacts.map((contact) => contact.id)).toEqual([created.contact.id]);

    const createReferral = httpsCallable(functions, "createReferral");
    const referralRequest = envelope({ sourceContactId: created.contact.id, referredContactId: null, referredLabel: "Integration Referral" }, "request-referral-1", "command-create-referral");
    const referral = (await createReferral(referralRequest)).data as { referral: { id: string; status: string } };
    const referralReplay = (await createReferral({ ...referralRequest, requestId: "request-referral-2" })).data as { referral: { id: string } };
    expect(referral.referral.status).toBe("first_contact_pending");
    expect(referralReplay.referral.id).toBe(referral.referral.id);
    const listReferrals = httpsCallable(functions, "listReferrals");
    const listedReferrals = (await listReferrals(envelope(undefined, "request-list-referrals"))).data as { referrals: Array<{ id: string; referredContactName: string }> };
    expect(listedReferrals.referrals).toEqual([expect.objectContaining({ id: referral.referral.id, referredContactName: "Integration Referral" })]);

    const recordInteraction = httpsCallable(functions, "recordInteraction");
    const interactionRequest = envelope({
      contactId: created.contact.id,
      channel: "in_person",
      objective: "get_acquainted",
      direction: "mutual",
      outcome: "Follow-up agreed",
      askOutcome: "positive",
      nextActionType: "call",
      nextActionAt: Date.now() + 86_400_000,
      noteSummary: "",
    }, "request-interaction-1", "command-record-interaction");
    const interaction = (await recordInteraction(interactionRequest)).data as { interactionId: string };
    const interactionReplay = (await recordInteraction({ ...interactionRequest, requestId: "request-interaction-2" })).data as { interactionId: string };
    expect(interactionReplay.interactionId).toBe(interaction.interactionId);

    const createOpportunity = httpsCallable(functions, "createOpportunity");
    const opportunityRequest = envelope({
      subjectContactId: created.contact.id,
      type: "seller_listing",
      nextActionType: "call",
      nextActionAt: Date.now() + 86_400_000,
    }, "request-opportunity-1", "command-create-opportunity");
    const opportunity = (await createOpportunity(opportunityRequest)).data as { opportunity: { id: string; stage: string } };
    const opportunityReplay = (await createOpportunity({ ...opportunityRequest, requestId: "request-opportunity-2" })).data as { opportunity: { id: string } };
    expect(opportunity.opportunity.stage).toBe("new_lead");
    expect(opportunityReplay.opportunity.id).toBe(opportunity.opportunity.id);

    const advanceOpportunity = httpsCallable(functions, "advanceOpportunity");
    await advanceOpportunity(envelope({
      opportunityId: opportunity.opportunity.id,
      toStage: "first_contact",
      reason: "Initial call completed",
      lostReason: null,
      nextActionType: "appointment",
      nextActionAt: Date.now() + 3_600_000,
    }, "request-advance-opportunity", "command-advance-opportunity"));

    const listOpportunities = httpsCallable(functions, "listOpportunities");
    const listedOpportunities = (await listOpportunities(envelope(undefined, "request-list-opportunities"))).data as { opportunities: Array<{ id: string; stage: string }> };
    expect(listedOpportunities.opportunities).toEqual([expect.objectContaining({ id: opportunity.opportunity.id, stage: "first_contact" })]);

    const getOpportunityDetail = httpsCallable(functions, "getOpportunityDetail");
    const detail = (await getOpportunityDetail(envelope(
      { opportunityId: opportunity.opportunity.id },
      "request-opportunity-detail",
    ))).data as { opportunity: { id: string }; stageEvents: Array<{ fromStage: string | null; toStage: string }> };
    expect(detail.opportunity.id).toBe(opportunity.opportunity.id);
    expect(detail.stageEvents).toEqual([
      expect.objectContaining({ fromStage: "new_lead", toStage: "first_contact" }),
      expect.objectContaining({ fromStage: null, toStage: "new_lead" }),
    ]);

    const getTodayOverview = httpsCallable(functions, "getTodayOverview");
    const today = (await getTodayOverview(envelope(undefined, "request-today"))).data as {
      overview: { stages: { relationship: number; lead: number }; tasks: Array<{ id: string; opportunityId?: string }> };
    };
    expect(today.overview.stages.relationship).toBe(1);
    expect(today.overview.stages.lead).toBe(1);
    expect(today.overview.tasks).toEqual([
      expect.objectContaining({ id: `opportunity-action-${opportunity.opportunity.id}`, opportunityId: opportunity.opportunity.id }),
    ]);
    const completeDailyTask = httpsCallable(functions, "completeDailyTask");
    await completeDailyTask(envelope({ taskId: `opportunity-action-${opportunity.opportunity.id}`, status: "completed", outcomeNote: null, skippedReason: null, rescheduledAt: null, rescheduledActionType: null }, "request-task-complete", "command-task-complete"));
    const todayAfterCompletion = (await getTodayOverview(envelope(undefined, "request-today-completed"))).data as { overview: { completedTaskCount: number; tasks: Array<{ id: string }> } };
    expect(todayAfterCompletion.overview.completedTaskCount).toBe(1);
    expect(todayAfterCompletion.overview.tasks).toEqual([expect.objectContaining({ id: `opportunity-action-${opportunity.opportunity.id}` })]);

    await completeDailyTask(envelope({ taskId: `opportunity-action-${opportunity.opportunity.id}`, status: "contact_opt_out", outcomeNote: null, skippedReason: "Telefon ve WhatsApp üzerinden iletişim istemiyor.", rescheduledAt: null, rescheduledActionType: null }, "request-task-opt-out", "command-task-opt-out"));
    const contactsAfterOptOut = (await listContacts(envelope(undefined, "request-list-after-opt-out"))).data as { contacts: Array<{ id: string; relationship: { nextActionAt: number | null }; privacy: { marketingConsent: string; iysStatus: string } }> };
    expect(contactsAfterOptOut.contacts).toEqual([expect.objectContaining({
      id: created.contact.id,
      relationship: expect.objectContaining({ nextActionAt: null }),
      privacy: expect.objectContaining({ marketingConsent: "withdrawn", iysStatus: "rejected" }),
    })]);
    const opportunitiesAfterOptOut = (await listOpportunities(envelope(undefined, "request-list-opportunities-after-opt-out"))).data as { opportunities: Array<{ id: string; nextActionAt: number | null }> };
    expect(opportunitiesAfterOptOut.opportunities).toEqual([expect.objectContaining({ id: opportunity.opportunity.id, nextActionAt: null })]);
    const listContactInteractions = httpsCallable(functions, "listContactInteractions");
    const historyAfterOptOut = (await listContactInteractions(envelope({ contactId: created.contact.id }, "request-history-after-opt-out"))).data as { taskOutcomes: Array<{ status: string; note: string }> };
    expect(historyAfterOptOut.taskOutcomes).toEqual([expect.objectContaining({ status: "contact_opt_out", note: "Telefon ve WhatsApp üzerinden iletişim istemiyor." })]);

    for (const [index, toStage] of ["appointment", "valuation", "mandate_offer", "won"].entries()) {
      await advanceOpportunity(envelope({
        opportunityId: opportunity.opportunity.id,
        toStage,
        reason: `Advance to ${toStage}`,
        lostReason: null,
        nextActionType: toStage === "won" ? null : "appointment",
        nextActionAt: toStage === "won" ? null : Date.now() + 172_800_000,
      }, `request-advance-${index}`, `command-advance-${index}`));
    }

    const createListing = httpsCallable(functions, "createListing");
    const listingRequest = envelope({
      opportunityId: opportunity.opportunity.id,
      address: "Integration Street 1",
      regionSlug: "Integration Region",
      propertyType: "apartment",
      roomCount: 3,
      areaM2: 120,
      features: ["parking"],
      authorizationType: "exclusive",
      askingPrice: null,
      currency: "TRY",
      expiresAt: null,
    }, "request-listing-1", "command-create-listing");
    const listing = (await createListing(listingRequest)).data as { listing: { id: string; status: string } };
    const listingReplay = (await createListing({ ...listingRequest, requestId: "request-listing-2" })).data as { listing: { id: string } };
    expect(listing.listing.status).toBe("preparing");
    expect(listingReplay.listing.id).toBe(listing.listing.id);

    const advanceListing = httpsCallable(functions, "advanceListing");
    await expect(advanceListing(envelope({ listingId: listing.listing.id, toStatus: "active", reason: "Missing valuation" }, "request-listing-advance-missing-price", "command-listing-advance-missing-price"))).rejects.toThrow();
    const updateListingPrice = httpsCallable(functions, "updateListingPrice");
    await updateListingPrice(envelope({ listingId: listing.listing.id, askingPrice: 11_000_000, currency: "TRY" }, "request-listing-price", "command-listing-price"));
    await expect(advanceListing(envelope({ listingId: listing.listing.id, toStatus: "active", reason: "Missing readiness evidence" }, "request-listing-advance-missing-evidence", "command-listing-advance-missing-evidence"))).rejects.toThrow();
    const updateListingReadiness = httpsCallable(functions, "updateListingReadiness");
    await updateListingReadiness(envelope({ listingId: listing.listing.id, evidence: { mandate: "verified", eids: "not_required", media: "ready", processingBasis: "verified" } }, "request-listing-readiness", "command-listing-readiness"));
    await advanceListing(envelope({ listingId: listing.listing.id, toStatus: "active", reason: "Ready to market" }, "request-listing-advance", "command-listing-advance"));
    const listListings = httpsCallable(functions, "listListings");
    const listedListings = (await listListings(envelope(undefined, "request-list-listings"))).data as { listings: Array<{ id: string; status: string; askingPrice: number }> };
    expect(listedListings.listings).toEqual([expect.objectContaining({ id: listing.listing.id, status: "active", askingPrice: 11_000_000 })]);

    const updateContactPrivacy = httpsCallable(functions, "updateContactPrivacy");
    await updateContactPrivacy(envelope({ contactId: created.contact.id, coreCrmLegalBasis: "legitimate_interest", noticeStatus: "completed", noticeMethod: "verbal", noticeVersion: "v1", marketingConsent: "granted", marketingChannels: ["whatsapp"], iysStatus: "approved", profilingObjection: false }, "request-privacy", "command-privacy"));
    const createPresentation = httpsCallable(functions, "createPresentation");
    const presentation = (await createPresentation(envelope({ listingId: listing.listing.id, contactId: created.contact.id, message: "Integration listing presentation", channel: "whatsapp" }, "request-presentation", "command-presentation"))).data as { presentationId: string };
    const advancePresentation = httpsCallable(functions, "advancePresentation");
    await advancePresentation(envelope({ presentationId: presentation.presentationId, toStatus: "user_approved" }, "request-presentation-approved", "command-presentation-approved"));
    await advancePresentation(envelope({ presentationId: presentation.presentationId, toStatus: "sent" }, "request-presentation-sent", "command-presentation-sent"));

    const buyerOpportunity = (await createOpportunity(envelope({
      subjectContactId: created.contact.id,
      type: "buyer_requirement",
      nextActionType: "call",
      nextActionAt: Date.now() + 86_400_000,
    }, "request-buyer-opportunity", "command-buyer-opportunity"))).data as { opportunity: { id: string } };

    const createDeal = httpsCallable(functions, "createDeal");
    const dealTime = Date.now();
    const deal = (await createDeal(envelope({ listingId: listing.listing.id, buyerContactId: created.contact.id, buyerOpportunityId: buyerOpportunity.opportunity.id, source: "presentation", sourcePresentationId: presentation.presentationId, sourceNote: null, nextActionType: "appointment", nextActionAt: dealTime + 86_400_000 }, "request-deal", "command-deal"))).data as { dealId: string };
    const advanceDeal = httpsCallable(functions, "advanceDeal");
    await advanceDeal(envelope({ dealId: deal.dealId, toStage: "viewing", occurredAt: dealTime + 1_000, evidenceNote: "Gezi tarihi müşteriyle teyit edildi.", nextActionType: "appointment", nextActionAt: dealTime + 86_400_000, offerAmount: null, actualAmount: null, commissionAmount: null, currency: null, lostReason: null }, "request-deal-viewing", "command-deal-viewing"));
    await advanceDeal(envelope({ dealId: deal.dealId, toStage: "offer", occurredAt: dealTime + 2_000, evidenceNote: "Yazılı teklif alındı.", nextActionType: "call", nextActionAt: dealTime + 86_400_000, offerAmount: 9_500_000, actualAmount: null, commissionAmount: null, currency: "TRY", lostReason: null }, "request-deal-offer", "command-deal-offer"));
    await advanceDeal(envelope({ dealId: deal.dealId, toStage: "contract", occurredAt: dealTime + 3_000, evidenceNote: "Sözleşme taraflarca teyit edildi.", nextActionType: "appointment", nextActionAt: dealTime + 86_400_000, offerAmount: null, actualAmount: null, commissionAmount: null, currency: null, lostReason: null }, "request-deal-contract", "command-deal-contract"));
    await advanceDeal(envelope({ dealId: deal.dealId, toStage: "closed", occurredAt: dealTime + 4_000, evidenceNote: "Tapu devri ve tahsilat tamamlandı.", nextActionType: null, nextActionAt: null, offerAmount: null, actualAmount: 9_300_000, commissionAmount: 186_000, currency: "TRY", lostReason: null }, "request-deal-closed", "command-deal-closed"));
    const getClosingOverview = httpsCallable(functions, "getClosingOverview");
    const closing = (await getClosingOverview(envelope(undefined, "request-closing"))).data as { presentations: Array<{ id: string; status: string }>; deals: Array<{ id: string; stage: string; actualAmount: number | null; commissionAmount: number | null }> };
    expect(closing.presentations).toEqual([expect.objectContaining({ id: presentation.presentationId, status: "sent" })]);
    expect(closing.deals).toEqual([expect.objectContaining({ id: deal.dealId, stage: "closed", actualAmount: 9_300_000, commissionAmount: 186_000 })]);
    const listingsAfterClosing = (await listListings(envelope(undefined, "request-list-listings-after-closing"))).data as { listings: Array<{ id: string; status: string }> };
    expect(listingsAfterClosing.listings).toEqual([expect.objectContaining({ id: listing.listing.id, status: "sold" })]);
    const opportunitiesAfterClosing = (await listOpportunities(envelope(undefined, "request-opportunities-after-closing"))).data as { opportunities: Array<{ id: string; stage: string; nextActionAt: number | null }> };
    expect(opportunitiesAfterClosing.opportunities).toContainEqual(expect.objectContaining({
      id: buyerOpportunity.opportunity.id,
      stage: "won",
      nextActionAt: null,
    }));

    const registerVoiceNote = httpsCallable(functions, "registerVoiceNote");
    const voiceRequest = envelope({
      contactId: created.contact.id,
      storagePath: `offices/${workspace.officeId}/voice/${credential.user.uid}/integration-voice.webm`,
      durationMs: 12_000,
      mimeType: "audio/webm",
      conversationEndedConfirmed: true,
      emulatorTranscript: "Yarın yeniden arayacağım. Sağlık durumu hakkında ayrıntı anlattı.",
    }, "request-voice-register", "command-voice-register");
    const registeredVoice = (await registerVoiceNote(voiceRequest)).data as { voiceNoteId: string };
    const voiceReplay = (await registerVoiceNote({ ...voiceRequest, requestId: "request-voice-replay" })).data as { voiceNoteId: string };
    expect(voiceReplay.voiceNoteId).toBe(registeredVoice.voiceNoteId);
    const getVoiceNote = httpsCallable(functions, "getVoiceNote");
    const voice = (await getVoiceNote(envelope({ voiceNoteId: registeredVoice.voiceNoteId }, "request-voice-get"))).data as {
      voiceNote: { status: string; maskedTranscript: string; maskedCategories: string[]; extraction: { interaction: { nextActionType: string; daysFromNow: number } } };
    };
    expect(voice.voiceNote.status).toBe("needs_review");
    expect(voice.voiceNote.maskedTranscript).not.toContain("Sağlık durumu");
    expect(voice.voiceNote.maskedCategories).toContain("health");
    expect(voice.voiceNote.extraction.interaction).toMatchObject({ nextActionType: "call", daysFromNow: 1 });

    const recoveryVoiceNoteId = `recovery-${Date.now()}`;
    const recoveryTimestamp = new Date();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "voiceNotes", recoveryVoiceNoteId), {
        officeId: workspace.officeId,
        ownerUid: credential.user.uid,
        contactId: created.contact.id,
        storagePath: `offices/${workspace.officeId}/voice/${credential.user.uid}/recovery.webm`,
        durationMs: 12_000,
        mimeType: "audio/webm",
        conversationEndedConfirmed: true,
        status: "queued",
        attempts: 0,
        processingEventId: null,
        maskedTranscript: null,
        maskedCategories: [],
        maskedRanges: [],
        extraction: null,
        corrections: [],
        interactionId: null,
        sourceAudioDeletedAt: null,
        errorCode: null,
        emulatorImmediate: true,
        createdAt: recoveryTimestamp,
        updatedAt: recoveryTimestamp,
      });
    });
    const retryVoiceNoteProcessing = httpsCallable(functions, "retryVoiceNoteProcessing");
    const recoveryRequest = envelope({
      voiceNoteId: recoveryVoiceNoteId,
      emulatorTranscript: "Urla'da bahçeli ev arıyor. Yarın yeniden arayacağım.",
    }, "request-voice-recovery", "command-voice-recovery");
    await retryVoiceNoteProcessing(recoveryRequest);
    await retryVoiceNoteProcessing({ ...recoveryRequest, requestId: "request-voice-recovery-replay" });
    const recoveredVoice = (await getVoiceNote(envelope({ voiceNoteId: recoveryVoiceNoteId }, "request-voice-recovered-get"))).data as {
      voiceNote: { status: string; maskedTranscript: string; extraction: { interaction: { nextActionType: string } } };
    };
    expect(recoveredVoice.voiceNote.status).toBe("needs_review");
    expect(recoveredVoice.voiceNote.maskedTranscript).toContain("Urla");
    expect(recoveredVoice.voiceNote.extraction.interaction.nextActionType).toBe("call");

    const registerVoiceTextTest = httpsCallable(functions, "registerVoiceTextTest");
    const textVoice = (await registerVoiceTextTest(envelope({
      contactId: created.contact.id,
      transcript: "Kadıköy'de üç odalı daire arıyor. Yarın tekrar arayacağım.",
    }, "request-voice-text-test", "command-voice-text-test"))).data as { voiceNoteId: string };
    const textVoiceView = (await getVoiceNote(envelope({ voiceNoteId: textVoice.voiceNoteId }, "request-voice-text-get"))).data as {
      voiceNote: { status: string; maskedTranscript: string; extraction: { interaction: { nextActionType: string } } };
    };
    expect(textVoiceView.voiceNote.status).toBe("needs_review");
    expect(textVoiceView.voiceNote.maskedTranscript).toContain("Kadıköy");
    expect(textVoiceView.voiceNote.extraction.interaction.nextActionType).toBe("call");
    const discardVoiceNote = httpsCallable(functions, "discardVoiceNote");
    await discardVoiceNote(envelope({ voiceNoteId: textVoice.voiceNoteId }, "request-voice-discard", "command-voice-discard"));
    const discardedVoiceView = (await getVoiceNote(envelope({ voiceNoteId: textVoice.voiceNoteId }, "request-voice-discarded-get"))).data as {
      voiceNote: { status: string; maskedTranscript: string | null; extraction: unknown };
    };
    expect(discardedVoiceView.voiceNote).toMatchObject({ status: "discarded", maskedTranscript: null, extraction: null });
    const reassignedContact = (await createContact(envelope({
      fullName: "Derya Kaya",
      phone: "",
      metAtPlace: "Voice reassignment",
      source: "other",
      role: "buyer",
    }, "request-create-reassigned-contact", "command-create-reassigned-contact"))).data as { contact: { id: string } };
    const confirmVoiceNote = httpsCallable(functions, "confirmVoiceNote");
    const confirmedVoice = (await confirmVoiceNote(envelope({
      voiceNoteId: registeredVoice.voiceNoteId,
      interaction: {
        contactId: reassignedContact.contact.id,
        channel: "phone",
        objective: "follow_up",
        direction: "outbound",
        outcome: "Yarın yeniden arayacağım.",
        askOutcome: "not_asked",
        nextActionType: "call",
        nextActionAt: Date.now() + 86_400_000,
        noteSummary: "Yarın yeniden arayacağım. [HASSAS İÇERİK MASKELENDİ]",
      },
      approvedInsights: {
        keyThingsToRemember: ["Yarın yeniden aranacak."],
        propertyContext: "search_preference",
        propertyPreferences: {
          transactionType: "buy",
          propertyTypes: ["apartment"],
          preferredLocations: ["Integration Region"],
          budgetRange: { min: null, max: 12_000_000, currency: "TRY" },
          bedroomCountMin: 3,
          livingRoomCountMin: 1,
          roomCountMin: null,
          areaMinM2: 100,
          areaMaxM2: null,
          mustHaves: ["Otopark"],
          dealBreakers: [],
          timeline: null,
        },
        propertySituations: [],
        suggestedActionReason: "Yarın yeniden arama sözü verildi.",
      },
      opportunity: null,
      opportunities: [
        { type: "seller_listing", nextActionType: "call", nextActionAt: Date.now() + 86_400_000 },
        { type: "buyer_requirement", nextActionType: "call", nextActionAt: Date.now() + 86_400_000 },
      ],
    }, "request-voice-confirm", "command-voice-confirm"))).data as { interactionId: string; opportunityId: string | null; opportunityIds: string[] };
    expect(confirmedVoice.interactionId).toBeTruthy();
    expect(confirmedVoice.opportunityId).toBeTruthy();
    expect(confirmedVoice.opportunityIds).toHaveLength(2);
    const contactsAfterVoice = (await listContacts(envelope(undefined, "request-list-after-voice"))).data as { contacts: Array<{ id: string; memory: { keyThingsToRemember: string[] } }> };
    expect(contactsAfterVoice.contacts.find((contact) => contact.id === reassignedContact.contact.id)?.memory.keyThingsToRemember).toContain("Yarın yeniden aranacak.");
    expect(contactsAfterVoice.contacts.find((contact) => contact.id === created.contact.id)?.memory.keyThingsToRemember).not.toContain("Yarın yeniden aranacak.");
    const opportunitiesAfterVoice = (await listOpportunities(envelope(undefined, "request-list-opportunities-after-voice"))).data as { opportunities: Array<{ id: string; subjectContactId: string }> };
    expect(opportunitiesAfterVoice.opportunities).toContainEqual(expect.objectContaining({
      id: confirmedVoice.opportunityId,
      subjectContactId: reassignedContact.contact.id,
    }));
    expect(opportunitiesAfterVoice.opportunities.filter((item) => confirmedVoice.opportunityIds.includes(item.id))).toHaveLength(2);

    const createPortfolioItemFromDraft = httpsCallable(functions, "createPortfolioItemFromDraft");
    const portfolioRequest = envelope({
      source: "whatsapp_group",
      sourceAuthorName: "Integration Advisor",
      headline: "Integration Region 3+1 apartment",
      summary: "Integration Region içinde 120 m², otoparklı 3+1 daire.",
      transactionType: "sell",
      propertyType: "apartment",
      location: "Integration Region",
      askingPrice: { amount: 10_000_000, currency: "TRY" },
      bedroomCount: 3,
      livingRoomCount: 1,
      areaM2: 120,
      landAreaM2: null,
      features: ["parking"],
      attributes: [],
      authorizationType: "none",
      titleDeedType: "unknown",
      constructionAllowed: null,
      listingUrl: "https://example.com/integration-listing",
    }, "request-portfolio-create", "command-portfolio-create");
    const portfolio = (await createPortfolioItemFromDraft(portfolioRequest)).data as { portfolioItem: { id: string } };
    const portfolioReplay = (await createPortfolioItemFromDraft({ ...portfolioRequest, requestId: "request-portfolio-replay" })).data as { portfolioItem: { id: string } };
    expect(portfolioReplay.portfolioItem.id).toBe(portfolio.portfolioItem.id);
    const listPortfolioItems = httpsCallable(functions, "listPortfolioItems");
    const listedPortfolio = (await listPortfolioItems(envelope(undefined, "request-portfolio-list"))).data as { portfolioItems: Array<{ id: string }> };
    expect(listedPortfolio.portfolioItems).toEqual([expect.objectContaining({ id: portfolio.portfolioItem.id })]);
    const listPortfolioMatches = httpsCallable(functions, "listPortfolioMatches");
    const portfolioMatches = (await listPortfolioMatches(envelope(undefined, "request-portfolio-matches"))).data as { matches: Array<{ contactId: string; portfolioItem: { id: string }; eligible: boolean; score: number }> };
    expect(portfolioMatches.matches).toEqual([expect.objectContaining({ contactId: reassignedContact.contact.id, eligible: true, score: 100, portfolioItem: expect.objectContaining({ id: portfolio.portfolioItem.id }) })]);
    const withdrawPortfolioItem = httpsCallable(functions, "withdrawPortfolioItem");
    await withdrawPortfolioItem(envelope({ portfolioItemId: portfolio.portfolioItem.id }, "request-portfolio-withdraw", "command-portfolio-withdraw"));
    const portfolioAfterWithdrawal = (await listPortfolioItems(envelope(undefined, "request-portfolio-list-after-withdrawal"))).data as { portfolioItems: unknown[] };
    expect(portfolioAfterWithdrawal.portfolioItems).toEqual([]);

    const getWorkspaceSettings = httpsCallable(functions, "getWorkspaceSettings");
    const initialSettings = (await getWorkspaceSettings(envelope(undefined, "request-settings-get"))).data as { settings: { country: string; displayName: string } };
    expect(initialSettings.settings.country).toBe("TR");
    const updateWorkspaceSettings = httpsCallable(functions, "updateWorkspaceSettings");
    const settingsDraft = {
      displayName: "API Test Advisor",
      phone: "+90 555 000 00 00",
      defaultRegions: ["Integration Region"],
      monthlyPortfolioTarget: 8,
      weeklyCapacity: 20,
      country: "TR",
      dataControllerName: "Integration Data Controller",
      verbisStatus: "unknown",
      trncFilingConfirmed: false,
      trncTransferLicenseConfirmed: false,
      dailyPlanReminderEnabled: true,
      dailyPlanReminderHour: 8,
      dailyPlanReminderMinute: 30,
    };
    const settingsRequest = envelope(settingsDraft, "request-settings-update", "command-settings-update");
    const updatedSettings = (await updateWorkspaceSettings(settingsRequest)).data as { settings: { displayName: string; dailyPlanReminderHour: number } };
    const replayedSettings = (await updateWorkspaceSettings({ ...settingsRequest, requestId: "request-settings-replay" })).data as { settings: { displayName: string } };
    expect(updatedSettings.settings).toMatchObject({ displayName: "API Test Advisor", dailyPlanReminderHour: 8 });
    expect(replayedSettings.settings.displayName).toBe("API Test Advisor");

    const getWhatsAppGroupIntegration = httpsCallable(functions, "getWhatsAppGroupIntegration");
    const initialWhatsApp = (await getWhatsAppGroupIntegration(envelope(undefined, "request-whatsapp-get"))).data as { integration: { status: string; webhookUrl: string } };
    expect(initialWhatsApp.integration).toMatchObject({ status: "not_configured" });
    expect(initialWhatsApp.integration.webhookUrl).toContain("whatsappGroupsWebhook");
    const configureWhatsAppGroupIntegration = httpsCallable(functions, "configureWhatsAppGroupIntegration");
    const whatsappRequest = envelope({
      businessPhoneNumberId: "12784358810",
      subject: "Spherepath Integration Group",
      description: "Integration group for office pool messages",
      joinApprovalMode: "approval_required",
    }, "request-whatsapp-configure", "command-whatsapp-configure");
    const configuredWhatsApp = (await configureWhatsAppGroupIntegration(whatsappRequest)).data as { integration: { status: string; businessPhoneNumberId: string } };
    const replayedWhatsApp = (await configureWhatsAppGroupIntegration({ ...whatsappRequest, requestId: "request-whatsapp-configure-replay" })).data as { integration: { status: string } };
    expect(configuredWhatsApp.integration).toMatchObject({ status: "configured", businessPhoneNumberId: "12784358810" });
    expect(replayedWhatsApp.integration.status).toBe("configured");
    await testEnvironment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), "whatsappGroupIntegrations", workspace.officeId), { status: "creating", pendingRequestId: "integration-group-request-1" }));
    const lifecyclePayload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "group_lifecycle_update", value: { metadata: { phone_number_id: "12784358810" }, groups: [{ type: "group_create", request_id: "integration-group-request-1", group_id: "integration-group-1", invite_link: "https://chat.whatsapp.com/integration" }] } }] }] };
    const lifecycleRaw = JSON.stringify(lifecyclePayload);
    const lifecycleSignature = `sha256=${createHmac("sha256", "integration-app-secret").update(lifecycleRaw).digest("hex")}`;
    const lifecycleResponse = await fetch(`http://127.0.0.1:5001/${projectId}/europe-west8/whatsappGroupsWebhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": lifecycleSignature }, body: lifecycleRaw });
    expect(lifecycleResponse.status).toBe(200);
    const activeWhatsApp = (await getWhatsAppGroupIntegration(envelope(undefined, "request-whatsapp-active"))).data as { integration: { status: string; groupId: string; inviteLink: string } };
    expect(activeWhatsApp.integration).toMatchObject({ status: "active", groupId: "integration-group-1", inviteLink: "https://chat.whatsapp.com/integration" });
    const webhookPayload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "12784358810" },
        messages: [
          { id: "wamid.integration-1", group_id: "integration-group-1", timestamp: String(Math.floor(Date.now() / 1_000)), type: "text", text: { body: "Urla'da bahçeli bir ev var, konumu Kuşçular." } },
          { id: "wamid.integration-2", group_id: "integration-group-1", timestamp: String(Math.floor(Date.now() / 1_000)), type: "text", text: { body: "Sağlık durumu hakkında ayrıntı paylaşıldı." } },
        ],
      } }] }],
    };
    const webhookRaw = JSON.stringify(webhookPayload);
    const webhookSignature = `sha256=${createHmac("sha256", "integration-app-secret").update(webhookRaw).digest("hex")}`;
    const verificationResponse = await fetch(`http://127.0.0.1:5001/${projectId}/europe-west8/whatsappGroupsWebhook?hub.mode=subscribe&hub.verify_token=integration-verify-token&hub.challenge=spherepath-challenge`);
    expect(await verificationResponse.text()).toBe("spherepath-challenge");
    const rejectedWebhook = await fetch(`http://127.0.0.1:5001/${projectId}/europe-west8/whatsappGroupsWebhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=invalid" }, body: webhookRaw });
    expect(rejectedWebhook.status).toBe(401);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const webhookResponse = await fetch(`http://127.0.0.1:5001/${projectId}/europe-west8/whatsappGroupsWebhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": webhookSignature }, body: webhookRaw });
      expect(webhookResponse.status).toBe(200);
    }
    const listWhatsAppInbox = httpsCallable(functions, "listInboxItems");
    const whatsappInbox = (await listWhatsAppInbox(envelope({ cursor: null, limit: 50 }, "request-whatsapp-inbox"))).data as { items: Array<{ safeText: string; source: string; kind: string; status: string }> };
    expect(whatsappInbox.items.filter((item) => item.safeText === "Urla'da bahçeli bir ev var, konumu Kuşçular.")).toEqual([
      expect.objectContaining({ source: "whatsapp", kind: "property", status: "needs_review" }),
    ]);
    expect(whatsappInbox.items.some((item) => item.safeText.includes("Sağlık durumu"))).toBe(false);
    expect(whatsappInbox.items).toContainEqual(expect.objectContaining({ source: "whatsapp", safeText: "[HASSAS İÇERİK MASKELENDİ]", status: "needs_review" }));

    const createInboxItem = httpsCallable(functions, "createInboxItem");
    const updateInboxItem = httpsCallable(functions, "updateInboxItem");
    const processInboxItem = httpsCallable(functions, "processInboxItem");
    const editableNote = (await createInboxItem(envelope({ source: "typed", text: "Daha sonra ara", linkedContactId: null, requestedKind: null }, "request-inbox-edit-create", "command-inbox-edit-create"))).data as { item: { id: string } };
    const editedNote = (await updateInboxItem(envelope({ inboxItemId: editableNote.item.id, text: "Integration Contact gelecek hafta aransın", kind: "follow_up", linkedContactId: created.contact.id }, "request-inbox-edit", "command-inbox-edit"))).data as { item: { safeText: string; kind: string; linkedContactId: string } };
    expect(editedNote.item).toMatchObject({ safeText: "Integration Contact gelecek hafta aransın", kind: "follow_up", linkedContactId: created.contact.id });
    const followUp = (await processInboxItem(envelope({ inboxItemId: editableNote.item.id, action: "follow_up", contactId: created.contact.id, nextActionType: "call", nextActionAt: Date.now() + 3 * 86_400_000 }, "request-inbox-follow-up", "command-inbox-follow-up"))).data as { item: { appliedActions: Array<{ type: string }> }; entityId: string };
    expect(followUp.entityId).toBe(created.contact.id);
    expect(followUp.item.appliedActions).toContainEqual(expect.objectContaining({ type: "follow_up_scheduled" }));

    const requirementNote = (await createInboxItem(envelope({ source: "typed", text: "Integration Contact kiralık daire arıyor", linkedContactId: created.contact.id, requestedKind: "requirement" }, "request-inbox-requirement-create", "command-inbox-requirement-create"))).data as { item: { id: string } };
    const requirementCommand = envelope({ inboxItemId: requirementNote.item.id, action: "requirement", contactId: created.contact.id, opportunityType: "tenant_requirement", nextActionType: "message", nextActionAt: Date.now() + 4 * 86_400_000, approvedInsights: requirementInsights }, "request-inbox-requirement", "command-inbox-requirement");
    const requirementResult = (await processInboxItem(requirementCommand)).data as { entityId: string };
    const requirementReplay = (await processInboxItem({ ...requirementCommand, requestId: `request-inbox-requirement-replay-${runId}` })).data as { entityId: string };
    expect(requirementReplay.entityId).toBe(requirementResult.entityId);

    const updateOpportunityCriteria = httpsCallable(functions, "updateOpportunityCriteria");
    await updateOpportunityCriteria(envelope({
      opportunityId: requirementResult.entityId,
      preferences: {
        ...requirementInsights.propertyPreferences,
        preferredLocations: ["Karşıyaka", "Bostanlı"],
        budgetRange: { min: 35_000, max: 45_000, currency: "TRY" },
        mustHaves: ["Havuzlu", "Otoparklı"],
        timeline: "1 Ekim'de taşınacak",
      },
    }, "request-opportunity-criteria", "command-opportunity-criteria"));
    const requirementDetail = (await getOpportunityDetail(envelope({ opportunityId: requirementResult.entityId }, "request-requirement-detail"))).data as {
      opportunity: { subjectContactMemory: { propertyPreferences: { preferredLocations: string[]; budgetRange: { max: number } | null; mustHaves: string[]; timeline: string | null } } };
    };
    expect(requirementDetail.opportunity.subjectContactMemory.propertyPreferences).toMatchObject({
      preferredLocations: ["Karşıyaka", "Bostanlı"],
      budgetRange: { max: 45_000 },
      mustHaves: ["Havuzlu", "Otoparklı"],
      timeline: "1 Ekim'de taşınacak",
    });

    const personNote = (await createInboxItem(envelope({ source: "typed", text: "Akış Kişisi ile tanıştım", linkedContactId: null, requestedKind: "person" }, "request-inbox-person-create", "command-inbox-person-create"))).data as { item: { id: string } };
    const personFollowUpAt = Date.now() + 5 * 86_400_000;
    const personResult = (await processInboxItem(envelope({
      inboxItemId: personNote.item.id,
      action: "person",
      contact: { fullName: "Akış Kişisi", phone: "+905551112244", metAtPlace: "Akış notu", source: "other", role: "seller", nextActionType: "valuation", nextActionAt: personFollowUpAt },
      approvedInsights: {
        ...requirementInsights,
        keyThingsToRemember: ["Balıklıova'da 4+1 satılık villa"],
        propertyContext: "subject_property",
        propertyPreferences: { ...requirementInsights.propertyPreferences, transactionType: null, preferredLocations: [], budgetRange: null, mustHaves: [] },
        propertySituations: [{
          propertyContext: "subject_property",
          summary: "Balıklıova'da 4+1 satılık villa",
          propertyPreferences: { ...requirementInsights.propertyPreferences, transactionType: "sell", preferredLocations: ["Balıklıova"], budgetRange: null, bedroomCountMin: 4, mustHaves: ["Havuzlu", "Otoparklı"] },
        }],
      },
      recordInteraction: true,
      opportunityType: "seller_listing",
    }, "request-inbox-person", "command-inbox-person"))).data as { item: { linkedContactId: string; appliedActions: Array<{ type: string; entityId: string | null }> }; entityId: string };
    expect(personResult.item.linkedContactId).toBe(personResult.entityId);
    expect(personResult.item.appliedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "contact_created", entityId: personResult.entityId }),
      expect.objectContaining({ type: "interaction_created" }),
      expect.objectContaining({ type: "opportunity_created" }),
    ]));
    const personOpportunityId = personResult.item.appliedActions.find((action) => action.type === "opportunity_created")?.entityId;
    expect(personOpportunityId).toBeTruthy();
    const afterPersonOpportunities = (await listOpportunities(envelope(undefined, "request-opportunities-after-person"))).data as { opportunities: Array<{ id: string; type: string; subjectContactMemory: { propertySituations: Array<{ summary: string }> } }> };
    expect(afterPersonOpportunities.opportunities).toContainEqual(expect.objectContaining({
      id: personOpportunityId,
      type: "seller_listing",
      subjectContactMemory: expect.objectContaining({ propertySituations: [expect.objectContaining({ summary: "Balıklıova'da 4+1 satılık villa" })] }),
    }));

    const portfolioNote = (await createInboxItem(envelope({ source: "typed", text: "Urla'da satılık bahçeli villa", linkedContactId: null, requestedKind: "property" }, "request-inbox-portfolio-create", "command-inbox-portfolio-create"))).data as { item: { id: string } };
    const portfolioFromNote = (await processInboxItem(envelope({ inboxItemId: portfolioNote.item.id, action: "portfolio", contactId: null, portfolio: { source: "manual", sourceAuthorName: null, headline: "Urla bahçeli villa", summary: "Akış notundan oluşturulan satılık bahçeli villa", transactionType: "sell", propertyType: "villa", location: "Urla", askingPrice: { amount: 15_000_000, currency: "TRY" }, bedroomCount: 3, livingRoomCount: 1, areaM2: 180, landAreaM2: null, features: ["garden"], attributes: [], authorizationType: "unknown", titleDeedType: "unknown", constructionAllowed: null, listingUrl: null } }, "request-inbox-portfolio", "command-inbox-portfolio"))).data as { item: { appliedActions: Array<{ type: string }> }; entityId: string };
    expect(portfolioFromNote.item.appliedActions).toContainEqual(expect.objectContaining({ type: "portfolio_created", entityId: portfolioFromNote.entityId }));
    const importExistingListing = httpsCallable(functions, "importExistingListing");
    const listingFromNoteRequest = envelope({ ownerContactId: created.contact.id, opportunityType: "seller_listing", address: "Urla bahçeli villa", regionSlug: "Urla", propertyType: "villa", roomCount: 3, areaM2: 180, features: ["garden"], authorizationType: "exclusive", askingPrice: 15_000_000, currency: "TRY", expiresAt: null, sourceInboxItemId: portfolioNote.item.id }, "request-inbox-listing", "command-inbox-listing");
    const listingFromNote = (await importExistingListing(listingFromNoteRequest)).data as { listing: { id: string; status: string } };
    const listingFromNoteReplay = (await importExistingListing({ ...listingFromNoteRequest, requestId: `request-inbox-listing-replay-${runId}` })).data as { listing: { id: string } };
    expect(listingFromNote.listing.status).toBe("preparing");
    expect(listingFromNoteReplay.listing.id).toBe(listingFromNote.listing.id);
    const inboxAfterListing = (await listWhatsAppInbox(envelope({ cursor: null, limit: 50 }, "request-inbox-after-listing"))).data as { items: Array<{ id: string; appliedActions: Array<{ type: string; entityId: string | null }> }> };
    expect(inboxAfterListing.items.find((item) => item.id === portfolioNote.item.id)?.appliedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "portfolio_created", entityId: portfolioFromNote.entityId }),
      expect.objectContaining({ type: "listing_created", entityId: listingFromNote.listing.id }),
    ]));

    const createDataSubjectRequest = httpsCallable(functions, "createDataSubjectRequest");
    const accessRequest = (await createDataSubjectRequest(envelope({
      contactId: created.contact.id,
      type: "access",
      requesterReference: "integration-access",
      details: "",
    }, "request-data-access", "command-data-access"))).data as { request: { id: string; status: string } };
    expect(accessRequest.request.status).toBe("pending_verification");
    const getContactDataExport = httpsCallable(functions, "getContactDataExport");
    await expect(getContactDataExport(envelope({ requestId: accessRequest.request.id }, "request-contact-export-before-approval"))).rejects.toThrow();
    const resolveDataSubjectRequest = httpsCallable(functions, "resolveDataSubjectRequest");
    await resolveDataSubjectRequest(envelope({ requestId: accessRequest.request.id, decision: "approved", resolutionNote: "Identity verified.", correctedContact: null }, "request-data-access-resolve", "command-data-access-resolve"));
    const contactExport = (await getContactDataExport(envelope({ requestId: accessRequest.request.id }, "request-contact-export"))).data as { export: { contact: { id: string; memory: { propertyPreferences: { preferredLocations: string[]; budgetRange: { max: number } | null } } }; interactions: unknown[]; opportunities: unknown[] } };
    expect(contactExport.export.contact.id).toBe(created.contact.id);
    expect(contactExport.export.interactions.length).toBeGreaterThan(0);
    expect(contactExport.export.opportunities.length).toBeGreaterThan(0);
    expect(contactExport.export.contact.memory.propertyPreferences).toMatchObject({ preferredLocations: ["Karşıyaka", "Bostanlı"], budgetRange: { max: 45_000 } });
    const deletionContact = (await createContact(envelope({
      fullName: "Deletion Integration Contact",
      phone: "+90 555 111 22 33",
      metAtPlace: "Integration Test",
      source: "address_book",
      role: "unknown",
    }, "request-delete-contact", "command-delete-contact"))).data as { contact: { id: string } };
    const deletionRequest = (await createDataSubjectRequest(envelope({
      contactId: deletionContact.contact.id,
      type: "deletion",
      requesterReference: "integration-deletion",
      details: "Verified erasure request",
    }, "request-data-deletion", "command-data-deletion"))).data as { request: { id: string } };
    await resolveDataSubjectRequest(envelope({ requestId: deletionRequest.request.id, decision: "approved", resolutionNote: "Identity verified.", correctedContact: null }, "request-data-deletion-resolve", "command-data-deletion-resolve"));
    const listDataSubjectRequests = httpsCallable(functions, "listDataSubjectRequests");
    let deletionStatus = "processing";
    for (let attempt = 0; attempt < 30 && deletionStatus === "processing"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const requests = (await listDataSubjectRequests(envelope(undefined, `request-data-list-${attempt}`))).data as { requests: Array<{ id: string; status: string }> };
      deletionStatus = requests.requests.find((item) => item.id === deletionRequest.request.id)?.status ?? "missing";
    }
    expect(deletionStatus).toBe("completed");
    const contactsAfterDeletion = (await listContacts(envelope(undefined, "request-list-after-deletion"))).data as { contacts: Array<{ id: string }> };
    expect(contactsAfterDeletion.contacts.some((item) => item.id === deletionContact.contact.id)).toBe(false);
  }, 60_000);
});
