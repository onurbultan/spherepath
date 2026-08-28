import { describe, expect, it } from "vitest";
import { canMarketOnChannel, contactPrivacyDraftSchema } from "./contact-privacy.js";
describe("contact privacy", () => {
  it("keeps notice and marketing consent independent", () => { expect(contactPrivacyDraftSchema.safeParse({ contactId: "c", coreCrmLegalBasis: "legitimate_interest", noticeStatus: "completed", noticeMethod: null, noticeVersion: null, marketingConsent: "unknown", marketingChannels: [], iysStatus: "unknown", profilingObjection: false }).success).toBe(false); });
  it("hard-blocks a channel without all compliance gates", () => { expect(canMarketOnChannel({ noticeStatus: "completed", marketingConsent: "granted", marketingChannels: ["whatsapp"], iysStatus: "unknown", profilingObjection: false }, "whatsapp").allowed).toBe(false); });
  it("allows only a fully compliant channel", () => { expect(canMarketOnChannel({ noticeStatus: "completed", marketingConsent: "granted", marketingChannels: ["whatsapp"], iysStatus: "approved", profilingObjection: false }, "whatsapp").allowed).toBe(true); });
});
