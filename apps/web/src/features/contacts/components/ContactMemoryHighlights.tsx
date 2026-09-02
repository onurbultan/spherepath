import { buildMemoryHighlights, type ContactMemory } from "@spherepath/shared";

export function ContactMemoryHighlights({ memory }: { memory: ContactMemory }) {
  const highlights = buildMemoryHighlights(memory);
  return highlights.length
    ? <div className="opportunity-highlights">{highlights.map((item) => <span key={item}>{item}</span>)}</div>
    : <p className="privacy-copy">Henüz gayrimenkul tercihi kaydedilmedi.</p>;
}
