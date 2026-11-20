/**
 * „Nie mogę zrobić dzisiejszych treningów” (check-in, plan): co pokazać zawodnikowi. Czyste funkcje nad `planForProfile`, więc to, co widzi
 * zawodnik, jest dokładnie tym, co policzył silnik (bez osobnej logiki w interfejsie).
 */
import { MD1_STRENGTH_MIN_YEARS, weekStartOf } from "./week";
import { planForProfile, type Profile } from "./profile";
import type { DaySkip, SessionKind, SkipMove } from "./types";

const WEEKDAY_ACC = ["poniedziałek", "wtorek", "środę", "czwartek", "piątek", "sobotę", "niedzielę"];
const weekdayAcc = (iso: string): string => WEEKDAY_ACC[(new Date(Date.parse(iso)).getUTCDay() + 6) % 7]!;
/** Nazwa sesji w bierniku („przełożyliśmy …”) i w mianowniku z rodzajem („… nie zmieściła się”). */
const KIND_ACC: Record<SessionKind, string> = { strength: "siłę", run: "bieganie", sprint: "sprint", technique: "technikę", activation: "aktywację", recovery: "regenerację" };
const KIND_NOM: Record<SessionKind, [string, string]> = {
  strength: ["Siła", "zmieściła"], run: ["Bieganie", "zmieściło"], sprint: ["Sprint", "zmieścił"], technique: ["Technika", "zmieściła"], activation: ["Aktywacja", "zmieściła"], recovery: ["Regeneracja", "zmieściła"],
};

export interface DaySkipInfo {
  /** Czy pokazać przełącznik: w tym dniu jest trening (klubowy lub indywidualny) albo zgłoszenie już istnieje (żeby dało się je cofnąć). */
  show: boolean;
  /** Ile treningów jest w tym dniu (klub + indywidualny): 0, 1 albo 2. */
  count: number;
  skipped: boolean;
  /** Czy w tym dniu jest trening klubowy (nie przekładamy go: prowadzi go trener). */
  club: boolean;
  /** Skutki dla sesji indywidualnej z tego dnia (gdy zgłoszenie istnieje). */
  move?: Omit<SkipMove, "from"> & {
    /** Sesji nie przekładamy (regeneracja po meczu jest związana z dniem meczu) – w zgłoszonym dniu jej po prostu nie ma. */
    dropped?: boolean;
    /** Sesja trafiła na dzień po meczu. */
    afterMatch: boolean;
  };
}

export function daySkipInfo(profile: Profile, date: string, skipped: DaySkip[]): DaySkipInfo {
  const ws = weekStartOf(date);
  const isSkipped = skipped.some((b) => b.date === date);
  const without = planForProfile(profile, ws, { skippedDays: skipped.filter((b) => b.date !== date) });
  const day = without.days.find((d) => d.date === date);
  const club = !!day?.isClub && !day.isOff;
  const count = !day || day.isOff ? 0 : (club ? 1 : 0) + (day.session ? 1 : 0);
  const base = { show: count > 0 || isSkipped, count, skipped: isSkipped, club };
  if (!isSkipped) return base;
  const full = planForProfile(profile, ws, { skippedDays: skipped });
  const move = full.moves.find((m) => m.from === date);
  if (move) {
    const target = move.to ? full.days.find((d) => d.date === move.to) : undefined;
    return { ...base, move: { kind: move.kind, to: move.to, ...(move.needsYears ? { needsYears: move.needsYears } : {}), afterMatch: target?.phase === "MD+1" } };
  }
  const kind = day?.session?.kind;
  return kind === "recovery" || kind === "activation" ? { ...base, move: { kind, to: null, dropped: true, afterMatch: false } } : base;
}

/** Tekst przycisku w check-inie: „dzisiejszych treningów” przy dwóch, „dzisiejszego treningu” przy jednym. */
export const skipLabel = (count: number): string => (count >= 2 ? "Nie mogę zrobić dzisiejszych treningów" : "Nie mogę zrobić dzisiejszego treningu");

/** Zdania o skutku zgłoszenia (albo null, gdy nie ma czego dodać). */
export function daySkipText(info: DaySkipInfo): string | null {
  if (!info.skipped) return null;
  const parts: string[] = [];
  const m = info.move;
  if (m?.dropped) parts.push(`${KIND_NOM[m.kind][0]} jest związana z dniem meczu, więc jej nie przekładamy.`);
  else if (m?.to) parts.push(`Przełożyliśmy ${KIND_ACC[m.kind]} na ${weekdayAcc(m.to)}${m.afterMatch && m.kind === "strength" ? ` (dzień po meczu: to ostatnia opcja, dozwolona przy stażu siłowym od ${MD1_STRENGTH_MIN_YEARS} lat)` : ""}.`);
  else if (m) {
    const [nom, verb] = KIND_NOM[m.kind];
    parts.push(`${nom} z tego dnia nie ${verb} się w tym tygodniu.${m.needsYears ? ` Dzień po meczu dopuszczamy dla siły dopiero przy stażu siłowym od ${m.needsYears} lat.` : ""}`);
  }
  if (info.club) parts.push("Treningu klubowego nie przekładamy: prowadzi go trener klubu.");
  return parts.length ? parts.join(" ") : "Zapisane. W tym dniu nic nie trzeba było przekładać.";
}
