"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneCall } from "lucide-react";
import { useSession } from "@/features/auth/resources/session";
import { startContactCall } from "../resources/calls";

/**
 * The switch rings the advisor first and only then dials the customer, so the
 * button's job is not finished when the request succeeds -- it has to explain the
 * few seconds of silence before the phone in their pocket starts ringing.
 */
const ringingNoticeMs = 12_000;

/**
 * Setup faults are worth naming individually: each one is fixed in a different
 * place, and "call failed" would send the advisor to the wrong person.
 */
function reasonFor(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Telephony is not configured")) return "Ofis için telefon entegrasyonu kurulmamış. Broker'ınız ayarları tamamlamalı.";
  if (message.includes("No extension is assigned")) return "Size bir dahili atanmamış. Broker'ınız telefon ayarlarından atayabilir.";
  if (message.includes("no dialable phone")) return "Bu kişinin aranabilir bir telefon numarası yok.";
  if (message.includes("not supported")) return "Telefon sağlayıcısı desteklenmiyor.";
  return "Arama başlatılamadı. Tekrar deneyin.";
}

export function ContactCallButton({ contactId, hasPhone }: { contactId: string; hasPhone: boolean }) {
  const { session } = useSession();
  const [state, setState] = useState<"idle" | "starting" | "ringing">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "ringing") return;
    const timer = setTimeout(() => setState("idle"), ringingNoticeMs);
    return () => clearTimeout(timer);
  }, [state]);

  async function call() {
    if (!session || state !== "idle") return;
    setState("starting");
    setError(null);
    try {
      await startContactCall(session, contactId);
      setState("ringing");
    } catch (cause) {
      setError(reasonFor(cause));
      setState("idle");
    }
  }

  return (
    <>
      <button
        className="secondary-action inline-action"
        disabled={!session || !hasPhone || state !== "idle"}
        onClick={() => void call()}
        title={hasPhone ? undefined : "Bu kişide telefon numarası yok"}
        type="button"
      >
        {state === "ringing" ? <PhoneCall size={17} /> : <Phone size={17} />}
        {state === "starting" ? "Bağlanıyor…" : state === "ringing" ? "Telefonunuz çalacak" : "Ara"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </>
  );
}
