import { planForProfile, weekStartOf } from "../engine";
import type { DayKind, Profile } from "../engine";
import type { Activity } from "../engine/mealplan";
import { loadStart } from "./store";

export interface DayInfo { kind: DayKind; activityKind: "match" | "session" | null; label: string }

/** Rodzaj dnia z planu zawodnika: mecz, dzień przed meczem, trening (indywidualny lub klubowy) albo dzień lekki. */
export function dayInfoFor(profile: Profile, iso: string): DayInfo {
  const d = planForProfile(profile, weekStartOf(iso)).days.find((x) => x.date === iso);
  if (!d) return { kind: "light", activityKind: null, label: "Dzień lekki" };
  if (d.isMatch) return { kind: "match", activityKind: "match", label: "Mecz" };
  if (d.phase === "MD-1") return { kind: "pre-match", activityKind: null, label: "Dzień przed meczem" };
  const k = d.session?.kind;
  if (k === "strength" || k === "run" || k === "sprint" || d.isClub) return { kind: "training", activityKind: "session", label: "Trening" };
  return { kind: "light", activityKind: null, label: "Dzień lekki" };
}

export const DEFAULT_START = { match: "15:00", session: "18:00" } as const;

/** Trening/mecz z godziną: wybraną przez zawodnika albo domyślną. */
export function activityFor(info: DayInfo, iso: string): Activity | null {
  if (!info.activityKind) return null;
  return { kind: info.activityKind, time: loadStart(iso) ?? DEFAULT_START[info.activityKind] };
}
