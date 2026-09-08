import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { apiQueryKeys, contactImportCopy as copy } from "@spherepath/shared";
import { SpText } from "@/shared/ui/SpText";
import { space } from "@/shared/ui/tokens.generated";
import { listImportNotes } from "../resources/imports";

export function ImportedContactNotes({ contactId }: { contactId: string }) {
  const query = useQuery({ queryKey: apiQueryKeys.contactImportNotes(contactId), queryFn: () => listImportNotes(contactId), meta: { persist: false } });
  return <View style={{ gap: space.md }}><SpText variant="title">{copy.notesTitle}</SpText>{query.isError ? <SpText accessibilityRole="alert">{copy.error}</SpText> : query.isPending ? <SpText>Yükleniyor…</SpText> : query.data?.length ? query.data.map((note) => <View key={note.id} style={{ gap: space.sm }}><SpText>{note.text}</SpText><SpText variant="caption" color="secondary">{copy.source[note.source]} · {copy.noteDate}: {new Date(note.importedAt).toLocaleString("tr-TR")} · {copy.unknownDate}{note.masked ? ` ${copy.masked}` : ""}</SpText></View>) : <SpText>{copy.noNotes}</SpText>}</View>;
}
