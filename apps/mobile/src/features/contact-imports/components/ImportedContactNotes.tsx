import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { apiQueryKeys, contactImportCopy as copy } from "@spherepath/shared";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { space } from "@/shared/ui/tokens.generated";
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
  if (query.isError) return <SpCard><SpText accessibilityRole="alert">{copy.error}</SpText></SpCard>;
  if (!query.data?.length) return null;
  return (
    <SpCard style={{ gap: space.md }}>
      <SpText variant="title">{copy.notesTitle}</SpText>
      {query.data.map((note) => (
        <View key={note.id} style={{ gap: space.sm }}>
          <SpText>{note.text}</SpText>
          <SpText variant="caption" color="secondary">{copy.source[note.source]} · {copy.noteDate}: {new Date(note.importedAt).toLocaleString("tr-TR")} · {copy.unknownDate}{note.masked ? ` ${copy.masked}` : ""}</SpText>
        </View>
      ))}
    </SpCard>
  );
}
