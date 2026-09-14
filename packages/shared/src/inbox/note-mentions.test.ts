import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  completeMention,
  extractMentions,
  mentionedContactIds,
  resolveMentions,
} from "./note-mentions.js";

const contacts = [
  { id: "c1", name: "Akın Demir" },
  { id: "c2", name: "Şafak Kaya" },
  { id: "c3", name: "Ayşe Yılmaz" },
];

describe("tagging somebody in the day's page", () => {
  it("finds a tagged name in the middle of a line", () => {
    const mentions = extractMentions("Zeytinler'de ikiz villa portföy aldık, @Akın Demir referans oldu");
    expect(mentions.map((mention) => mention.name)).toEqual(["Akın Demir"]);
  });

  it("finds several tags on one line", () => {
    const mentions = extractMentions("Satış oldu, @Şafak Kaya ve @Ayşe Yılmaz ile ortak yaptık");
    expect(mentions.map((mention) => mention.name)).toEqual(["Şafak Kaya", "Ayşe Yılmaz"]);
  });

  it("stops the name at the lowercase word that follows it", () => {
    expect(extractMentions("@Akın aradı bugün")[0]?.name).toBe("Akın");
  });

  it("reads Turkish letters as part of a name", () => {
    expect(extractMentions("@Çiğdem Öztürk ile görüştüm")[0]?.name).toBe("Çiğdem Öztürk");
  });

  it("ignores an email address, which is not a tag", () => {
    expect(extractMentions("onur@example.com yazdı")).toEqual([]);
  });

  it("resolves a tag to the contact it names", () => {
    const resolved = resolveMentions("@Akın Demir referans oldu", contacts);
    expect(resolved[0]).toMatchObject({ contactId: "c1", contactName: "Akın Demir" });
  });

  it("keeps a tag that matches nobody, because the advisor still meant somebody", () => {
    const resolved = resolveMentions("@Gökhan Bey aradı", contacts);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.contactId).toBeNull();
  });

  it("lists each tagged contact once, in the order written", () => {
    expect(mentionedContactIds("@Şafak Kaya ve @Akın Demir, sonra yine @Şafak Kaya", contacts)).toEqual(["c2", "c1"]);
  });
});

describe("offering the picker while a tag is being typed", () => {
  it("offers the picker as soon as the @ is typed", () => {
    expect(activeMentionQuery("Portföy geldi, @", 16)).toEqual({ query: "", start: 15 });
  });

  it("carries what has been typed so far as the search", () => {
    const text = "Portföy geldi, @Ak";
    expect(activeMentionQuery(text, text.length)?.query).toBe("Ak");
  });

  it("stops offering once the line has run on past a name", () => {
    const text = "@Akın Demir referans oldu ve sonra bize geldi";
    expect(activeMentionQuery(text, text.length)).toBeNull();
  });

  it("does not open on an email address", () => {
    const text = "onur@example";
    expect(activeMentionQuery(text, text.length)).toBeNull();
  });

  it("does not follow the advisor onto the next line", () => {
    const text = "@Akın\nyeni satır";
    expect(activeMentionQuery(text, text.length)).toBeNull();
  });

  it("completes the tag and leaves the caret ready to keep writing", () => {
    const text = "Portföy geldi, @Ak";
    const active = activeMentionQuery(text, text.length)!;
    const completed = completeMention(text, active.start, text.length, "Akın Demir");
    expect(completed.text).toBe("Portföy geldi, @Akın Demir ");
    expect(completed.caret).toBe(completed.text.length);
  });

  it("keeps whatever was written after the caret", () => {
    const text = "@Ak referans oldu";
    const completed = completeMention(text, 0, 3, "Akın Demir");
    expect(completed.text).toBe("@Akın Demir  referans oldu");
  });
});
