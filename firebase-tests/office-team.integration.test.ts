import { afterAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const projectId = "spherepath-96ecd";
const apps: FirebaseApp[] = [];

function testApp(name: string) {
  const app = initializeApp({ apiKey: "demo-key", projectId, authDomain: `${projectId}.firebaseapp.com` }, name);
  apps.push(app);
  const auth = getAuth(app);
  const functions = getFunctions(app, "europe-west8");
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return { auth, functions };
}

function envelope<T>(data: T, requestId: string, commandId?: string) {
  return { data, requestId, commandId };
}

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
});

describe("office team API", () => {
  it("invites an agent into a shared office while preserving ownership boundaries", async () => {
    const suffix = Date.now();
    const owner = testApp(`office-owner-${suffix}`);
    const member = testApp(`office-member-${suffix}`);
    const ownerCredential = await createUserWithEmailAndPassword(owner.auth, `owner-${suffix}@example.test`, "Test1234!");
    const ownerBootstrap = httpsCallable(owner.functions, "bootstrapWorkspace");
    const ownerIdentity = (await ownerBootstrap(envelope({ displayName: "Broker Test" }, "request-owner-bootstrap", "command-owner-bootstrap"))).data as { officeId: string; role: string };
    expect(ownerIdentity.role).toBe("broker");
    await ownerCredential.user.getIdToken(true);

    const createInvite = httpsCallable(owner.functions, "createOfficeInvite");
    const invite = (await createInvite(envelope(undefined, "request-create-invite", "command-create-invite"))).data as { invite: { code: string; officeId: string } };
    expect(invite.invite).toMatchObject({ officeId: ownerIdentity.officeId });
    expect(invite.invite.code).toHaveLength(8);

    const memberCredential = await createUserWithEmailAndPassword(member.auth, `member-${suffix}@example.test`, "Test1234!");
    const memberBootstrap = httpsCallable(member.functions, "bootstrapWorkspace");
    const memberIdentity = (await memberBootstrap(envelope({ displayName: "Danışman Test" }, "request-member-bootstrap", "command-member-bootstrap"))).data as { officeId: string };
    expect(memberIdentity.officeId).not.toBe(ownerIdentity.officeId);
    await memberCredential.user.getIdToken(true);

    const joinOffice = httpsCallable(member.functions, "joinOffice");
    const joined = (await joinOffice(envelope({ code: invite.invite.code }, "request-join-office", "command-join-office"))).data as { officeId: string; role: string };
    expect(joined).toEqual({ officeId: ownerIdentity.officeId, role: "agent" });
    await memberCredential.user.getIdToken(true);

    const directInvite = (await createInvite(envelope(undefined, "request-create-direct-invite", "command-create-direct-invite"))).data as { invite: { code: string } };
    const directMember = testApp(`office-direct-member-${suffix}`);
    const directCredential = await createUserWithEmailAndPassword(directMember.auth, `direct-${suffix}@example.test`, "Test1234!");
    const directBootstrap = httpsCallable(directMember.functions, "bootstrapWorkspace");
    const directIdentity = (await directBootstrap(envelope({ displayName: "Doğrudan Katılan", inviteCode: directInvite.invite.code }, "request-direct-bootstrap", "command-direct-bootstrap"))).data as { officeId: string; role: string };
    expect(directIdentity).toEqual({ officeId: ownerIdentity.officeId, role: "agent" });
    await directCredential.user.getIdToken(true);

    const getTeamAsOwner = httpsCallable(owner.functions, "getOfficeTeam");
    const team = (await getTeamAsOwner(envelope(undefined, "request-owner-team"))).data as { team: { members: Array<{ displayName: string; role: string }> } };
    expect(team.team.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: "Broker Test", role: "broker" }),
      expect.objectContaining({ displayName: "Danışman Test", role: "agent" }),
      expect.objectContaining({ displayName: "Doğrudan Katılan", role: "agent" }),
    ]));

    const temporaryInvite = (await createInvite(envelope(undefined, "request-create-revocable-invite", "command-create-revocable-invite"))).data as { invite: { code: string } };
    const revokeInvite = httpsCallable(owner.functions, "revokeOfficeInvite");
    await revokeInvite(envelope({ code: temporaryInvite.invite.code }, "request-revoke-invite", "command-revoke-invite"));
    const teamAfterRevocation = (await getTeamAsOwner(envelope(undefined, "request-owner-team-after-revoke"))).data as { team: { canJoinOffice: boolean; activeInvites: Array<{ code: string }> } };
    expect(teamAfterRevocation.team.canJoinOffice).toBe(false);
    expect(teamAfterRevocation.team.activeInvites.map((item) => item.code)).not.toContain(temporaryInvite.invite.code);

    const createMemberContact = httpsCallable(member.functions, "createContact");
    const memberContact = (await createMemberContact(envelope({
      fullName: "Member Contact", phone: "", metAtPlace: "Shared office test", source: "in_person", role: "buyer",
    }, "request-member-contact", "command-member-contact"))).data as { contact: { id: string } };
    const listAsMember = httpsCallable(member.functions, "listContacts");
    const memberContacts = (await listAsMember(envelope(undefined, "request-member-contacts"))).data as { contacts: Array<{ id: string }> };
    expect(memberContacts.contacts.map((contact) => contact.id)).toEqual([memberContact.contact.id]);
    const listAsOwner = httpsCallable(owner.functions, "listContacts");
    const ownerContacts = (await listAsOwner(envelope(undefined, "request-owner-contacts"))).data as { contacts: Array<{ id: string }> };
    expect(ownerContacts.contacts.map((contact) => contact.id)).toContain(memberContact.contact.id);

    const createPortfolioItem = httpsCallable(owner.functions, "createPortfolioItemFromDraft");
    const portfolio = (await createPortfolioItem(envelope({
      source: "manual",
      sourceAuthorName: "Broker Test",
      headline: "Shared Urla villa",
      summary: "Shared office integration portfolio",
      transactionType: "sell",
      propertyType: "villa",
      location: "Urla",
      askingPrice: { amount: 20_000_000, currency: "TRY" },
      bedroomCount: 3,
      livingRoomCount: 1,
      areaM2: 180,
      landAreaM2: null,
      features: ["parking", "garden"],
      attributes: [],
      authorizationType: "exclusive",
      titleDeedType: "full",
      constructionAllowed: null,
      listingUrl: null,
    }, "request-owner-portfolio", "command-owner-portfolio"))).data as { portfolioItem: { id: string } };
    const listPortfolioAsMember = httpsCallable(member.functions, "listPortfolioItems");
    const sharedPortfolio = (await listPortfolioAsMember(envelope(undefined, "request-member-portfolio"))).data as { portfolioItems: Array<{ id: string }> };
    expect(sharedPortfolio.portfolioItems.map((item) => item.id)).toContain(portfolio.portfolioItem.id);

    const memberInvite = httpsCallable(member.functions, "createOfficeInvite");
    await expect(memberInvite(envelope(undefined, "request-member-invite", "command-member-invite"))).rejects.toMatchObject({ code: "functions/permission-denied" });
    const withdrawAsMember = httpsCallable(member.functions, "withdrawPortfolioItem");
    await expect(withdrawAsMember(envelope({ portfolioItemId: portfolio.portfolioItem.id }, "request-member-withdraw", "command-member-withdraw"))).rejects.toMatchObject({ code: "functions/permission-denied" });
  }, 30_000);
});
