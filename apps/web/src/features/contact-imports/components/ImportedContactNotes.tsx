"use client";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, contactImportCopy as copy } from "@spherepath/shared";
import { listImportNotes } from "../resources/imports";

export function ImportedContactNotes({ contactId }: { contactId: string }) {
  const query = useQuery({ queryKey: apiQueryKeys.contactImportNotes(contactId), queryFn: () => listImportNotes(contactId), meta: { persist: false } });
  return <section><h3>{copy.notesTitle}</h3>{query.isError ? <p role="alert">{copy.error}</p> : query.isPending ? <p>Yükleniyor…</p> : query.data?.length ? query.data.map((note) => <article key={note.id}><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note.text}</p><small>{copy.source[note.source]} · {copy.noteDate}: {new Date(note.importedAt).toLocaleString("tr-TR")} · {copy.unknownDate}{note.masked ? ` ${copy.masked}` : ""}</small></article>) : <p>{copy.noNotes}</p>}</section>;
}
