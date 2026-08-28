import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from "firebase/firestore";

const projectId = "spherepath-rules-test";
let environment: RulesTestEnvironment;

beforeAll(async () => {
  const rulesPath = fileURLToPath(new URL("../firebase/firestore.rules", import.meta.url));
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(rulesPath, "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "contacts", "contact-1"), {
      officeId: "office-1",
      ownerUid: "user-1",
      fullName: "Test Contact",
    });
  });
});

afterAll(async () => {
  await environment.cleanup();
});

function authenticatedFirestore() {
  return environment.authenticatedContext("user-1", {
    officeId: "office-1",
    role: "agent",
  }).firestore();
}

describe("API-first Firestore boundary", () => {
  it("denies authenticated domain reads", async () => {
    const firestore = authenticatedFirestore();
    await assertFails(getDoc(doc(firestore, "contacts", "contact-1")));
    await assertFails(getDocs(collection(firestore, "contacts")));
  });

  it("denies authenticated domain writes", async () => {
    const firestore = authenticatedFirestore();
    await assertFails(setDoc(doc(firestore, "contacts", "contact-2"), { fullName: "Blocked" }));
    await assertFails(updateDoc(doc(firestore, "contacts", "contact-1"), { fullName: "Blocked" }));
    await assertFails(setDoc(doc(firestore, "interactions", "interaction-1"), { outcome: "Blocked" }));
    await assertFails(setDoc(doc(firestore, "commands", "command-1"), { type: "Blocked" }));
  });

  it("denies unauthenticated access", async () => {
    const firestore = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(firestore, "contacts", "contact-1")));
    await assertFails(setDoc(doc(firestore, "opportunities", "opportunity-1"), { stage: "lead" }));
  });
});
