import { z } from "zod";
import { normalizePhone } from "./phone.js";

export const contactImportLimits = { rows: 5_000, csvBytes: 2_000_000, noteLength: 20_000, pageSize: 50 } as const;
export function importUtf8Size(value: string): number {
  let size = 0;
  for (const character of value) { const point = character.codePointAt(0)!; size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; }
  return size;
}
export const importContactSchema = z.object({
  sourceId: z.string().min(1).max(256),
  fullName: z.string().trim().max(120),
  phones: z.array(z.string().trim().max(100)).max(30),
  emails: z.array(z.string().trim().max(254)).max(30),
  note: z.string().max(contactImportLimits.noteLength),
  noteMasked: z.boolean().default(false),
});
export type ImportContact = z.infer<typeof importContactSchema>;
export type ContactImportSource = "google_contacts" | "google_csv";
export type ContactImportStatus = "authorizing" | "preparing" | "preview" | "processing" | "completed" | "failed" | "cancelled";
export type ImportMatchStatus = "new" | "matched" | "review" | "invalid";
export interface ImportMatch { status: ImportMatchStatus; contactId: string | null; reason: "ambiguous" | "duplicate" | "invalid_name" | "invalid_phone" | "invalid_email" | "archived" | null }
export interface ContactImportRow extends ImportContact, ImportMatch {
  id: string;
  matchedName?: string | null;
  result: "created" | "merged" | "skipped" | "conflict" | null;
}
export interface ContactImportJob {
  id: string;
  source: ContactImportSource;
  status: ContactImportStatus;
  total: number;
  processed: number;
  created: number;
  merged: number;
  skipped: number;
  conflicts: number;
  createdAt: number;
  errorCode: string | null;
}
export interface ContactImportPage { job: ContactImportJob; rows: ContactImportRow[]; eligibleRowIds: string[]; nextCursor: string | null }
export interface ContactImportNote {
  id: string;
  contactId: string;
  text: string;
  source: ContactImportSource;
  importedAt: number;
  sourceDate: number | null;
  masked: boolean;
}
export const contactImportIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/u);
export const prepareContactImportSchema = z.object({ csv: z.string().min(1).max(contactImportLimits.csvBytes) });
export const getContactImportSchema = z.object({ jobId: contactImportIdSchema, cursor: z.string().regex(/^\d{6}$/u).nullable().optional() });
export const commitContactImportSchema = z.object({ jobId: contactImportIdSchema, rowIds: z.array(z.string().regex(/^\d{6}$/u)).min(1).max(contactImportLimits.rows) });

/** Selection covers the entire preview, including pages the advisor has not opened. */
export function selectedImportRowIds(eligibleRowIds: readonly string[], excludedRowIds: ReadonlySet<string>): string[] {
  return [...new Set(eligibleRowIds)].filter((id) => !excludedRowIds.has(id));
}

export function importIdentityKeys(person: Pick<ImportContact, "phones" | "emails">): string[] {
  return [...new Set([
    ...person.phones.flatMap((value) => { const phone = normalizePhone(value); return phone ? [`phone:${phone}`] : []; }),
    ...person.emails.map((value) => `email:${value.trim().toLowerCase()}`),
  ])];
}

export function mergeImportedChannels(previous: { phone: string | null; additionalPhones?: string[]; emails?: string[] }, person: ImportContact) {
  const phone = previous.phone || person.phones[0] || null;
  const primaryKey = phone ? normalizePhone(phone) : null;
  const phones = new Map<string, string>();
  for (const value of [...(previous.additionalPhones ?? []), ...person.phones]) {
    const key = normalizePhone(value) ?? value;
    if (key !== primaryKey && !phones.has(key)) phones.set(key, value);
  }
  return { phone, additionalPhones: [...phones.values()], emails: [...new Set([...(previous.emails ?? []), ...person.emails].map((value) => value.trim().toLowerCase()))] };
}

export function validateImportContact(person: ImportContact): ImportMatch["reason"] {
  if (person.fullName.length < 2) return "invalid_name";
  if (person.phones.some((value) => !normalizePhone(value))) return "invalid_phone";
  if (person.emails.some((value) => !z.email().safeParse(value).success)) return "invalid_email";
  return null;
}

export function matchImportContact(person: ImportContact, candidates: Array<{ id: string; keys: string[]; archived?: boolean }>, sourceContactId?: string | null): ImportMatch {
  const invalid = validateImportContact(person);
  if (invalid) return { status: "invalid", contactId: null, reason: invalid };
  const keys = new Set(importIdentityKeys(person));
  const matches = candidates.filter((candidate) => candidate.id === sourceContactId || candidate.keys.some((key) => keys.has(key)));
  if (matches.length > 1) return { status: "review", contactId: null, reason: "ambiguous" };
  const match = matches[0];
  if (match?.archived || (sourceContactId && !matches.some((candidate) => candidate.id === sourceContactId))) return { status: "review", contactId: null, reason: "archived" };
  return match ? { status: "matched", contactId: match.id, reason: null } : { status: "new", contactId: null, reason: null };
}

/** RFC 4180 quoting, embedded newlines, BOM and CRLF; malformed input fails closed. */
export function parseContactCsv(csv: string): ImportContact[] {
  if (importUtf8Size(csv) > contactImportLimits.csvBytes) throw new Error("csv_too_large");
  const input = csv.replace(/^\uFEFF/u, "");
  const records: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === "," || char === "\n" || char === "\r") {
      row.push(field); field = ""; closed = false;
      if (char !== ",") {
        if (row.some((value) => value.trim())) records.push(row);
        row = [];
        if (char === "\r" && input[index + 1] === "\n") index++;
      }
    } else {
      if (closed || char === '"') throw new Error("invalid_csv");
      field += char;
    }
    if (records.length > contactImportLimits.rows + 1) throw new Error("too_many_contacts");
  }
  if (quoted) throw new Error("invalid_csv");
  row.push(field);
  if (row.some((value) => value.trim())) records.push(row);
  const headers = records.shift()?.map((value) => value.trim().toLowerCase()) ?? [];
  const nameIndex = headers.findIndex((value) => ["name", "full name", "display name", "ad", "ad soyad"].includes(value));
  const givenIndex = headers.findIndex((value) => ["given name", "first name"].includes(value));
  const middleIndex = headers.findIndex((value) => ["additional name", "middle name"].includes(value));
  const familyIndex = headers.findIndex((value) => ["family name", "last name"].includes(value));
  if (nameIndex < 0 && givenIndex < 0 && familyIndex < 0) throw new Error("unsupported_csv");
  if (!records.length || records.length > contactImportLimits.rows) throw new Error(records.length ? "too_many_contacts" : "empty_import");
  const values = (cells: string[], expression: RegExp) => headers.flatMap((header, index) => expression.test(header) ? (cells[index] ?? "").split(/\s*:::\s*/u).map((value) => value.trim()).filter(Boolean) : []);
  return records.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error("invalid_csv");
    return importContactSchema.parse({
      sourceId: String(index),
      fullName: cells[nameIndex]?.trim() || [cells[givenIndex], cells[middleIndex], cells[familyIndex]].filter(Boolean).join(" ").trim(),
      phones: [...new Set(values(cells, /^(?:phone(?: \d+)?(?: - value)?|(?:home|business|mobile|other|primary) phone(?: \d+)?|telefon)$/u))],
      emails: [...new Set(values(cells, /^(?:e-?mail(?: \d+)?(?: - value| address)?|e-posta)$/u))],
      note: headers.flatMap((header, column) => /^(?:notes|note|not|notlar)$/u.test(header) ? [cells[column] ?? ""] : []).join("\n"),
    });
  });
}

export const contactImportCopy = {
  source: { google_contacts: "Google Kişiler", google_csv: "CSV" },
  chooseSource: "Dosya seçimi", reviewStep: "Kişileri gözden geçir", importStep: "Aktarımı tamamla", newImport: "Başka bir dosya aktar", unnamed: "İsimsiz kişi", personColumn: "Kişi", channelsColumn: "İletişim", statusColumn: "Durum", actionColumn: "Seçim", previewGuide: "İstemediğin kişileri listeden çıkar. Hazır olduğunda seçilenleri aktar.", details: "Aktarım hakkında", records: "kayıt", shown: "gösteriliyor", noChannels: "İletişim bilgisi yok",
  selectionHelp: "Tüm uygun kişiler seçili. Aktarmak istemediklerini çıkarabilir, istersen geri ekleyebilirsin. Seçimin tüm sayfalarda geçerlidir.", exclude: "Aktarımdan çıkar", restore: "Geri ekle", excluded: "Aktarılmayacak", excludedCount: "kişi aktarım dışında", existing: "Mevcut kişi", continueGoogle: "Google aktarımını tamamla",
  title: "Kişileri içeri aktar", intro: "Kişilerini ve notlarını seçerek aktar. Mevcut bilgiler korunur; aktarım bir görüşme veya pazarlama izni sayılmaz.",
  google: "Google Kişiler’i bağla", googleUnavailable: "Google bağlantısı henüz yapılandırılmadı. Google CSV dosyasıyla aktarabilirsin.",
  csv: "CSV dosyası", csvHint: "Google CSV ve ad, telefon, e-posta sütunları olan rehber CSV dosyaları. En fazla 5.000 kişi ve 2 MB.",
  csvText: "CSV içeriği", preview: "Önizlemeyi hazırla", commit: "Seçilenleri aktar", cancel: "Aktarımı iptal et", close: "Kapat", selectAll: "Tümünü seç", clear: "Seçimi temizle", next: "Sonraki sayfa", previous: "İlk sayfa", refresh: "Yenile", retry: "Aktarımı sürdür", chooseFile: "Dosya seç", history: "Son aktarımlar", empty: "Henüz aktarım yok.", notesTitle: "Aktarılan notlar", noNotes: "Aktarılan not yok.", noteDate: "Aktarım tarihi", unknownDate: "Notun yazıldığı tarih bilinmiyor.", masked: "Hassas içerik maskelendi.", matchHelp: "Eşleşen kişilere ek telefon, e-posta ve not eklenir. Kontrol gereken satırları dosyada düzelterek yeniden aktar.", selection: "kişi seçildi", background: "Aktarım arka planda devam eder. Bu ekranı kapatabilirsin.",
  status: { authorizing: "Google izni bekleniyor", preparing: "Önizleme hazırlanıyor", preview: "Aktarıma hazır", processing: "Aktarılıyor", completed: "Aktarım tamamlandı", failed: "Aktarım tamamlanamadı", cancelled: "Aktarım iptal edildi" },
  match: { new: "Yeni kişi", matched: "Mevcut kişiyle eşleşiyor", review: "Kontrol gerekli", invalid: "Geçersiz kayıt" },
  reason: { ambiguous: "Birden fazla kişiyle eşleşiyor.", duplicate: "Bu dosyada aynı kişi bilgisi tekrar ediyor.", invalid_name: "Ad soyadı kontrol et.", invalid_phone: "Telefon numarasını kontrol et.", invalid_email: "E-posta adresini kontrol et.", archived: "Kaynak kayıt silinmiş veya arşivlenmiş bir kişiye bağlı." },
  result: { created: "Eklendi", merged: "Birleştirildi", skipped: "Atlandı", conflict: "Bilgi değişti; yeniden kontrol et" },
  error: "İşlem tamamlanamadı. Dosya biçimini ve bağlantını kontrol ederek tekrar dene.",
  errors: { preview_failed: "Önizleme hazırlanamadı. Dosyayı yeniden seçerek aktarımı başlat.", invalid_csv: "CSV dosyasının satırlarını ve tırnaklarını kontrol et.", unsupported_csv: "Ad sütunu tanınmadı. Rehberini Google CSV biçiminde dışa aktarıp yeniden dene.", csv_too_large: "Dosya en fazla 2 MB olabilir.", too_many_contacts: "Bir aktarımda en fazla 5.000 kişi olabilir.", empty_import: "Aktarılacak kişi bulunamadı.", google_failed: "Google kişileri okunamadı. İzni kontrol ederek yeni aktarım başlat.", expired: "Önizlemenin süresi doldu. Yeni aktarım başlat.", import_failed: "Aktarım durdu. Tamamlanan kayıtlar korunur; aktarımı sürdürebilirsin." } as Record<string, string>,
} as const;
