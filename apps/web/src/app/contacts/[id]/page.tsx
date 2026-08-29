import { ContactRouteView } from "@/features/contacts/views/ContactRouteView";

export function generateStaticParams() {
  return [{ id: "__contact__" }];
}

export default function ContactPage() {
  return <ContactRouteView />;
}
