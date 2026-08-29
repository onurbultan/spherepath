import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { collection, doc, writeBatch } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const projectId = "spherepath-96ecd";
const app = initializeApp({ apiKey: "demo-key", projectId, authDomain: `${projectId}.firebaseapp.com` }, "scale-integration");
const auth = getAuth(app);
const functions = getFunctions(app, "europe-west8");
let testEnvironment: RulesTestEnvironment;

function envelope<T>(data: T, requestId: string) {
  return { data, requestId };
}

beforeAll(async () => {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  testEnvironment = await initializeTestEnvironment({ projectId });
});

afterAll(async () => {
  await Promise.all([deleteApp(app), testEnvironment.cleanup()]);
});

describe("pilot scale", () => {
  it("keeps 1,000 contacts visible and builds the daily and funnel views without truncation", async () => {
    const credential = await createUserWithEmailAndPassword(auth, `scale-${Date.now()}@example.test`, "Test1234!");
    const bootstrap = httpsCallable(functions, "bootstrapWorkspace");
    const workspace = (await bootstrap({ ...envelope({ displayName: "Scale Test" }, "request-scale-bootstrap"), commandId: "command-scale-bootstrap" })).data as { officeId: string };
    await credential.user.getIdToken(true);
    const now = new Date();

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (let offset = 0; offset < 1_000; offset += 250) {
        const batch = writeBatch(db);
        for (let index = offset; index < offset + 250; index += 1) {
          batch.set(doc(collection(db, "contacts"), `scale-contact-${index.toString().padStart(4, "0")}`), {
            officeId: workspace.officeId,
            ownerUid: credential.user.uid,
            phone: null,
            phoneHash: null,
            fullName: `Scale Contact ${index}`,
            label: null,
            metAtPlace: "Urla",
            metAt: now,
            source: "in_person",
            roles: ["buyer"],
            relationship: {
              stage: "active",
              meaningfulTouchCount: 1,
              reciprocalTouchCount: 1,
              lastTouchAt: now,
              nextActionAt: null,
              nextActionType: null,
              lastObjective: "get_acquainted",
              lastAskOutcome: "not_asked",
              referralCount: 0,
            },
            memory: {
              keyThingsToRemember: [],
              propertyPreferences: {
                transactionType: null,
                propertyTypes: [],
                preferredLocations: [],
                budgetRange: null,
                bedroomCountMin: null,
                livingRoomCountMin: null,
                roomCountMin: null,
                areaMinM2: null,
                areaMaxM2: null,
                mustHaves: [],
                dealBreakers: [],
                timeline: null,
              },
              updatedAt: null,
            },
            privacy: {
              purposes: { core_crm: { legalBasis: "legitimate_interest", startedAt: now } },
              noticeStatus: "pending",
              noticeAt: null,
              noticeMethod: null,
              noticeVersion: null,
              marketingConsent: "unknown",
              marketingConsentAt: null,
              marketingWithdrawnAt: null,
              marketingChannels: [],
              iysStatus: "unknown",
              iysCheckedAt: null,
              profilingObjection: false,
              deletionRequestedAt: null,
            },
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
        await batch.commit();
      }
    });

    const listContacts = httpsCallable(functions, "listContacts");
    const startedContacts = performance.now();
    const listed = (await listContacts(envelope(undefined, "request-scale-contacts"))).data as { contacts: Array<{ id: string }> };
    const contactsDuration = performance.now() - startedContacts;
    expect(listed.contacts).toHaveLength(1_000);
    expect(contactsDuration).toBeLessThan(10_000);

    const getTodayOverview = httpsCallable(functions, "getTodayOverview");
    const startedToday = performance.now();
    const today = (await getTodayOverview(envelope({ period: "30d" }, "request-scale-today"))).data as { overview: { stages: { acquaintance: number; relationship: number }; tasks: unknown[] } };
    const todayDuration = performance.now() - startedToday;
    expect(today.overview.stages).toMatchObject({ acquaintance: 1_000, relationship: 1_000 });
    expect(todayDuration).toBeLessThan(10_000);

    const getFunnelOverview = httpsCallable(functions, "getFunnelOverview");
    const startedFunnel = performance.now();
    const funnel = (await getFunnelOverview(envelope({ period: "30d" }, "request-scale-funnel"))).data as { overview: { counts: { newPeople: number } } };
    const funnelDuration = performance.now() - startedFunnel;
    expect(funnel.overview.counts.newPeople).toBe(1_000);
    expect(funnelDuration).toBeLessThan(10_000);
  }, 45_000);
});
