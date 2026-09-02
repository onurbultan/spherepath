import { useLocalSearchParams } from "expo-router";
import ContactWorkspaceView from "@/features/contacts/views/ContactWorkspaceView";

export default function ContactRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContactWorkspaceView contactId={String(id)} />;
}
