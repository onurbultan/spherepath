import { Suspense } from "react";
import { DailyNoteView } from "@/features/inbox/views/DailyNoteView";

export default function DailyNotePage() {
  return <Suspense fallback={<p>Sayfa hazırlanıyor…</p>}><DailyNoteView /></Suspense>;
}
