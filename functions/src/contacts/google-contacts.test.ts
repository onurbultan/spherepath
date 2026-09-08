import { describe, expect, it, vi } from "vitest";
import { googleContactToImport, readGoogleContacts } from "./google-contacts.js";

describe("Google contact adapter", () => {
  it("uses the stable contact source and keeps notes plus all communication fields", () => {
    expect(googleContactToImport({ resourceName: "people/merged", metadata: { sources: [{ type: "CONTACT", id: "stable-id" }] }, names: [{ displayName: "Ayşe" }], phoneNumbers: [{ value: "05331234567" }, { value: "05321234567", metadata: { primary: true } }], emailAddresses: [{ value: "a@example.com" }, { value: "b@example.com" }], biographies: [{ value: "3+1 arıyor.\nEkimde ara." }] })).toMatchObject({ sourceId: "stable-id", phones: ["05321234567", "05331234567"], emails: ["a@example.com", "b@example.com"], note: "3+1 arıyor.\nEkimde ara." });
  });
  it("follows all pages and requests only contacts with notes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ connections: [{ resourceName: "people/1", names: [{ displayName: "Ayşe" }] }], nextPageToken: "page-2" }))).mockResolvedValueOnce(new Response(JSON.stringify({ connections: [{ resourceName: "people/2", names: [{ displayName: "Mehmet" }] }] })));
    expect(await readGoogleContacts("secret", fetcher)).toHaveLength(2);
    const url = new URL(String(fetcher.mock.calls[1]![0]));
    expect(url.searchParams.get("pageToken")).toBe("page-2");
    expect(url.searchParams.get("personFields")).toContain("biographies");
    expect(url.searchParams.get("sources")).toBe("READ_SOURCE_TYPE_CONTACT");
    expect(url.toString()).not.toContain("secret");
  });
  it("does not return partial contacts after a provider error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ connections: [{ resourceName: "people/1", names: [{ displayName: "Ayşe" }] }], nextPageToken: "next" }))).mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(readGoogleContacts("secret", fetcher)).rejects.toThrow("google_failed");
  });
  it("bounds repeated provider cursors and total contacts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ connections: [{ resourceName: "people/1", names: [{ displayName: "Ayşe" }] }], nextPageToken: "repeated" })));
    await expect(readGoogleContacts("secret", fetcher)).rejects.toThrow("google_failed");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const many = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ connections: Array.from({ length: 5001 }, (_, i) => ({ resourceName: `people/${i}`, names: [{ displayName: "Ayşe" }] })) })));
    await expect(readGoogleContacts("secret", many)).rejects.toThrow("too_many_contacts");
  });
  it("reads all five pages of a 5,000-contact Google address book", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("pageToken") ?? 0);
      return new Response(JSON.stringify({ connections: Array.from({ length: 1_000 }, (_, index) => ({ resourceName: `people/${page * 1_000 + index}`, names: [{ displayName: "Ayşe" }] })), ...(page < 4 ? { nextPageToken: String(page + 1) } : {}) }));
    });
    const people = await readGoogleContacts("secret", fetcher);
    expect(people).toHaveLength(5_000);
    expect(people.at(-1)?.sourceId).toBe("people/4999");
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});
