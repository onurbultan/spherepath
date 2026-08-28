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

beforeAll(async () => {
  const rules = await readFile(resolve(import.meta.dirname, "../firebase/firestore.rules"), "utf8");
  environment = await initializeTestEnvironment({
    projectId: "spherepath-rules-test",
    firestore: { rules },
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "contacts", "alice-contact"), {
      officeId: "office-a",
      ownerUid: "alice",
      relationship: { nextActionAt: null, nextActionType: null },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(firestore, "contacts", "other-contact"), {
      officeId: "office-b",
      ownerUid: "bob",
      relationship: { nextActionAt: null, nextActionType: null },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(firestore, "opportunities", "alice-opportunity"), {
      officeId: "office-a",
      ownerUid: "alice",
      subjectContactId: "alice-contact",
      stage: "yeni_lead",
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

  it("rejects direct client stage transitions", async () => {
    const firestore = environment
      .authenticatedContext("alice", { officeId: "office-a", role: "agent" })
      .firestore();

    await assertFails(
      updateDoc(doc(firestore, "opportunities", "alice-opportunity"), {
        stage: "kazanildi",
        updatedAt: new Date(),
      }),
    );
  });
});
