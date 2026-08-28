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
    await bootstrap(envelope({ displayName: "API Test" }, "request-bootstrap", "command-bootstrap"));
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
  }, 15_000);
});
