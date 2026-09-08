import { importContactSchema, contactImportLimits, type ImportContact } from "../../../packages/shared/src/index.js";

export const googleContactsScope = "https://www.googleapis.com/auth/contacts.readonly";
type GoogleField = { value?: string; displayName?: string; metadata?: { primary?: boolean }; contentType?: string };
export interface GoogleContact {
  resourceName?: string;
  metadata?: { sources?: Array<{ id?: string; type?: string }> };
  names?: GoogleField[];
  phoneNumbers?: GoogleField[];
  emailAddresses?: GoogleField[];
  biographies?: GoogleField[];
}
export function googleContactToImport(person: GoogleContact): ImportContact {
  const primaryFirst = (fields: GoogleField[] = []) => [...fields].sort((a, b) => Number(Boolean(b.metadata?.primary)) - Number(Boolean(a.metadata?.primary)));
  const biography = person.biographies?.[0];
  // HTML is displayed as literal text, never executed or interpreted as instructions.
  return importContactSchema.parse({ sourceId: person.metadata?.sources?.find((source) => source.type === "CONTACT")?.id ?? person.resourceName, fullName: primaryFirst(person.names)[0]?.displayName ?? "", phones: primaryFirst(person.phoneNumbers).map((item) => item.value ?? "").filter(Boolean), emails: primaryFirst(person.emailAddresses).map((item) => item.value ?? "").filter(Boolean), note: biography?.value ?? "" });
}
export async function readGoogleContacts(accessToken: string, fetcher: typeof fetch = fetch): Promise<ImportContact[]> {
  const people: ImportContact[] = [];
  let pageToken: string | undefined;
  const seenPages = new Set<string>();
  do {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "metadata,names,phoneNumbers,emailAddresses,biographies");
    url.searchParams.set("sources", "READ_SOURCE_TYPE_CONTACT");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("google_failed");
    const page = await response.json() as { connections?: GoogleContact[]; nextPageToken?: string };
    people.push(...(page.connections ?? []).map(googleContactToImport));
    if (people.length > contactImportLimits.rows) throw new Error("too_many_contacts");
    pageToken = page.nextPageToken;
    if (pageToken && seenPages.has(pageToken)) throw new Error("google_failed");
    if (pageToken) seenPages.add(pageToken);
  } while (pageToken);
  if (!people.length) throw new Error("empty_import");
  return people;
}
