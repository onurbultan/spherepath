"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { contactImportCopy as copy, contactImportLimits } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { SpField, SpInput } from "@/shared/ui/SpField";
import { useContactImport, importError } from "../viewModels/useContactImport";
import { ImportPreviewRow } from "../components/ImportPreviewRow";
import "./contact-import.css";

export function ContactImportView() {
  const model = useContactImport();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const params = useSearchParams();
  const router = useRouter();
  const page = model.page.data;
  const job = page?.job;
  async function readFile(file?: File) {
    setCsv(""); setFileName("");
    if (!file) return;
    if (file.size > contactImportLimits.csvBytes) { model.setError(copy.errors.csv_too_large!); return; }
    try { setCsv(await file.text()); setFileName(file.name); model.setError(null); }
    catch (error) { model.setError(importError(error)); }
  }
  const preview = job?.status === "preview";
  const pageStart = model.cursor ? Number(model.cursor) + 2 : 1;
  return <AppShell><div className="contact-import-layout">
    <header className="contact-import-header"><Link href="/contacts">← Kişiler</Link><h1>{copy.title}</h1><p>{copy.intro}</p></header>
    <ol className="contact-import-steps" aria-label={copy.title}>
      {[copy.chooseSource, copy.reviewStep, copy.importStep].map((label, index) => <li key={label} aria-current={(job?.status === "completed" ? 2 : job ? 1 : 0) === index ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
    </ol>
    {params.get("code") && params.get("state") ? <SpCard><button className="primary-action" disabled={model.pending} onClick={() => { model.finish(params.get("state")!, params.get("code")!); router.replace("/contact-imports"); }}>{copy.continueGoogle}</button></SpCard> : null}
    {params.get("error") ? <p role="alert">{copy.errors.google_failed}</p> : null}
    <details className="sp-card contact-import-source" key={model.jobId ?? "source"} open={!job}>
      <summary>{job ? copy.newImport : copy.chooseSource}</summary>
      <div className="contact-import-source-grid">
        <div className="contact-import-upload">
          <SpField label={copy.csv} htmlFor="contact-import-file" hint={copy.csvHint}><SpInput id="contact-import-file" className="sr-only" type="file" accept=".csv,text/csv" disabled={model.pending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void readFile(file); }} /><div className="contact-import-actions"><button className="secondary-action" disabled={model.pending} type="button" onClick={() => document.getElementById("contact-import-file")?.click()}>{copy.chooseFile}</button>{fileName ? <span className="contact-import-filename">{fileName}</span> : null}</div></SpField>
          <button className="primary-action" disabled={model.pending || !csv} onClick={() => model.prepare(csv, () => { setCsv(""); setFileName(""); })}>{model.pending ? copy.status.preparing : copy.preview}</button>
        </div>
        <div className="contact-import-google"><button className="secondary-action" disabled={model.pending || !model.google.data?.enabled} onClick={() => model.begin((url) => { window.location.assign(url); })}>{copy.google}</button>{model.google.data?.enabled === false ? <p>{copy.googleUnavailable}</p> : null}{model.google.isError ? <p role="alert">{copy.error}</p> : null}</div>
      </div>
    </details>
    {model.error ? <p className="contact-import-alert" role="alert">{model.error}</p> : null}
    {model.page.isFetching && !page ? <p role="status">{copy.status.preparing}</p> : null}
    {job ? <SpCard className="contact-import-preview">
      <header className="contact-import-preview-heading">
        <div><p className="eyebrow">{copy.source[job.source]} · {job.total} {copy.records}</p><h2>{copy.status[job.status]}</h2><p>{preview ? copy.previewGuide : `${job.processed}/${job.total} · ${copy.result.created}: ${job.created} · ${copy.result.merged}: ${job.merged} · ${copy.result.skipped}: ${job.skipped} · ${copy.match.review}: ${job.conflicts}`}</p></div>
        <div className="contact-import-actions"><button className="secondary-action action-quiet" onClick={model.refresh}>{copy.refresh}</button>{["preview", "preparing", "authorizing", "failed"].includes(job.status) ? <button className="secondary-action action-quiet" disabled={model.pending} onClick={() => model.control("cancel")}>{copy.cancel}</button> : null}{job.status === "failed" && job.errorCode === "import_failed" ? <button className="primary-action" disabled={model.pending} onClick={() => model.control("resume")}>{copy.retry}</button> : null}</div>
      </header>
      {job.status === "processing" ? <p className="contact-import-info">{copy.background}</p> : null}
      {job.errorCode ? <p className="contact-import-alert" role="alert">{copy.errors[job.errorCode] ?? copy.error}</p> : null}
      {preview ? <div className="contact-import-selection">
        <div className="contact-import-selection-main"><span role="status"><strong>{model.selected.size} {copy.selection}</strong><span> · {model.excludedCount} {copy.excludedCount}</span></span><button className="primary-action" disabled={model.pending || !model.selected.size} onClick={model.commit}>{copy.commit} <span aria-hidden="true">→</span></button></div>
        <div className="contact-import-actions"><button className="secondary-action action-quiet" disabled={model.pending} onClick={model.selectAll}>{copy.selectAll}</button><button className="secondary-action action-quiet" disabled={model.pending} onClick={model.excludeAll}>{copy.clear}</button></div>
      </div> : null}
      <div className="contact-import-columns" aria-hidden="true"><span>{copy.personColumn}</span><span>{copy.channelsColumn}</span><span>{copy.statusColumn}</span><span>{copy.actionColumn}</span></div>
      {page?.rows.map((row) => <ImportPreviewRow key={row.id} row={row} preview={preview} selected={model.selected.has(row.id)} pending={model.pending} onToggle={() => model.toggle(row.id)} />)}
      <footer className="contact-import-pagination"><small>{page?.rows.length ? `${pageStart}–${pageStart + page.rows.length - 1} / ${job.total} ${copy.records}` : `0 ${copy.records}`} {copy.shown}</small><div className="contact-import-actions">{model.cursor ? <button className="secondary-action" onClick={() => model.setCursor(null)}>{copy.previous}</button> : null}{page?.nextCursor ? <button className="secondary-action" onClick={() => model.setCursor(page.nextCursor)}>{copy.next}</button> : null}</div></footer>
      {preview ? <details className="contact-import-help"><summary>{copy.details}</summary><p>{copy.selectionHelp}</p><p>{copy.matchHelp}</p></details> : null}
    </SpCard> : null}
    <details className="contact-import-history"><summary>{copy.history}{model.jobs.data?.length ? ` (${model.jobs.data.length})` : ""}</summary><div className="contact-import-history-list">{model.jobs.data?.length ? model.jobs.data.map((item) => <button className="secondary-action" key={item.id} onClick={() => model.open(item.id)}>{copy.source[item.source]} · {new Date(item.createdAt).toLocaleString("tr-TR")} · {copy.status[item.status]}</button>) : <p>{copy.empty}</p>}</div></details>
  </div></AppShell>;
}
