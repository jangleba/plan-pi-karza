/**
 * Odpowiedzi z onboardingu i ich zamiana na profil oraz na PODGLĄD planu tygodnia.
 * Podgląd i właściwy plan używają tej samej funkcji (`planForProfile`), więc to, co zawodnik widzi przy układaniu tygodnia,
 * wynika z jego odpowiedzi, a nie z osobnych reguł. Czysty kod, bez Reacta (testowany osobno).
 */
import { FEEL_NOW, planForProfile, suggestGoals, weekStartOf } from "../engine";
import type { Equipment, FeelNow, League, Position, Profile, Season, SeasonGoal, SessionKind } from "../engine";

/** Stan dnia w kalendarzu tygodnia. */
export type DayState = "free" | "club" | "match" | "off";
export const DAY_CYCLE: DayState[] = ["free", "club", "match", "off"];

export interface Answers {
  name: string;
  age: number;
  weight: number;
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
  name: "", age: 18, weight: 75, feelNow: [], goals: [], years: 1, equipment: [], limited: false, days: Array<DayState>(7).fill("free"),
});

export const dayIndexes = (a: Pick<Answers, "days">, st: DayState): number[] => a.days.map((d, i) => (d === st ? i : -1)).filter((i) => i >= 0);

/** Kolejny stan dnia po dotknięciu (w przerwie między sezonami nie ma meczów). */
export function nextDayState(cur: DayState, season: Season | undefined): DayState {
  const order = season === "offseason" ? DAY_CYCLE.filter((c) => c !== "match") : DAY_CYCLE;
  const from = season === "offseason" && cur === "match" ? "free" : cur;
  return order[(order.indexOf(from) + 1) % order.length]!;
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
    case 5: return !a.equipment.length ? "Wybierz, gdzie możesz ćwiczyć." : null;
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
  if (!a.position || !a.season || !a.league || !a.equipment.length || !a.name.trim()) return null;
  const goals = goalsFor(a);
  return {
    name: a.name.trim(), age: a.age, weightKg: a.weight, position: a.position, season: a.season, goal: goals[0], goal2: goals[1], league: a.league,
    strengthYears: a.years, equipment: a.equipment, limitedGymAccess: a.limited,
    clubWeekdays: dayIndexes(a, "club"), matchWeekdays: a.season === "offseason" ? [] : dayIndexes(a, "match"), offWeekdays: dayIndexes(a, "off"),
  };
}

/** Profil tymczasowy do podglądu: braki uzupełniamy neutralnymi wartościami (nie wpływają na układ tygodnia). */
function draftProfile(a: Answers): Profile {
  const goals = goalsFor(a);
  return {
    name: a.name.trim() || undefined, age: a.age, weightKg: a.weight, position: a.position ?? "pomocnik", season: a.season ?? "inseason", goal: goals[0], goal2: goals[1], league: a.league,
    strengthYears: a.years, equipment: a.equipment.length ? a.equipment : ["gym"], limitedGymAccess: a.limited,
    clubWeekdays: dayIndexes(a, "club"), matchWeekdays: a.season === "offseason" ? [] : dayIndexes(a, "match"), offWeekdays: dayIndexes(a, "off"),
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
  const plan = planForProfile(draftProfile(a), weekStartOf(todayISO));
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
const GOAL_LABEL: Record<SeasonGoal, string> = { speed: "szybkość", strength: "siła", endurance: "wytrzymałość", return: "powrót po przerwie" };

/** Krótkie zdania „co zrozumieliśmy” pokazywane na ekranie układania planu; każde pochodzi z konkretnej odpowiedzi. */
export function understood(a: Answers): string[] {
  const out: string[] = [];
  const matches = a.season === "offseason" ? [] : dayIndexes(a, "match");
  if (matches.length) out.push(`Mecz ${matches.map((i) => MATCH_DAY[i]).join(" i ")}`);
  else if (a.season === "offseason") out.push("Przerwa między sezonami: bez meczów, lżej");
  const club = dayIndexes(a, "club");
  if (club.length) out.push(`Trening w klubie: ${club.map((i) => WEEKDAY_FULL[i]).join(", ")}`);
  const goals = goalsFor(a);
  if (goals.length) out.push(`Cel: ${goals.map((g) => GOAL_LABEL[g]).join(" i ")}`);
  const off = dayIndexes(a, "off");
  if (off.length) out.push(`Dni, w które nie możesz: ${off.length}`);
  if (a.equipment.length) out.push(`Ćwiczysz: ${a.equipment.map((e) => (e === "gym" ? "na siłowni" : e === "bodyweight" ? "z własnym ciężarem" : "na boisku lub bieżni")).join(", ")}`);
  return out;
}

export { FEEL_NOW };
