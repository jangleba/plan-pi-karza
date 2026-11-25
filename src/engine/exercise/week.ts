import { allItems } from "./generate";
import { rxSeconds } from "./rx";
import { VARIANTS } from "./variants";
import type { AthleteContext, GeneratedSession } from "./types";

export interface Issue { code: "too_many_sessions" | "merged_modules" | "time_exceeded" | "goal_uncovered" | "empty_session"; severity: "block" | "warn"; messagePl: string; date?: string }
export type Exposure = "strength_sets" | "eccentric_knee_flexion" | "adductor" | "calf" | "isometric" | "jumps" | "acceleration" | "fast_running" | "deceleration" | "cod" | "conditioning";

const SPRINT_PATTERNS = new Set(["sprint", "cod", "drill"]);
const STRENGTH_PATTERNS = new Set(["squat", "hinge", "push", "pull", "core", "calf", "hipflexor", "iso", "power"]);

/** Czas z odpoczynkiem (min): praca + przerwy + ok. 1 min na przygotowanie każdego ćwiczenia. */
export function estimateMinutes(s: GeneratedSession): number {
  return Math.round(allItems(s).reduce((a, i) => a + rxSeconds(i.rx) / 60 + 1, 0));
}

export function exposuresOf(s: GeneratedSession): Partial<Record<Exposure, number>> {
  const out: Partial<Record<Exposure, number>> = {};
  const add = (k: Exposure, n: number) => { out[k] = (out[k] ?? 0) + n; };
  for (const i of allItems(s)) {
    const v = VARIANTS[i.variantId];
    if (!v) continue;
    const n = i.rx.sets;
    if (v.family === "knee_flexion" && v.contraction === "eccentric_emphasis") add("eccentric_knee_flexion", n);
    if (v.family === "adduction") add("adductor", n);
    if (v.family === "calf_ankle") add("calf", n);
    if (i.rx.type === "strength" && v.movementPatterns.some((p) => STRENGTH_PATTERNS.has(p))) add("strength_sets", n);
    if (i.rx.type === "isometric") add("isometric", n);
    if (i.rx.type === "plyometric") add("jumps", n);
    if (i.rx.type === "sprint" && v.primaryGoal === "acceleration") add("acceleration", n);
    if (i.rx.type === "sprint" && v.functions.includes("max_speed")) add("fast_running", n);
    if (i.rx.type === "cod" && v.functions.includes("decel")) add("deceleration", n);
    if (i.rx.type === "cod" && v.functions.includes("cod")) add("cod", n);
    if (i.rx.type === "conditioning") add("conditioning", n);
  }
  return out;
}

export function validateSession(s: GeneratedSession, ctx: AthleteContext): Issue[] {
  const issues: Issue[] = [];
  const items = allItems(s);
  if (!items.length) issues.push({ code: "empty_session", severity: "block", messagePl: "Sesja nie ma żadnego ćwiczenia.", date: s.date });
  const other = s.module === "strength" ? SPRINT_PATTERNS : STRENGTH_PATTERNS;
  const foreign = items.filter((i) => VARIANTS[i.variantId]?.movementPatterns.every((p) => other.has(p) && !(s.module === "sprint" && p === "power")));
  if (foreign.length) issues.push({ code: "merged_modules", severity: "block", messagePl: "Sprint i siłownia to osobne sesje – nie łączymy ich w jedną.", date: s.date });
  if (ctx.minutesAvailable && estimateMinutes(s) > ctx.minutesAvailable)
    issues.push({ code: "time_exceeded", severity: "block", messagePl: `Sesja zajmie ok. ${estimateMinutes(s)} min z odpoczynkiem, a masz ${ctx.minutesAvailable} min.`, date: s.date });
  const covered = new Set(items.filter((i) => i.slot.role === "main_stimulus").map((i) => i.slot.fn));
  const lost = s.requiredFns.filter((f) => !covered.has(f));
  if (lost.length) issues.push({ code: "goal_uncovered", severity: "warn", messagePl: "Sesja straciła część głównego celu. Rozważ przebudowę bloku albo krótszą sesję o innym celu.", date: s.date });
  return issues;
}

export interface ExerciseWeekInput { sessions: GeneratedSession[]; clubDates: string[]; /** Dodatkowe sesje indywidualne bez wygenerowanego planu (bieg, technika). */ otherOwnByDate?: Record<string, number> }
export interface WeekReport {
  issues: Issue[];
  exposures: Partial<Record<Exposure, number>>;
  /** Klub o nieznanej zawartości to jakość „unknown/estimated”, nigdy zero sprintów i skoków. */
  club: { sessions: number; contentQuality: "unknown_estimated" };
}
export function validateSessionAndWeek(week: ExerciseWeekInput, ctx: AthleteContext): WeekReport {
  const issues: Issue[] = week.sessions.flatMap((s) => validateSession(s, ctx));
  const count: Record<string, number> = {};
  for (const s of week.sessions) count[s.date] = (count[s.date] ?? 0) + 1;
  for (const [d, n] of Object.entries(week.otherOwnByDate ?? {})) count[d] = (count[d] ?? 0) + n;
  for (const d of week.clubDates) count[d] = (count[d] ?? 0) + 1;
  for (const [date, n] of Object.entries(count)) if (n > 2) issues.push({ code: "too_many_sessions", severity: "block", messagePl: "Najwyżej dwie sesje dziennie łącznie z klubem.", date });
  const exposures: WeekReport["exposures"] = {};
  for (const s of week.sessions) for (const [k, n] of Object.entries(exposuresOf(s))) exposures[k as Exposure] = (exposures[k as Exposure] ?? 0) + n;
  return { issues, exposures, club: { sessions: week.clubDates.length, contentQuality: "unknown_estimated" } };
}
