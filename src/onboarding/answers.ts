/**
 * Odpowiedzi z onboardingu i ich zamiana na profil oraz na PODGLĄD planu tygodnia.
 * Podgląd i właściwy plan używają tej samej funkcji (`planForProfile`), więc to, co zawodnik widzi przy układaniu tygodnia,
 * wynika z jego odpowiedzi, a nie z osobnych reguł. Czysty kod, bez Reacta (testowany osobno).
 */
import { FEEL_NOW, LEAGUES, planForProfile, suggestGoals, weekStartOf } from "../engine";
import type { Equipment, FeelNow, League, Position, Profile, Season, SeasonGoal, SessionKind } from "../engine";

/** Klucz (w przestrzeni danych) z rozpoczętym, niedokończonym onboardingiem; usuwany po ukończeniu. */
export const DRAFT_KEY = "onboardingDraft";
export interface Draft { step: number; a: Answers }

/**
 * Przywraca rozpoczęty onboarding po przeładowaniu karty (np. gdy system zamknie ją w tle). Dane z pamięci są niezaufane:
 * każde pole jest sprawdzane, a niepoprawne wraca do wartości początkowej. Zwraca null, gdy nie ma czego przywrócić.
 */
export function restoreDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { step?: unknown; a?: unknown };
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 1 || r.step > LAST_STEP || !r.a || typeof r.a !== "object") return null;
  const x = r.a as Record<string, unknown>;
  const base = initialAnswers();
  const num = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : d);
  const pick = <T extends string>(v: unknown, ok: readonly T[]): T | undefined => (typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : undefined);
  const list = <T extends string>(v: unknown, ok: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((e): e is T => typeof e === "string" && (ok as readonly string[]).includes(e)))] : []);
  const days = Array.isArray(x.days) && x.days.length === 7 && x.days.every((d) => DAY_CYCLE.includes(d as DayState)) ? (x.days as DayState[]) : base.days;
  const a: Answers = {
    name: typeof x.name === "string" ? x.name.slice(0, 40) : base.name,
    age: num(x.age, 16, 45, base.age),
    weight: num(x.weight, 45, 130, base.weight),
    height: x.height === null ? null : num(x.height, 140, 210, base.height ?? 175),
    position: pick(x.position, ["bramkarz", "obronca", "pomocnik", "skrzydlowy", "napastnik"] as const),
    feelNow: list(x.feelNow, FEEL_NOW.map(([v]) => v)),
    goals: list(x.goals, ["speed", "strength", "endurance", "return"] as const).slice(0, 2),
    season: pick(x.season, ["preseason", "inseason", "offseason"] as const),
    league: pick(x.league, LEAGUES),
    years: num(x.years, 0, 15, base.years),
    equipment: list(x.equipment, ["gym", "field", "track", "bodyweight"] as const),
    limited: x.limited === true,
    days,
  };
  return { step: r.step, a };
}

/** Stan dnia w kalendarzu tygodnia. */
export type DayState = "free" | "club" | "match" | "off";
export const DAY_CYCLE: DayState[] = ["free", "club", "match", "off"];

export interface Answers {
  name: string;
  age: number;
  weight: number;
  /** Wzrost (cm) do pomiaru skoku z nagrania; null = zawodnik nie chce podawać. Zapis tylko na urządzeniu. */
  height: number | null;
  position?: Position;
  feelNow: FeelNow[];
  goals: SeasonGoal[];
  season?: Season;
  league?: League;
  years: number;
  equipment: Equipment[];
  limited: boolean;
  days: DayState[];
}

export const initialAnswers = (): Answers => ({
  name: "", age: 18, weight: 75, height: 175, feelNow: [], goals: [], years: 1, equipment: [], limited: false, days: Array<DayState>(7).fill("free"),
});

/** „Tylko kilka razy w tygodniu” ma sens wyłącznie, gdy zawodnik w ogóle ma siłownię (wtedy dzień po meczu może być dniem na siłę). */
/** Własny ciężar jest zawsze dostępny, więc dodajemy go do profilu bez pytania. */
export const withBodyweight = (e: Equipment[]): Equipment[] => (e.includes("bodyweight") ? e : [...e, "bodyweight"]);

export const gymLimited = (a: Pick<Answers, "limited" | "equipment">): boolean => a.limited && a.equipment.includes("gym");

export const dayIndexes = (a: Pick<Answers, "days">, st: DayState): number[] => a.days.map((d, i) => (d === st ? i : -1)).filter((i) => i >= 0);

/** Kolejny stan dnia po dotknięciu: wolny, klub, mecz, zajęty (mecz można zaznaczyć w każdym okresie, także w przerwie). */
export function nextDayState(cur: DayState, _season?: Season): DayState {
  return DAY_CYCLE[(DAY_CYCLE.indexOf(cur) + 1) % DAY_CYCLE.length]!;
}

/** Kroki: 1 O Tobie, 2 Na boisku, 3 Cel, 4 Sezon, 5 Trening, 6 Tydzień (krok 0 to ekran powitalny). */
export const LAST_STEP = 6;

/** Komunikat błędu dla kroku albo null, gdy można iść dalej. */
export function validateStep(step: number, a: Answers): string | null {
  const matches = dayIndexes(a, "match");
  switch (step) {
    case 1: return !a.name.trim() ? "Podaj imię." : null;
    case 2: return !a.position ? "Wybierz pozycję." : null;
    case 3: return !a.goals.length ? "Wybierz przynajmniej jeden cel." : null;
    case 4: return !a.season ? "Wybierz, w którym momencie sezonu jesteś." : !a.league ? "Wybierz poziom rozgrywek." : null;
    case 5: return null; // staż i sprzęt są opcjonalne: domyślnie własny ciężar
    case 6:
      return a.season === "inseason" && !matches.length ? "Zaznacz dzień meczu."
        : matches.length > 2 ? "Maksymalnie dwa mecze w tygodniu."
        : dayIndexes(a, "off").length > 4 ? "Zostaw co najmniej 3 dni na trening." : null;
    default: return null;
  }
}

/** Cele podpowiedziane z odpowiedzi „co Ci przeszkadza”, gdy zawodnik jeszcze żadnego nie wybrał. */
export const goalsFor = (a: Answers): SeasonGoal[] => (a.goals.length ? a.goals : suggestGoals(a.feelNow));

/** Profil z odpowiedzi; null, jeśli brakuje wymaganych odpowiedzi (każdy krok ma własną walidację). */
export function buildProfile(a: Answers): Profile | null {
  if (!a.position || !a.season || !a.league || !a.name.trim()) return null;
  const goals = goalsFor(a);
  return {
    name: a.name.trim(), age: a.age, weightKg: a.weight, position: a.position, season: a.season, goal: goals[0], goal2: goals[1], league: a.league,
    strengthYears: a.years, equipment: withBodyweight(a.equipment), limitedGymAccess: gymLimited(a),
    clubWeekdays: dayIndexes(a, "club"), matchWeekdays: dayIndexes(a, "match"), offWeekdays: dayIndexes(a, "off"),
  };
}

/** Profil tymczasowy do podglądu: braki uzupełniamy neutralnymi wartościami (nie wpływają na układ tygodnia). */
function draftProfile(a: Answers): Profile {
  const goals = goalsFor(a);
  return {
    name: a.name.trim() || undefined, age: a.age, weightKg: a.weight, position: a.position ?? "pomocnik", season: a.season ?? "inseason", goal: goals[0], goal2: goals[1], league: a.league,
    strengthYears: a.years, equipment: withBodyweight(a.equipment), limitedGymAccess: gymLimited(a),
    clubWeekdays: dayIndexes(a, "club"), matchWeekdays: dayIndexes(a, "match"), offWeekdays: dayIndexes(a, "off"),
  };
}

export const WEEKDAY_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
/** Krótkie nazwy do małych komórek podglądu (pełne nazwy są w planie). */
export const SESSION_SHORT: Record<SessionKind, string> = { strength: "Siła", run: "Bieg", sprint: "Sprint", technique: "Technika", activation: "Aktyw.", recovery: "Regen." };

export type PreviewTone = "match" | "club" | "train" | "rest" | "off";
export interface PreviewDay {
  weekday: string;
  /** Główna etykieta dnia (mecz, klub, rodzaj treningu, wolne, niedostępny). */
  title: string;
  /** Dodatkowy trening indywidualny w dniu klubowym. */
  extra?: string;
  tone: PreviewTone;
  session: SessionKind | null;
}

/** Podgląd tygodnia wyliczony ZE WSKAZANYCH ODPOWIEDZI tym samym planerem co aplikacja. */
export function previewWeek(a: Answers, todayISO: string): { days: PreviewDay[]; warnings: string[] } {
  // bez zgłoszeń „bez siły” z magazynu: podgląd wynika wyłącznie z odpowiedzi w tym formularzu
  const plan = planForProfile(draftProfile(a), weekStartOf(todayISO), { skippedDays: [] });
  const days = plan.days.map((d, i): PreviewDay => {
    const weekday = WEEKDAY_SHORT[i]!;
    const s = d.session?.kind ?? null;
    if (d.isOff) return { weekday, title: "Zajęty", tone: "off", session: null };
    if (d.isMatch) return { weekday, title: "Mecz", tone: "match", session: s };
    if (d.isClub) return { weekday, title: "Klub", ...(s ? { extra: SESSION_SHORT[s] } : {}), tone: "club", session: s };
    if (s) return { weekday, title: SESSION_SHORT[s], tone: s === "recovery" ? "rest" : "train", session: s };
    return { weekday, title: "Wolne", tone: "rest", session: null };
  });
  return { days, warnings: plan.warnings };
}

/** Liczba treningów indywidualnych w podglądzie (bez regeneracji i bez meczu). */
export const sessionCount = (days: PreviewDay[]): number => days.filter((d) => d.session && d.session !== "recovery" && d.tone !== "match").length;

const WEEKDAY_FULL = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];
const MATCH_DAY = ["w poniedziałek", "we wtorek", "w środę", "w czwartek", "w piątek", "w sobotę", "w niedzielę"];
const EQUIPMENT_AT: Record<Equipment, string> = { gym: "na siłowni", bodyweight: "z własnym ciężarem", field: "na boisku", track: "na bieżni" };
const GOAL_LABEL: Record<SeasonGoal, string> = { speed: "szybkość", strength: "siła", endurance: "wytrzymałość", return: "powrót po przerwie" };

/** Krótkie zdania „co zrozumieliśmy” pokazywane na ekranie układania planu; każde pochodzi z konkretnej odpowiedzi. */
export function understood(a: Answers): string[] {
  const out: string[] = [];
  const matches = dayIndexes(a, "match");
  if (matches.length) out.push(`Mecz ${matches.map((i) => MATCH_DAY[i]).join(" i ")}`);
  else if (a.season === "offseason") out.push("Przerwa między sezonami: lżej");
  const club = dayIndexes(a, "club");
  if (club.length) out.push(`Trening w klubie: ${club.map((i) => WEEKDAY_FULL[i]).join(", ")}`);
  const goals = goalsFor(a);
  if (goals.length) out.push(`Cel: ${goals.map((g) => GOAL_LABEL[g]).join(" i ")}`);
  const off = dayIndexes(a, "off");
  if (off.length) out.push(`Dni, w które nie możesz: ${off.length}`);
  if (a.equipment.length) out.push(`Ćwiczysz: ${a.equipment.map((e) => EQUIPMENT_AT[e]).join(", ")}`);
  return out;
}

export { FEEL_NOW };
