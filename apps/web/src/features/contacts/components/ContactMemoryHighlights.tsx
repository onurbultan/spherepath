import {
  propertyTransactionTypeLabels,
  voicePropertyTypeLabels,
  type ContactMemory,
} from "@spherepath/shared";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ContactMemoryHighlights({ memory }: { memory: ContactMemory }) {
  const preferences = memory.propertyPreferences;
  const budget = preferences.budgetRange;
  const rooms = preferences.bedroomCountMin !== null
    ? `${preferences.bedroomCountMin}${preferences.livingRoomCountMin !== null ? `+${preferences.livingRoomCountMin}` : ""}`
    : preferences.roomCountMin !== null ? `${preferences.roomCountMin} oda` : null;
  const area = preferences.areaMinM2 !== null || preferences.areaMaxM2 !== null
    ? preferences.areaMinM2 === preferences.areaMaxM2
      ? `${preferences.areaMinM2} m²`
      : `${preferences.areaMinM2 ?? "?"}–${preferences.areaMaxM2 ?? "?"} m²`
    : null;
  const highlights = [
    ...(preferences.transactionType ? [`Amaç: ${propertyTransactionTypeLabels[preferences.transactionType]}`] : []),
    ...preferences.propertyTypes.map((item) => `Mülk: ${voicePropertyTypeLabels[item]}`),
    ...preferences.preferredLocations.map((item) => `Bölge: ${item}`),
    ...(budget?.max !== null && budget?.max !== undefined ? [`Bütçe: ${money(budget.max, budget.currency)} üst sınır`] : []),
    ...(budget?.min !== null && budget?.min !== undefined ? [`Bütçe: en az ${money(budget.min, budget.currency)}`] : []),
    ...(rooms ? [`Oda: ${rooms}`] : []),
    ...(area ? [`Alan: ${area}`] : []),
    ...preferences.mustHaves.map((item) => `Olmazsa olmaz: ${item}`),
    ...preferences.dealBreakers.map((item) => `İstemiyor: ${item}`),
    ...(preferences.timeline ? [`Zamanlama: ${preferences.timeline}`] : []),
  ];

  return highlights.length
    ? <div className="opportunity-highlights">{highlights.map((item) => <span key={item}>{item}</span>)}</div>
    : <p className="context-sentence">Henüz gayrimenkul tercihi yok.</p>;
}
