/** Pomiary: MAS i MSS to oddzielne dane. Typ, wartość, data, metoda, jednostka i jakość są zawsze jawne. */
export type MeasurementType = "MAS" | "MSS";
export type MeasurementQuality = "validated" | "field_estimate" | "unknown";
export interface Measurement { type: MeasurementType; value: number; unit: "m/s" | "km/h"; date: string; method: string; quality: MeasurementQuality }

export function latest(ms: Measurement[], type: MeasurementType): Measurement | null {
  return [...ms].filter((m) => m.type === type && m.value > 0).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}
const toMs = (m: Measurement) => (m.unit === "km/h" ? m.value / 3.6 : m.value);

/** Udział prędkości w MSS. Bez pomiaru MSS (typ MSS, nie MAS) zwraca null – nie wyprowadzamy go z MAS, wieku, pozycji ani GPS telefonu. */
export function pctOfMss(speedMs: number, ms: Measurement[]): number | null {
  const m = latest(ms, "MSS");
  return m ? Math.round((speedMs / toMs(m)) * 100) : null;
}
/** Etykieta „95% prędkości maksymalnej” wolno pokazać wyłącznie z odpowiednim MSS. */
export function reached95OfMss(speedMs: number, ms: Measurement[]): boolean | null {
  const p = pctOfMss(speedMs, ms);
  return p === null ? null : p >= 95;
}
