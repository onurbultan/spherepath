import { contactImportCopy as copy, type ContactImportRow } from "@spherepath/shared";
import { SpCheckbox } from "@/shared/ui/SpField";

export function ImportPreviewRow({ row, preview, selected, pending, onToggle }: { row: ContactImportRow; preview: boolean; selected: boolean; pending: boolean; onToggle: () => void }) {
  const eligible = ["new", "matched"].includes(row.status);
  const channels = [...row.phones, ...row.emails];
  const tone = row.reason ? "review" : preview && !selected ? "excluded" : row.status;
  return <section className="contact-import-row" data-tone={tone}>
    <div className="contact-import-identity">
      {preview ? <SpCheckbox label={row.fullName || copy.unnamed} checked={selected} disabled={pending || !eligible} onChange={onToggle} /> : <strong>{row.fullName || copy.unnamed}</strong>}
      {row.matchedName ? <small>{copy.existing}: {row.matchedName}</small> : null}
    </div>
    <div className="contact-import-channels">
      {channels.length ? channels.slice(0, 2).map((value, index) => <span key={index}>{value}</span>) : <span>{copy.noChannels}</span>}
      {channels.length > 2 ? <details><summary>+{channels.length - 2} {copy.channelsColumn.toLocaleLowerCase("tr-TR")}</summary>{channels.slice(2).map((value, index) => <span key={index}>{value}</span>)}</details> : null}
    </div>
    <div className="contact-import-state">
      <span className="contact-import-badge" data-tone={tone}>{row.result ? copy.result[row.result] : copy.match[row.status]}</span>
      {row.reason ? <small>{copy.reason[row.reason]}</small> : null}
    </div>
    <div className="contact-import-row-action">
      {preview && eligible ? <button className="secondary-action action-quiet" disabled={pending} onClick={onToggle}>{selected ? copy.exclude : copy.restore}</button> : null}
      {preview && !selected ? <small>{copy.excluded}</small> : null}
    </div>
    {row.note ? <details className="contact-import-note"><summary>{copy.notesTitle}</summary><p>{row.note}</p>{row.noteMasked ? <small>{copy.masked}</small> : null}</details> : null}
  </section>;
}
