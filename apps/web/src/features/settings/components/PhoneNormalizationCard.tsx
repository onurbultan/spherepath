"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { PhoneForwarded, RefreshCw } from "lucide-react";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { normalizeContactPhones } from "../resources/settings";

/**
 * A one-off tidy-up rather than a setting: numbers saved before the field was
 * split are rewritten into the shape the switch matches on, so an inbound caller
 * finds the contact that was typed by hand months earlier.
 */
export function PhoneNormalizationCard() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "running">("idle");
  const [result, setResult] = useState<{ scanned: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!session || state === "running") return;
    setState("running");
    setError(null);
    setResult(null);
    let scanned = 0;
    let updated = 0;
    let cursor: string | null = null;
    try {
      // The pass is paged so one office's whole book never sits in a single
      // request; the button walks it to the end rather than making a person
      // press it repeatedly.
      for (;;) {
        const pass = await normalizeContactPhones(session, cursor);
        scanned += pass.scanned;
        updated += pass.updated;
        if (pass.done || !pass.cursor) break;
        cursor = pass.cursor;
      }
      setResult({ scanned, updated });
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Telefonlar düzenlenemedi.");
    } finally {
      setState("idle");
    }
  }

  return (
    <SpCard className="settings-card">
      <div className="settings-title">
        <PhoneForwarded size={20} />
        <div>
          <p className="eyebrow">TOPLU DÜZENLEME</p>
          <h2>Telefon numaralarını biçimlendir</h2>
        </div>
      </div>
      <p className="privacy-copy">
        Eski kayıtlardaki numaralar yazıldıkları gibi duruyor. Bu işlem hepsini ülke kodlu
        biçime çevirir ve gelen çağrının kişiyle eşleşmesini sağlayan anahtarı üretir.
        Telefon olmayan alanlara dokunulmaz; tekrar çalıştırmak güvenlidir.
      </p>
      {result ? (
        <p className="privacy-copy">
          <strong>{result.scanned} kişi tarandı, {result.updated} numara düzeltildi.</strong>
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="secondary-action inline-action" disabled={!session || state === "running"} onClick={() => void run()} type="button">
        {state === "running" ? <RefreshCw className="spin" size={17} /> : <PhoneForwarded size={17} />}
        {state === "running" ? "Düzenleniyor…" : "Numaraları düzenle"}
      </button>
    </SpCard>
  );
}
