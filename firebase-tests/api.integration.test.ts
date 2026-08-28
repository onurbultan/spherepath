import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const projectId = "spherepath-96ecd";
const app = initializeApp({ apiKey: "demo-key", projectId, authDomain: `${projectId}.firebaseapp.com` }, "api-integration");
const auth = getAuth(app);
const functions = getFunctions(app, "europe-west8");

function envelope<T>(data: T, requestId: string, commandId?: string) {
  return { data, requestId, commandId };
}

beforeAll(() => {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
});

afterAll(async () => {
  await deleteApp(app);
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
      nextActionAt: Date.now() + 172_800_000,
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
      overview: { stages: { relationship: number; lead: number }; tasks: Array<{ opportunityId?: string }> };
    };
    expect(today.overview.stages.relationship).toBe(1);
    expect(today.overview.stages.lead).toBe(1);
    expect(today.overview.tasks).toHaveLength(1);
    expect(today.overview.tasks[0]?.opportunityId).toBe(opportunity.opportunity.id);
    const completeDailyTask = httpsCallable(functions, "completeDailyTask");
    await completeDailyTask(envelope({ taskId: `opportunity-action-${opportunity.opportunity.id}`, status: "completed", skippedReason: null }, "request-task-complete", "command-task-complete"));
    const todayAfterCompletion = (await getTodayOverview(envelope(undefined, "request-today-completed"))).data as { overview: { completedTaskCount: number; tasks: Array<{ id: string }> } };
    expect(todayAfterCompletion.overview.completedTaskCount).toBe(1);
    expect(todayAfterCompletion.overview.tasks).toHaveLength(0);

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
      askingPrice: 10_000_000,
      currency: "TRY",
      expiresAt: null,
    }, "request-listing-1", "command-create-listing");
    const listing = (await createListing(listingRequest)).data as { listing: { id: string; status: string } };
    const listingReplay = (await createListing({ ...listingRequest, requestId: "request-listing-2" })).data as { listing: { id: string } };
    expect(listing.listing.status).toBe("preparing");
    expect(listingReplay.listing.id).toBe(listing.listing.id);

    const advanceListing = httpsCallable(functions, "advanceListing");
    await advanceListing(envelope({ listingId: listing.listing.id, toStatus: "active", reason: "Ready to market" }, "request-listing-advance", "command-listing-advance"));
    const listListings = httpsCallable(functions, "listListings");
    const listedListings = (await listListings(envelope(undefined, "request-list-listings"))).data as { listings: Array<{ id: string; status: string }> };
    expect(listedListings.listings).toEqual([expect.objectContaining({ id: listing.listing.id, status: "active" })]);

    const updateContactPrivacy = httpsCallable(functions, "updateContactPrivacy");
    await updateContactPrivacy(envelope({ contactId: created.contact.id, coreCrmLegalBasis: "legitimate_interest", noticeStatus: "completed", noticeMethod: "verbal", noticeVersion: "v1", marketingConsent: "granted", marketingChannels: ["whatsapp"], iysStatus: "approved", profilingObjection: false }, "request-privacy", "command-privacy"));
    const createPresentation = httpsCallable(functions, "createPresentation");
    const presentation = (await createPresentation(envelope({ listingId: listing.listing.id, contactId: created.contact.id, message: "Integration listing presentation", channel: "whatsapp" }, "request-presentation", "command-presentation"))).data as { presentationId: string };
    const advancePresentation = httpsCallable(functions, "advancePresentation");
    await advancePresentation(envelope({ presentationId: presentation.presentationId, toStatus: "user_approved" }, "request-presentation-approved", "command-presentation-approved"));
    await advancePresentation(envelope({ presentationId: presentation.presentationId, toStatus: "sent" }, "request-presentation-sent", "command-presentation-sent"));

    const createDeal = httpsCallable(functions, "createDeal");
    const deal = (await createDeal(envelope({ listingId: listing.listing.id, buyerContactId: created.contact.id }, "request-deal", "command-deal"))).data as { dealId: string };
    const advanceDeal = httpsCallable(functions, "advanceDeal");
    await advanceDeal(envelope({ dealId: deal.dealId, toStage: "viewing", offerAmount: null, currency: null, lostReason: null }, "request-deal-viewing", "command-deal-viewing"));
    await advanceDeal(envelope({ dealId: deal.dealId, toStage: "offer", offerAmount: 9_500_000, currency: "TRY", lostReason: null }, "request-deal-offer", "command-deal-offer"));
    const getClosingOverview = httpsCallable(functions, "getClosingOverview");
    const closing = (await getClosingOverview(envelope(undefined, "request-closing"))).data as { presentations: Array<{ id: string; status: string }>; deals: Array<{ id: string; stage: string }> };
    expect(closing.presentations).toEqual([expect.objectContaining({ id: presentation.presentationId, status: "sent" })]);
    expect(closing.deals).toEqual([expect.objectContaining({ id: deal.dealId, stage: "offer" })]);

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
    const confirmVoiceNote = httpsCallable(functions, "confirmVoiceNote");
    const confirmedVoice = (await confirmVoiceNote(envelope({
      voiceNoteId: registeredVoice.voiceNoteId,
      interaction: {
        contactId: created.contact.id,
        channel: "phone",
        objective: "follow_up",
        direction: "outbound",
        outcome: "Yarın yeniden arayacağım.",
        askOutcome: "not_asked",
        nextActionType: "call",
        nextActionAt: Date.now() + 86_400_000,
        noteSummary: "Yarın yeniden arayacağım. [HASSAS İÇERİK MASKELENDİ]",
      },
    }, "request-voice-confirm", "command-voice-confirm"))).data as { interactionId: string };
    expect(confirmedVoice.interactionId).toBeTruthy();
  }, 35_000);
});
