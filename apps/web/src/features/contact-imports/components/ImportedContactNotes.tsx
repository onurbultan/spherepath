"use client";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, contactImportCopy as copy } from "@spherepath/shared";
import { SpCard } from "@/shared/ui/SpCard";
import { listImportNotes } from "../resources/imports";

/**
 * What the advisor already wrote about this person before Spherepath existed.
 * It opens on the contact's first screen, because a contact carrying pages of
 * imported notes used to look like a stranger until someone found the right
 * tab. A contact with no imported notes says nothing at all rather than
 * spending a card on an empty state.
 */
export function ImportedContactNotes({ contactId }: { contactId: string }) {
  const query = useQuery({ queryKey: apiQueryKeys.contactImportNotes(contactId), queryFn: () => listImportNotes(contactId), meta: { persist: false } });
  if (query.isPending) return null;
  if (query.isError) return <SpCard className="contact-workspace-panel"><p role="alert">{copy.error}</p></SpCard>;
  if (!query.data?.length) return null;
  return (
    <SpCard className="contact-workspace-panel imported-contact-notes">
      <h2>{copy.notesTitle}</h2>
      {query.data.map((note) => (
        <article key={note.id}>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note.text}</p>
          <small>{copy.source[note.source]} · {copy.noteDate}: {new Date(note.importedAt).toLocaleString("tr-TR")} · {copy.unknownDate}{note.masked ? ` ${copy.masked}` : ""}</small>
        </article>
      ))}
    </SpCard>
  );
}
