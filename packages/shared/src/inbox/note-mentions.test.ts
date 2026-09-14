import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  completeMention,
  extractMentions,
  mentionSpans,
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

  it("keeps whatever was written after the caret, without doubling the space", () => {
    const text = "@Ak referans oldu";
    const completed = completeMention(text, 0, 3, "Akın Demir");
    expect(completed.text).toBe("@Akın Demir referans oldu");
  });
});

describe("completing a tag without eating what follows it", () => {
  it("does not keep the name it just replaced", () => {
    const text = "Yetki aldık, @Deniz Aktaş referans oldu.";
    const active = activeMentionQuery(text, "Yetki aldık, @Deniz Aktaş".length)!;
    const completed = completeMention(text, active.start, "Yetki aldık, @Deniz Aktaş".length, "Deniz Aktaş");
    expect(completed.text).toBe("Yetki aldık, @Deniz Aktaş referans oldu.");
  });

  it("does not leave a double space behind the name", () => {
    const text = "Yetki aldık, @Deniz referans oldu.";
    const completed = completeMention(text, 13, "Yetki aldık, @Deniz".length, "Deniz Aktaş");
    expect(completed.text).toBe("Yetki aldık, @Deniz Aktaş referans oldu.");
  });

  it("still adds the space when the tag ends the line", () => {
    const completed = completeMention("Yetki aldık, @Den", 13, 17, "Deniz Aktaş");
    expect(completed.text).toBe("Yetki aldık, @Deniz Aktaş ");
  });
});

describe("Turkish case suffixes on a tagged name", () => {
  const contacts = [
    { id: "c1", name: "Burcu Şahin" },
    { id: "c2", name: "Deniz Aktaş" },
    { id: "c3", name: "Mehmet Korkmaz" },
  ];

  it("ends the name at the apostrophe and drops the suffix", () => {
    expect(extractMentions("@Burcu Şahin'e Alaçatı'da daire çıktı")[0]?.name).toBe("Burcu Şahin");
    expect(extractMentions("@Deniz Aktaş'ın dairesi için")[0]?.name).toBe("Deniz Aktaş");
    expect(extractMentions("@Mehmet Korkmaz'dan haber bekliyorum")[0]?.name).toBe("Mehmet Korkmaz");
  });

  it("matches the contact despite the suffix", () => {
    expect(resolveMentions("@Burcu Şahin'e Alaçatı'da daire çıktı", contacts)[0]?.contactId).toBe("c1");
  });

  it("does not let the suffix swallow the place name after it", () => {
    expect(extractMentions("@Burcu Şahin'e Alaçatı'da daire çıktı")).toHaveLength(1);
  });

  it("still refuses an address, where the @ follows a letter", () => {
    expect(extractMentions("onur@Example.com yazdı")).toEqual([]);
  });
});

describe("marking the tags without changing the text", () => {
  it("puts back exactly what it was given", () => {
    const text = "Yetki aldık, @Deniz Aktaş referans oldu.\n@Burcu Şahin'e daire çıktı";
    expect(mentionSpans(text).map((span) => span.text).join("")).toBe(text);
  });

  it("marks the tag and nothing around it", () => {
    const spans = mentionSpans("Yetki aldık, @Deniz Aktaş referans oldu.");
    expect(spans.filter((span) => span.isMention).map((span) => span.text)).toEqual(["@Deniz Aktaş"]);
  });

  it("marks the name without the Turkish suffix that follows it", () => {
    const spans = mentionSpans("@Burcu Şahin'e daire çıktı");
    expect(spans[0]).toEqual({ text: "@Burcu Şahin'e", isMention: true });
  });

  it("leaves a note with no tags as one span", () => {
    expect(mentionSpans("Bugün kimseyle görüşmedim")).toEqual([{ text: "Bugün kimseyle görüşmedim", isMention: false }]);
  });

  it("returns nothing for an empty note", () => {
    expect(mentionSpans("")).toEqual([]);
  });
});
