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
    await completeDailyTask(envelope({ taskId: `opportunity-action-${opportunity.opportunity.id}`, status: "completed", outcomeNote: null, skippedReason: null, rescheduledAt: null, rescheduledActionType: null }, "request-task-complete", "command-task-complete"));
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
        suggestedActionReason: "Yarın yeniden arama sözü verildi.",
      },
      opportunity: {
        type: "buyer_requirement",
        nextActionType: "call",
        nextActionAt: Date.now() + 86_400_000,
      },
    }, "request-voice-confirm", "command-voice-confirm"))).data as { interactionId: string; opportunityId: string | null };
    expect(confirmedVoice.interactionId).toBeTruthy();
    expect(confirmedVoice.opportunityId).toBeTruthy();
    const contactsAfterVoice = (await listContacts(envelope(undefined, "request-list-after-voice"))).data as { contacts: Array<{ id: string; memory: { keyThingsToRemember: string[] } }> };
    expect(contactsAfterVoice.contacts[0]?.memory.keyThingsToRemember).toContain("Yarın yeniden aranacak.");

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
    expect(portfolioMatches.matches).toEqual([expect.objectContaining({ contactId: created.contact.id, eligible: true, score: 100, portfolioItem: expect.objectContaining({ id: portfolio.portfolioItem.id }) })]);
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

    const createDataSubjectRequest = httpsCallable(functions, "createDataSubjectRequest");
    const accessRequest = (await createDataSubjectRequest(envelope({
      contactId: created.contact.id,
      type: "access",
      requesterReference: "integration-access",
      details: "",
    }, "request-data-access", "command-data-access"))).data as { request: { id: string; status: string } };
    expect(accessRequest.request.status).toBe("pending_verification");
    const getContactDataExport = httpsCallable(functions, "getContactDataExport");
    const contactExport = (await getContactDataExport(envelope({ contactId: created.contact.id }, "request-contact-export"))).data as { export: { contact: { id: string }; interactions: unknown[]; opportunities: unknown[] } };
    expect(contactExport.export.contact.id).toBe(created.contact.id);
    expect(contactExport.export.interactions.length).toBeGreaterThan(0);
    expect(contactExport.export.opportunities.length).toBeGreaterThan(0);
    const resolveDataSubjectRequest = httpsCallable(functions, "resolveDataSubjectRequest");
    await resolveDataSubjectRequest(envelope({ requestId: accessRequest.request.id, decision: "approved", resolutionNote: "Identity verified.", correctedContact: null }, "request-data-access-resolve", "command-data-access-resolve"));

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
