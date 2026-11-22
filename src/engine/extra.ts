import { addDays } from "./week";
import type { CheckIn } from "./adapt";
import type { HistoryEvent } from "./history";
import type { SessionKind } from "./types";

/**
 * „Własna jednostka”: wszystko, co zawodnik zrobił sam, poza aplikacją (siłownia na własną rękę, bieg, piłka, rower, basen, spacer, sauna).
 * Wpisuje rodzaj, czas i wysiłek; z tego liczymy obciążenie (jak „sRPE”: minuty × wysiłek), a obciążenie z ostatnich dni obniża dzisiejszą
 * regenerację w check-inie, więc plan nie dokłada tego samego dnia, kiedy zawodnik już się zmęczył.
 * Progi poniżej są orientacyjne, do przeglądu trenera (patrz docs/WLASNA-JEDNOSTKA.md).
 */
export type ExtraKind = "strength" | "run" | "football" | "bike" | "swim" | "walk" | "sauna" | "other";
/** Wysiłek na suwaku 1–10 (jak w sRPE): 1–3 lekko (rozmowa bez trudu), 4–6 średnio, 7–10 mocno (ciężko, trudno rozmawiać). */
export const RPE_MIN = 1;
export const RPE_MAX = 10;
export const RPE_DEFAULT = 5;
export const rpeLabel = (rpe: number): string => (rpe <= 3 ? "Lekko" : rpe <= 6 ? "Średnio" : "Mocno");
export const rpeHint = (rpe: number): string => (rpe <= 3 ? "Mogę swobodnie rozmawiać" : rpe <= 6 ? "Czuję wysiłek, rozmowa urywa się" : rpe <= 8 ? "Ciężko, mało słów" : "Maksymalnie, bez rozmowy");

export interface ExtraActivity {
  id: string;
  /** Data ISO (dzień wykonania). */
  date: string;
  kind: ExtraKind;
  minutes: number;
  /** Wysiłek 1–10. */
  rpe: number;
}

export const EXTRA_KINDS: Array<[ExtraKind, string]> = [
  ["strength", "Siła"], ["run", "Bieg"], ["football", "Piłka"], ["bike", "Rower"], ["swim", "Basen"], ["walk", "Spacer"], ["sauna", "Sauna"], ["other", "Inne"],
];
export const EXTRA_LABEL: Record<ExtraKind, string> = Object.fromEntries(EXTRA_KINDS) as Record<ExtraKind, string>;
/** Gotowe czasy do szybkiego wyboru (min). */
export const EXTRA_PRESET_MINUTES = [30, 45, 60, 90, 120];
/** Starsze zapisy miały trzy poziomy słowne: przeliczamy je na skalę 1–10. */
const LEGACY_RPE: Record<string, number> = { easy: 3, medium: 5, hard: 8 };
/** Waga rodzaju: sauna i spacer obciążają układ ruchu znacznie mniej, niż wynikałoby z czasu. */
export const KIND_WEIGHT: Record<ExtraKind, number> = { strength: 1, run: 1, football: 1, bike: 0.8, swim: 0.7, walk: 0.5, sauna: 0.25, other: 1 };

export const MAX_MINUTES = 240;

/** Obciążenie jednostki w umownych punktach: minuty × wysiłek (1–10) × waga rodzaju. */
export function loadOf(a: Pick<ExtraActivity, "kind" | "minutes" | "rpe">): number {
  return Math.round(Math.max(0, Math.min(MAX_MINUTES, a.minutes)) * Math.max(RPE_MIN, Math.min(RPE_MAX, a.rpe)) * KIND_WEIGHT[a.kind]);
}

/** Szacunek obciążenia sesji z aplikacji (zapisanej w historii jako wykonana): umowne, żeby składać je z jednostkami własnymi. */
export const SESSION_LOAD: Record<SessionKind, number> = { strength: 330, run: 300, sprint: 200, technique: 200, activation: 80, recovery: 60 };

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const KINDS = new Set<string>(EXTRA_KINDS.map(([k]) => k));

/** Bezpieczne wczytanie z zapisu lub chmury: błędne wpisy są pomijane, czas ograniczony do 1–240 min. */
export function normalizeExtras(raw: unknown): ExtraActivity[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraActivity[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    const r = e as (Partial<ExtraActivity> & { effort?: unknown }) | null;
    const rpeRaw = typeof r?.rpe === "number" ? r.rpe : LEGACY_RPE[String(r?.effort)];
    if (!r || !isDay(r.date) || !KINDS.has(String(r.kind)) || typeof rpeRaw !== "number" || !Number.isFinite(rpeRaw) || typeof r.minutes !== "number" || !Number.isFinite(r.minutes)) continue;
    const id = typeof r.id === "string" && r.id ? r.id : `${r.date}-${out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, date: r.date, kind: r.kind as ExtraKind, minutes: Math.max(1, Math.min(MAX_MINUTES, Math.round(r.minutes))), rpe: Math.max(RPE_MIN, Math.min(RPE_MAX, Math.round(rpeRaw))) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Waga dnia przy ocenie dzisiejszego zmęczenia: dziś pełna, wczoraj 0,6, przedwczoraj 0,3. */
const DECAY = [1, 0.6, 0.3];
/** Próg „trochę” i „dużo” ostrego obciążenia (punkty). Przykład: rower 120 min średnio ≈ 480 → po dobie ≈ 290; mecz towarzyski 70 min mocno ≈ 560. */
export const ACUTE_MODERATE = 450;
export const ACUTE_HIGH = 900;

export interface LoadSummary {
  /** Ostre obciążenie na dzień (z wagami dni). */
  acute: number;
  level: "low" | "moderate" | "high";
  /** Obciążenie z każdego z 3 dni (dziś, wczoraj, przedwczoraj) – bez wag. */
  perDay: number[];
  /** Co składa się na wynik (do podpowiedzi zawodnikowi). */
  items: Array<{ date: string; text: string; load: number }>;
}

/** Obciążenie na dzień `date`: jednostki własne + sesje z aplikacji zapisane w historii jako wykonane. */
export function loadSummary(extras: ExtraActivity[], history: HistoryEvent[], date: string): LoadSummary {
  const perDay = [0, 0, 0];
  const items: LoadSummary["items"] = [];
  for (let i = 0; i < 3; i++) {
    const d = addDays(date, -i);
    for (const a of extras) if (a.date === d) { const l = loadOf(a); perDay[i]! += l; items.push({ date: d, text: `${EXTRA_LABEL[a.kind].toLowerCase()} ${a.minutes} min`, load: l }); }
    for (const h of history) {
      if (h.type !== "session" || h.date !== d || h.viaRest) continue;
      const l = SESSION_LOAD[h.key as SessionKind];
      if (l) perDay[i]! += l;
    }
  }
  const acute = Math.round(perDay.reduce((s, v, i) => s + v * DECAY[i]!, 0));
  return { acute, level: acute >= ACUTE_HIGH ? "high" : acute >= ACUTE_MODERATE ? "moderate" : "low", perDay, items };
}

/**
 * Check-in z uwzględnieniem własnych jednostek: umiarkowane obciążenie obniża „regenerację” o 1, duże o 2 i ustawia „dziś mniej”.
 * Reszta logiki (gotowość, lżejsza sesja, propozycja regeneracji) działa bez zmian. Samopoczucia nie ruszamy: to odpowiedź zawodnika.
 */
export function withExtraLoad(c: CheckIn, extras: ExtraActivity[], history: HistoryEvent[], date: string): { checkIn: CheckIn; summary: LoadSummary; adjusted: boolean } {
  const summary = loadSummary(extras, history, date);
  if (summary.level === "low") return { checkIn: c, summary, adjusted: false };
  const drop = summary.level === "high" ? 2 : 1;
  const recovery = Math.max(1, c.recovery - drop) as 1 | 2 | 3;
  const less = c.less || summary.level === "high";
  return { checkIn: { ...c, recovery, less }, summary, adjusted: recovery !== c.recovery || less !== c.less };
}

/** Jedno zdanie dla zawodnika: dlaczego plan jest lżejszy. */
export function loadNote(s: LoadSummary): string | null {
  if (s.level === "low") return null;
  const top = [...s.items].sort((a, b) => b.load - a.load)[0];
  const what = top ? ` (${top.text})` : "";
  return s.level === "high"
    ? `Ostatnie dni były bardzo ciężkie${what}. Plan jest dziś wyraźnie lżejszy.`
    : `Wczorajsze lub dzisiejsze obciążenie własne${what} obniża dziś regenerację. Plan jest trochę lżejszy.`;
}

/** Suma obciążenia własnego w tygodniu (od poniedziałku), do kafelka na Starcie. */
export function weekExtraLoad(extras: ExtraActivity[], weekStart: string): { count: number; minutes: number; load: number } {
  const end = addDays(weekStart, 7);
  const w = extras.filter((a) => a.date >= weekStart && a.date < end);
  return { count: w.length, minutes: w.reduce((s, a) => s + a.minutes, 0), load: w.reduce((s, a) => s + loadOf(a), 0) };
}

/** Progi obciążenia całego tygodnia (od poniedziałku do dziś): własne jednostki + sesje z aplikacji. Orientacyjne, do przeglądu trenera. */
export const WEEK_HIGH = 2200;
export const WEEK_VERY_HIGH = 3200;
export type WeekLevel = "ok" | "high" | "veryHigh";

export function weekLoadTotal(extras: ExtraActivity[], history: HistoryEvent[], weekStart: string, through: string): number {
  let total = 0;
  for (const a of extras) if (a.date >= weekStart && a.date <= through) total += loadOf(a);
  for (const h of history) {
    if (h.type !== "session" || h.viaRest || h.date < weekStart || h.date > through) continue;
    total += SESSION_LOAD[h.key as SessionKind] ?? 0;
  }
  return total;
}

export const weekLevel = (total: number): WeekLevel => (total >= WEEK_VERY_HIGH ? "veryHigh" : total >= WEEK_HIGH ? "high" : "ok");
