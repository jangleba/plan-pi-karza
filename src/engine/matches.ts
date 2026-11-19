import type { Position } from "./profile";
import type { TrendTone } from "./history";
import { addDays } from "./week";

/**
 * Dziennik meczów: wpis po każdym meczu (wynik, minuty, ocena własna, gole/asysty,
 * co poszło dobrze i słabo) oraz forma sezonu. Czysta logika bez ekranów.
 * Ocena 1–10 jest SUBIEKTYWNA (własna) – to nie jest statystyka meczowa.
 */

export type MatchResult = "W" | "D" | "L";

export type MatchTag =
  | "passing" | "touch" | "dribble" | "duels" | "speed" | "stamina"
  | "decisions" | "positioning" | "comm" | "finishing";

export const MATCH_TAGS: Array<[MatchTag, string]> = [
  ["passing", "Podania"],
  ["touch", "Pierwszy kontakt"],
  ["dribble", "Drybling"],
  ["duels", "Pojedynki"],
  ["speed", "Szybkość"],
  ["stamina", "Wytrzymałość"],
  ["decisions", "Decyzje"],
  ["positioning", "Ustawianie się"],
  ["comm", "Komunikacja"],
  ["finishing", "Wykończenie"],
];
export const TAG_LABEL: Record<MatchTag, string> = Object.fromEntries(MATCH_TAGS) as Record<MatchTag, string>;
export const MAX_TAGS = 3;

export interface MatchEntry {
  id: string;
  /** Data ISO (YYYY-MM-DD). */
  date: string;
  opponent?: string;
  /** Bramki mojej drużyny i rywala. */
  gf: number;
  ga: number;
  /** Rozegrane minuty (0 = ławka). */
  minutes: number;
  position: Position;
  /** Własna ocena 1–10. */
  rating: number;
  goals: number;
  assists: number;
  well: MatchTag[];
  badly: MatchTag[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/** Wpis z poprawionymi zakresami; tagi bez duplikatów, maks. MAX_TAGS, a ten sam tag nie może być jednocześnie dobry i zły. */
export function normalizeMatch(m: MatchEntry): MatchEntry {
  const well = [...new Set(m.well)].filter((t) => t in TAG_LABEL).slice(0, MAX_TAGS);
  const badly = [...new Set(m.badly)].filter((t) => t in TAG_LABEL && !well.includes(t)).slice(0, MAX_TAGS);
  const opponent = m.opponent?.trim().slice(0, 40);
  return {
    ...m,
    opponent: opponent || undefined,
    gf: clamp(m.gf, 0, 30),
    ga: clamp(m.ga, 0, 30),
    minutes: clamp(m.minutes, 0, 120),
    rating: clamp(m.rating, 1, 10),
    goals: clamp(m.goals, 0, 20),
    assists: clamp(m.assists, 0, 20),
    well,
    badly,
  };
}

export function resultOf(m: Pick<MatchEntry, "gf" | "ga">): MatchResult {
  return m.gf > m.ga ? "W" : m.gf < m.ga ? "L" : "D";
}

/** Sezon liczymy od 1 sierpnia (przybliżenie polskich rozgrywek: sierpień–czerwiec). */
export function seasonStart(todayISO: string): string {
  const y = Number(todayISO.slice(0, 4)), m = Number(todayISO.slice(5, 7));
  return `${m >= 8 ? y : y - 1}-08-01`;
}

export interface MatchSummary {
  count: number;
  /** Mecze, w których zawodnik wszedł na boisko. */
  played: number;
  minutes: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  /** Średnia własna ocena z meczów, w których grał (jedno miejsce po przecinku). */
  avgRating: number | null;
  /** Ostatnie wyniki, od najstarszego do najnowszego (maks. 5). */
  form: MatchResult[];
  /** Ocena po dacie (ostatnie 10 dni meczowych; ten sam dzień = średnia). */
  trend: Array<{ date: string; value: number }>;
  tone: TrendTone;
}

const byDateAsc = (a: MatchEntry, b: MatchEntry) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date));

export function inSeason(matches: MatchEntry[], todayISO: string): MatchEntry[] {
  const from = seasonStart(todayISO);
  return matches.filter((m) => m.date >= from && m.date <= todayISO).sort(byDateAsc);
}

/** Linia trendu oceny: średnia na dzień (turniej = kilka meczów jednego dnia), ostatnie 10 dni. */
export function ratingTrend(list: MatchEntry[]): Array<{ date: string; value: number }> {
  const days = new Map<string, number[]>();
  for (const m of list) if (m.minutes > 0) days.set(m.date, [...(days.get(m.date) ?? []), m.rating]);
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-10)
    .map(([date, v]) => ({ date, value: Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 }));
}

/** Ton wykresu: średnia z 3 ostatnich ocen względem 3 poprzednich (próg 0,3 / −0,7 pkt). */
export function formTone(trend: Array<{ value: number }>): TrendTone {
  if (trend.length < 4) return "neutral";
  const avg = (xs: Array<{ value: number }>) => xs.reduce((s, x) => s + x.value, 0) / xs.length;
  const last = trend.slice(-3), prev = trend.slice(-6, -3);
  const d = avg(last) - avg(prev);
  return d >= 0.3 ? "green" : d > -0.3 ? "neutral" : d > -0.7 ? "orange" : "red";
}

export function matchSummary(all: MatchEntry[], todayISO: string): MatchSummary {
  const list = inSeason(all, todayISO);
  const played = list.filter((m) => m.minutes > 0);
  const ratings = played.map((m) => m.rating);
  const trend = ratingTrend(list);
  return {
    count: list.length,
    played: played.length,
    minutes: list.reduce((s, m) => s + m.minutes, 0),
    goals: list.reduce((s, m) => s + m.goals, 0),
    assists: list.reduce((s, m) => s + m.assists, 0),
    wins: list.filter((m) => resultOf(m) === "W").length,
    draws: list.filter((m) => resultOf(m) === "D").length,
    losses: list.filter((m) => resultOf(m) === "L").length,
    avgRating: ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10 : null,
    form: list.slice(-5).map(resultOf),
    trend,
    tone: formTone(trend),
  };
}

export interface TagInsight { kind: "well" | "badly"; tag: MatchTag; n: number; of: number }

/**
 * Co się powtarza w ostatnich meczach (okno 5): tag, który wystąpił w ≥ 2 meczach i w ≥ 40% okna.
 * Najpierw „słabo” (to jest do pracy), potem „dobrze”; zero wniosku przy zbyt małej próbie.
 */
export function tagInsights(all: MatchEntry[], todayISO: string, window = 5): TagInsight[] {
  const last = inSeason(all, todayISO).slice(-window);
  if (last.length < 3) return [];
  const out: TagInsight[] = [];
  for (const kind of ["badly", "well"] as const) {
    const counts = new Map<MatchTag, number>();
    for (const m of last) for (const t of m[kind]) counts.set(t, (counts.get(t) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || MATCH_TAGS.findIndex(([k]) => k === a[0]) - MATCH_TAGS.findIndex(([k]) => k === b[0]))[0];
    if (top && top[1] >= 2 && top[1] / last.length >= 0.4) out.push({ kind, tag: top[0], n: top[1], of: last.length });
  }
  return out;
}

const dow = (iso: string) => (new Date(Date.parse(iso)).getUTCDay() + 6) % 7;

/**
 * Data niezapisanego meczu do przypomnienia: najświeższy dzień meczowy z planu sprzed 1–2 dni,
 * bez wpisu w dzienniku. Dziś nie przypominamy (mecz może się jeszcze nie odbyć).
 */
export function matchDue(matchWeekdays: number[], all: MatchEntry[], todayISO: string): string | null {
  for (const back of [1, 2]) {
    const d = addDays(todayISO, -back);
    if (matchWeekdays.includes(dow(d)) && !all.some((m) => m.date === d)) return d;
  }
  return null;
}

/* ---------- zapis lokalny ---------- */

const KEY = "matches";

export function loadMatches(): MatchEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    return (v as MatchEntry[]).filter((m) => m && typeof m.id === "string" && typeof m.date === "string").sort(byDateAsc);
  } catch {
    return [];
  }
}

function store(list: MatchEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* brak pamięci */ }
}

export function saveMatch(m: MatchEntry): MatchEntry[] {
  const next = [...loadMatches().filter((x) => x.id !== m.id), normalizeMatch(m)].sort(byDateAsc);
  store(next);
  return next;
}

export function deleteMatch(id: string): MatchEntry[] {
  const next = loadMatches().filter((x) => x.id !== id);
  store(next);
  return next;
}

export function newMatchId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
