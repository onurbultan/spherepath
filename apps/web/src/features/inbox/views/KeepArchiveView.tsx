"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, FolderOpen, NotebookPen, RefreshCw } from "lucide-react";
import {
  apiQueryKeys,
  keepImportBatches,
  keepImportSummary,
  keepSkipLabels,
  planKeepImport,
  type KeepImportPlan,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { importKeepNotes } from "../resources/inbox";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Arşiv aktarılamadı.";
const noteDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });

/**
 * An advisor who has kept five years of working memory in Google Keep is not
 * going to retype it, and a system that cannot read it is one they keep a
 * second notebook beside.
 *
 * The archive is read in the browser and shown before anything is written:
 * importing a thousand notes is a decision, not a side effect of choosing
 * files. Nothing here is sent to the model -- the notes arrive unread and are
 * read one at a time, when one is opened and asked for.
 */
export function KeepArchiveView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<KeepImportPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setReading(true); setError(null); setImported(null);
    try {
      const files = await Promise.all(Array.from(fileList)
        .filter((file) => file.name.toLowerCase().endsWith(".json"))
        .map(async (file) => ({ name: file.name, content: await file.text() })));
      if (!files.length) {
        setPlan(null);
        setError("Seçilen klasörde Keep notu (.json) bulunamadı. Takeout arşivini açıp Keep klasörünü seçin.");
        return;
      }
      setPlan(planKeepImport(files));
    } catch (next) { setError(messageFrom(next)); }
    finally { setReading(false); }
  }

  function toggle(fileName: string) {
    setPlan((current) => current && {
      ...current,
      entries: current.entries.map((entry) => entry.fileName === fileName ? { ...entry, selected: !entry.selected } : entry),
    });
  }

  function toggleAll(selected: boolean) {
    setPlan((current) => current && { ...current, entries: current.entries.map((entry) => ({ ...entry, selected })) });
  }

  async function runImport() {
    if (!session || !plan) return;
    const batches = keepImportBatches(plan);
    if (!batches.length) return setError("Aktarılacak not seçilmedi.");
    setProgress({ done: 0, total: batches.length }); setError(null);
    let total = 0;
    try {
      for (const [index, notes] of batches.entries()) {
        const result = await importKeepNotes(session, { notes });
        total += result.importedCount;
        setProgress({ done: index + 1, total: batches.length });
      }
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.inboxItems });
      setImported(total); setPlan(null);
    } catch (next) {
      // Batches already sent stay imported; saying so keeps a retry from
      // looking like it lost everything.
      setError(`${messageFrom(next)}${total ? ` ${total} not aktarıldı, kalanlar aktarılamadı.` : ""}`);
    } finally { setProgress(null); }
  }

  const selectedCount = plan?.entries.filter((entry) => entry.selected).length ?? 0;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <p className="eyebrow">KEEP ARŞİVİ</p>
          <h1>Eski notlarını getir</h1>
          <p className="context-sentence">
            Google Takeout ile indirdiğin Keep arşivini seç. Notlar yazıldıkları tarihle birlikte gelir; hiçbiri
            otomatik okunmaz, istediğini açıp okutursun.
          </p>
        </div>
        <div className="header-actions">
          <Link className="secondary-action inline-action" href="/"><ArrowLeft size={16} aria-hidden /> Notlara dön</Link>
        </div>
      </header>

      <SpCard className="keep-import-card">
        <ol className="keep-import-steps">
          <li><a className="inline-link" href="https://takeout.google.com/" rel="noreferrer" target="_blank">takeout.google.com</a> adresinden yalnızca <strong>Keep</strong>&apos;i seçip arşivi indir.</li>
          <li>İnen <strong>.zip</strong> dosyasını bilgisayarında aç (çift tıkla).</li>
          <li>Açılan klasörde <strong>Takeout → Keep</strong> klasörünü aşağıdan seç.</li>
        </ol>
        <input
          id="keep-archive-files"
          className="sr-only"
          type="file"
          multiple
          accept=".json,application/json"
          // Lets the whole Keep folder be picked at once instead of a thousand files by hand.
          {...{ webkitdirectory: "", directory: "" }}
          disabled={reading || progress !== null}
          onChange={(event) => { const files = event.target.files; event.target.value = ""; void readFiles(files); }}
        />
        <div className="keep-import-actions">
          <button
            className="primary-action"
            disabled={reading || progress !== null}
            onClick={() => document.getElementById("keep-archive-files")?.click()}
            type="button"
          >
            <FolderOpen size={16} aria-hidden /> {reading ? "Arşiv okunuyor…" : "Keep klasörünü seç"}
          </button>
          {plan ? <span className="keep-import-summary">{keepImportSummary(plan)}</span> : null}
        </div>
        {error ? <p className="form-error notice" role="alert">{error}</p> : null}
        {imported !== null ? (
          <p className="keep-import-done" role="status">
            <CheckCheck size={16} aria-hidden /> {imported} not aktarıldı.{" "}
            <Link className="inline-link" href="/"><NotebookPen size={14} aria-hidden /> Notlarına bak</Link>
          </p>
        ) : null}
      </SpCard>

      {plan?.entries.length ? (
        <SpCard className="keep-import-list">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">AKTARILACAK NOTLAR</p>
              <h2>{selectedCount} not seçili</h2>
            </div>
            <div className="header-actions">
              <button className="text-button" onClick={() => toggleAll(true)} type="button">Hepsini seç</button>
              <button className="text-button" onClick={() => toggleAll(false)} type="button">Hiçbirini seçme</button>
            </div>
          </div>
          <ul className="keep-import-entries">
            {plan.entries.map((entry) => (
              <li key={entry.fileName}>
                <label>
                  <input checked={entry.selected} onChange={() => toggle(entry.fileName)} type="checkbox" />
                  <span>
                    <strong>{entry.note.title || entry.text.split("\n")[0]}</strong>
                    <small>
                      {entry.note.createdAt ? noteDate.format(entry.note.createdAt) : "Tarihsiz"}
                      {entry.note.archived ? " · Keep'te arşivliydi" : ""}
                      {entry.note.labels.length ? ` · ${entry.note.labels.join(", ")}` : ""}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="keep-import-actions">
            <button className="primary-action" disabled={!selectedCount || progress !== null} onClick={() => void runImport()} type="button">
              {progress ? <><RefreshCw className="spin" size={16} aria-hidden /> Aktarılıyor · {progress.done}/{progress.total}</> : `${selectedCount} notu aktar`}
            </button>
          </div>
        </SpCard>
      ) : null}

      {plan?.skipped.length ? (
        <SpCard className="keep-import-list">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">ATLANANLAR</p>
              <h2>{plan.skipped.length} not aktarılmayacak</h2>
            </div>
          </div>
          <ul className="keep-import-skipped">
            {plan.skipped.map((skip) => (
              <li key={skip.fileName}><strong>{skip.title}</strong><small>{keepSkipLabels[skip.reason]}</small></li>
            ))}
          </ul>
        </SpCard>
      ) : null}
    </AppShell>
  );
}
