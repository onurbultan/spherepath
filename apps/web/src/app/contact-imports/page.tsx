import { Suspense } from "react";
import { ContactImportView } from "@/features/contact-imports/views/ContactImportView";
import { contactImportCopy } from "@spherepath/shared";

export default function ContactImportsPage() {
  return <Suspense fallback={<p>{contactImportCopy.status.preparing}</p>}><ContactImportView /></Suspense>;
}
