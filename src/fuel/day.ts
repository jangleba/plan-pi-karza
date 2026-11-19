import { planForProfile, weekStartOf } from "../engine";
import type { DayKind, Profile } from "../engine";
import type { Activity } from "../engine/mealplan";
import { loadStart } from "./store";

export interface DayInfo {
  kind: DayKind;
  label: string;
  match: boolean;
  /** Dziś jest trening klubowy / indywidualny (siła, bieganie, sprint). */
  club: boolean;
  own: boolean;
}

/** Rodzaj dnia z planu zawodnika: mecz, dzień przed meczem, trening (indywidualny i/lub klubowy) albo dzień lekki. */
export function dayInfoFor(profile: Profile, iso: string): DayInfo {
  const d = planForProfile(profile, weekStartOf(iso)).days.find((x) => x.date === iso);
  const none = { match: false, club: false, own: false };
  if (!d) return { kind: "light", label: "Dzień lekki", ...none };
  if (d.isMatch) return { kind: "match", label: "Mecz", ...none, match: true };
  if (d.phase === "MD-1") return { kind: "pre-match", label: "Dzień przed meczem", ...none };
  const k = d.session?.kind;
  const own = k === "strength" || k === "run" || k === "sprint";
  const club = d.isClub;
  if (own || club) return { kind: "training", label: own && club ? "Dwa treningi" : "Trening", match: false, club, own };
  return { kind: "light", label: "Dzień lekki", ...none };
}

export type ActKey = "match" | "club" | "own";
export interface TimedActivity extends Activity { key: ActKey; label: string }

/** Domyślne godziny: klub wieczorem, mecz po południu; trening indywidualny wieczorem albo rano, gdy jest też klubowy. */
export function defaultStart(key: ActKey, both: boolean): string {
  return key === "match" ? "15:00" : key === "club" ? "18:00" : both ? "10:00" : "18:00";
}

/** Treningi/mecz z godzinami (wybranymi przez zawodnika albo domyślnymi), w kolejności dnia. */
export function activitiesFor(info: DayInfo, iso: string): TimedActivity[] {
  const out: TimedActivity[] = [];
  const time = (key: ActKey) => loadStart(iso, key) ?? defaultStart(key, info.club && info.own);
  if (info.match) out.push({ kind: "match", key: "match", label: "Początek meczu", time: time("match") });
  if (info.own) out.push({ kind: "session", key: "own", label: "Trening indywidualny", time: time("own") });
  if (info.club) out.push({ kind: "session", key: "club", label: "Trening klubowy", time: time("club") });
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export const asActivities = (a: TimedActivity[]): Activity[] => a.map(({ kind, time }) => ({ kind, time }));
