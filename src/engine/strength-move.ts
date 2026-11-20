/**
 * Przekładanie siły na prośbę zawodnika („dziś nie zrobię siły”): co pokazać w check-inie i w planie. Czyste funkcje nad `planForProfile`,
 * więc to, co zawodnik widzi, jest dokładnie tym, co policzył silnik (bez osobnej logiki w interfejsie).
 */
import { planForProfile, type Profile } from "./profile";
import { weekStartOf, weekdayGen } from "./week";
import type { StrengthBlock } from "./types";

const WEEKDAY_ACC = ["poniedziałek", "wtorek", "środę", "czwartek", "piątek", "sobotę", "niedzielę"];
const weekdayAcc = (iso: string): string => WEEKDAY_ACC[(new Date(Date.parse(iso)).getUTCDay() + 6) % 7]!;

export interface StrengthDayInfo {
  /** Czy pokazać przełącznik: w tym dniu jest siła albo zgłoszenie już istnieje (żeby dało się je cofnąć). */
  show: boolean;
  blocked: boolean;
  /** Dzień, na który silnik przełożył siłę (gdy zgłoszenie istnieje i było dokąd przełożyć). */
  movedTo?: { date: string; afterMatch: boolean };
  /** Siła z tego dnia nie zmieściła się w tygodniu (wyjaśnienie z silnika). */
  lost?: string;
}

export function strengthDayInfo(profile: Profile, date: string, blocked: StrengthBlock[]): StrengthDayInfo {
  const ws = weekStartOf(date);
  const isBlocked = blocked.some((b) => b.date === date);
  const without = planForProfile(profile, ws, { noStrengthDays: blocked.filter((b) => b.date !== date) });
  const planned = without.days.find((d) => d.date === date)?.session?.kind === "strength";
  if (!isBlocked) return { show: planned, blocked: false };
  const full = planForProfile(profile, ws, { noStrengthDays: blocked });
  const moved = full.days.find((d) => d.session?.movedFrom === date);
  const lost = planned && !moved ? full.warnings.find((w) => w.startsWith(`Siła z ${weekdayGen(date)} nie zmieściła się`)) : undefined;
  return { show: true, blocked: true, ...(moved ? { movedTo: { date: moved.date, afterMatch: moved.phase === "MD+1" } } : {}), ...(lost ? { lost } : {}) };
}

/** Jedno zdanie o skutku zgłoszenia (albo null, gdy nie ma czego dodać). */
export function strengthMoveText(info: StrengthDayInfo): string | null {
  if (!info.blocked) return null;
  if (info.movedTo) return `Przełożyliśmy siłę na ${weekdayAcc(info.movedTo.date)}${info.movedTo.afterMatch ? " (dzień po meczu: to ostatnia opcja, dozwolona przy stażu siłowym od 2 lat)" : ""}.`;
  if (info.lost) return info.lost;
  return "W tym dniu nie było siły w planie, więc nic się nie zmienia.";
}
