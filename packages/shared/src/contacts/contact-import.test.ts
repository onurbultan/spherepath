import { describe, expect, it } from "vitest";
import { selectedImportRowIds, importIdentityKeys, matchImportContact, parseContactCsv, mergeImportedChannels, importUtf8Size, commitContactImportSchema, type ImportContact } from "./contact-import.js";

const person: ImportContact = { sourceId: "1", fullName: "Ayşe Yılmaz", phones: ["05321234567"], emails: ["AYSE@example.com"], note: "Bahçeli ev arıyor.", noteMasked: false };
describe("contact import rules", () => {
  it("reads Google CSV BOM, quoted commas, escaped quotes, CRLF and multiline notes without truncation", () => {
    const csv = '\uFEFFName,Phone 1 - Value,Phone 2 - Value,E-mail 1 - Value,Notes\r\n"Yılmaz, Ayşe",05321234567,+905331234567,ayse@example.com,"3+1, bahçeli\n""Ekimde ara"""\r\n';
    const result = parseContactCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fullName: "Yılmaz, Ayşe", phones: ["05321234567", "+905331234567"], emails: ["ayse@example.com"], note: '3+1, bahçeli\n"Ekimde ara"' });
  });
  it("supports both Google name header generations and multiple values", () => {
    expect(parseContactCsv('First Name,Last Name,Phone 1 - Value,Notes\nAyşe,Yılmaz,05321234567 ::: 05331234567,Uzun not')[0]).toMatchObject({ fullName: "Ayşe Yılmaz", phones: ["05321234567", "05331234567"] });
    expect(parseContactCsv('Given Name,Family Name\nAyşe,Yılmaz')[0]?.fullName).toBe("Ayşe Yılmaz");
  });
  it("preserves address-book display names, phone columns and numbered email addresses", () => {
    const csv = 'First Name,Last Name,Display Name,Home Phone,Business Phone,Mobile Phone,E-mail Address,E-mail 2 Address,E-mail 3 Address,Notes,Home Fax,Gender\nAyşe,Yılmaz,Ayşe Hanım,05321234567,02321234567,05331234567,ayse@example.test,work@example.test,other@example.test,"Bahçe, iki oda",02329999999,F';
    expect(parseContactCsv(csv)[0]).toMatchObject({ fullName: "Ayşe Hanım", phones: ["05321234567", "02321234567", "05331234567"], emails: ["ayse@example.test", "work@example.test", "other@example.test"], note: "Bahçe, iki oda" });
    expect(parseContactCsv('First Name,Last Name,Display Name\nAyşe,Yılmaz,  ')[0]?.fullName).toBe("Ayşe Yılmaz");
    expect(parseContactCsv('Display Name,Mobile Phone\nAyşe,05321234567')[0]?.fullName).toBe("Ayşe");
  });
  it("deduplicates communication values across Google and address-book headers", () => {
    expect(parseContactCsv('Name,Phone 1 - Value,Home Phone,Mobile Phone,E-mail 1 - Value,E-mail Address\nAyşe,05321234567,05321234567,05331234567 ::: 05321234567,a@example.test,a@example.test')[0]).toMatchObject({ phones: ["05321234567", "05331234567"], emails: ["a@example.test"] });
  });
  it("previews and confirms all 5,000 contacts, but rejects a 5,001st row", () => {
    const csv = "Name,E-mail 1 - Value\n" + Array.from({ length: 5_000 }, (_, index) => `Kişi ${index},person${index}@example.test`).join("\n");
    const people = parseContactCsv(csv);
    expect(people).toHaveLength(5_000);
    expect(people.at(-1)).toMatchObject({ sourceId: "4999", fullName: "Kişi 4999", emails: ["person4999@example.test"] });
    const rowIds = selectedImportRowIds(people.map((_, index) => String(index).padStart(6, "0")), new Set());
    expect(commitContactImportSchema.safeParse({ jobId: "large-import", rowIds }).success).toBe(true);
    expect(commitContactImportSchema.safeParse({ jobId: "large-import", rowIds: [...rowIds, "005000"] }).success).toBe(false);
    expect(() => parseContactCsv(csv + "\nFazla Kişi,extra@example.test")).toThrow("too_many_contacts");
  });
  it.each(['Name,Notes\nAyşe,"unfinished', 'Name,Notes\nAyşe,"closed"garbage', 'Name,Notes\nAyşe,extra,column', 'Name,Notes\nAy"şe,note'])('rejects malformed CSV: %s', (csv) => {
    expect(() => parseContactCsv(csv)).toThrow("invalid_csv");
  });
  it("rejects an unsupported, empty or oversized import instead of losing data", () => {
    expect(() => parseContactCsv("Unknown\nAyşe")).toThrow("unsupported_csv");
    expect(() => parseContactCsv("Name,Notes\n")).toThrow("empty_import");
    expect(() => parseContactCsv("Name\n" + "Ayşe\n".repeat(5001))).toThrow("too_many_contacts");
    expect(() => parseContactCsv("Name\n" + "ş".repeat(1_000_000))).toThrow("csv_too_large");
    expect(importUtf8Size("Aş😀")).toBe(7);
  });
  it("normalizes phone and email identity without matching names", () => {
    const keys = importIdentityKeys(person);
    expect(keys).toEqual(["phone:+905321234567", "email:ayse@example.com"]);
    expect(matchImportContact(person, [{ id: "a", keys: ["phone:+905321234567"] }])).toEqual({ status: "matched", contactId: "a", reason: null });
    expect(matchImportContact(person, [{ id: "same-name", keys: [] }]).status).toBe("new");
  });
  it("does not collapse ambiguous matches or resurrect a deleted source", () => {
    expect(matchImportContact(person, [{ id: "a", keys: ["phone:+905321234567"] }, { id: "b", keys: ["email:ayse@example.com"] }]).reason).toBe("ambiguous");
    expect(matchImportContact(person, [], "deleted-contact").reason).toBe("archived");
    expect(matchImportContact(person, [{ id: "a", keys: [], archived: true }], "a").reason).toBe("archived");
  });
  it("reuses stable source identity after phone changes but rejects invalid data", () => {
    expect(matchImportContact(person, [{ id: "a", keys: [] }], "a").contactId).toBe("a");
    expect(matchImportContact({ ...person, fullName: "" }, []).reason).toBe("invalid_name");
    expect(matchImportContact({ ...person, phones: ["abc"] }, []).reason).toBe("invalid_phone");
    expect(matchImportContact({ ...person, emails: ["abc"] }, []).reason).toBe("invalid_email");
  });
  it("preserves the advisor's primary number, deduplicates extras and fills an empty primary", () => {
    expect(mergeImportedChannels({ phone: "+905321234567", additionalPhones: ["05331234567"], emails: ["Ayse@example.com"] }, { ...person, phones: ["05321234567", "+905331234567", "05341234567"] })).toEqual({ phone: "+905321234567", additionalPhones: ["05331234567", "05341234567"], emails: ["ayse@example.com"] });
    expect(mergeImportedChannels({ phone: null }, person).phone).toBe("05321234567");
  });
});

describe("import preview selection", () => {
  it("starts with all eligible rows selected, including unopened pages", () => {
    const ids = Array.from({ length: 55 }, (_, index) => String(index).padStart(6, "0"));
    expect(selectedImportRowIds(ids, new Set())).toEqual(ids);
    const excluded = new Set(["000001", "000054"]);
    expect(selectedImportRowIds(ids, excluded)).toHaveLength(53);
    expect(selectedImportRowIds(ids, excluded)).not.toContain("000054");
    expect([...excluded]).toEqual(["000001", "000054"]);
  });
  it("never selects ineligible rows and permits excluding everyone", () => {
    expect(selectedImportRowIds(["000000", "000000", "000002"], new Set(["000002", "000003"]))).toEqual(["000000"]);
    expect(selectedImportRowIds(["000000", "000002"], new Set(["000000", "000002"]))).toEqual([]);
    expect(selectedImportRowIds([], new Set())).toEqual([]);
  });
});
