import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let environment: RulesTestEnvironment;

function contactDocument(officeId: string, ownerUid: string) {
  return {
    officeId,
    ownerUid,
    phone: null,
    phoneHash: null,
    fullName: "Ayşe Kaya",
    label: null,
    metAtPlace: null,
    metAt: new Date(),
    source: "referral",
    roles: ["seller"],
    relationship: {
      stage: "new",
      meaningfulTouchCount: 0,
      reciprocalTouchCount: 0,
      lastTouchAt: null,
      nextActionAt: null,
      nextActionType: null,
      lastObjective: null,
      lastAskOutcome: null,
      referralCount: 0,
    },
    privacy: {
      noticeStatus: "pending",
      noticeAt: null,
      noticeMethod: null,
      noticeVersion: null,
      marketingConsent: "unknown",
      marketingChannels: [],
      profilingObjection: false,
      deletionRequestedAt: null,
    },
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeAll(async () => {
  const rules = await readFile(resolve(import.meta.dirname, "../firebase/firestore.rules"), "utf8");
  environment = await initializeTestEnvironment({
    projectId: "spherepath-rules-test",
    firestore: { rules },
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "contacts", "alice-contact"), contactDocument("office-a", "alice"));
    await setDoc(doc(firestore, "contacts", "other-contact"), contactDocument("office-b", "bob"));
    await setDoc(doc(firestore, "opportunities", "alice-opportunity"), {
      officeId: "office-a",
      ownerUid: "alice",
      subjectContactId: "alice-contact",
      stage: "new_lead",
      nextActionAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
});

afterAll(async () => {
  await environment.cleanup();
});

describe("Spherepath tenant isolation", () => {
  it("allows an agent to read an owned contact but not another office", async () => {
    const firestore = environment
      .authenticatedContext("alice", { officeId: "office-a", role: "agent" })
      .firestore();

    await assertSucceeds(getDoc(doc(firestore, "contacts", "alice-contact")));
    await assertFails(getDoc(doc(firestore, "contacts", "other-contact")));
  });

  it("requires list queries to carry tenant and owner constraints", async () => {
    const firestore = environment
      .authenticatedContext("alice", { officeId: "office-a", role: "agent" })
      .firestore();

    const scoped = query(
      collection(firestore, "contacts"),
      where("officeId", "==", "office-a"),
      where("ownerUid", "==", "alice"),
      limit(20),
    );
    await assertSucceeds(getDocs(scoped));
    await assertFails(getDocs(query(collection(firestore, "contacts"), limit(20))));
  });

  it("allows a complete owned contact and rejects client-selected tenant identity", async () => {
    const firestore = environment
      .authenticatedContext("alice", { officeId: "office-a", role: "agent" })
      .firestore();

    await assertSucceeds(setDoc(doc(firestore, "contacts", "new-contact"), contactDocument("office-a", "alice")));
    await assertFails(setDoc(doc(firestore, "contacts", "forged-contact"), contactDocument("office-b", "alice")));
  });

  it("allows profile edits but rejects relationship stage manipulation", async () => {
    const firestore = environment
      .authenticatedContext("alice", { officeId: "office-a", role: "agent" })
      .firestore();

    await assertSucceeds(updateDoc(doc(firestore, "contacts", "alice-contact"), {
      fullName: "Ayşe Kaya Yılmaz",
      updatedAt: new Date(),
    }));
    await assertFails(updateDoc(doc(firestore, "contacts", "alice-contact"), {
      "relationship.stage": "active",
      updatedAt: new Date(),
    }));
  });

  it("allows an owner to soft-delete a contact without deleting its audit trail", async () => {
    const firestore = environment
      .authenticatedContext("alice", { officeId: "office-a", role: "agent" })
      .firestore();

    await assertSucceeds(updateDoc(doc(firestore, "contacts", "alice-contact"), {
      deletedAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it("rejects direct client stage transitions", async () => {
    const firestore = environment
      .authenticatedContext("alice", { officeId: "office-a", role: "agent" })
      .firestore();

    await assertFails(
      updateDoc(doc(firestore, "opportunities", "alice-opportunity"), {
        stage: "won",
        updatedAt: new Date(),
      }),
    );
  });
});
