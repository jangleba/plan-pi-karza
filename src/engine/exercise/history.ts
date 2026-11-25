import { scoped } from "../../lib/store";
import type { Choice, Completion, WeightLog } from "../progress";
import type { Level } from "../types";
import type { Equipment, Position } from "../profile";
import { splitTokens } from "./qualify";
import { VARIANTS } from "./variants";
import type { AthleteContext, Competence, CompetenceSource, LoadConvention, Pref, Rx, Unlock } from "./types";

/** Warstwa 4: wykonanie. Plan (`planned`), zgłoszone wykonanie (`performed`) i konwencja kg są rozdzielone. */
export interface ExerciseEvent {
  id: string;
  sessionId: string;
  exerciseId: string;
  variantVersion: number;
  date: string;
  planned: Rx | null;
  performed?: { kg?: number; reps?: number; sets?: number };
  loadConvention: LoadConvention;
  completion?: Completion;
  choice?: Choice;
  source: "plan" | "added_by_user" | "migrated";
}

export interface ExerciseState {
  v: 1;
  events: ExerciseEvent[];
  prefs: Record<string, Pref>;
  competences: Record<string, Competence>;
  declared: { equipment: string[]; environment: string[]; people: string[] };
  qualifiedSupervision: boolean;
  seed: string;
  migrated: boolean;
}
const KEY = "exerciseState";
const MAX_EVENTS = 2000;

export const emptyState = (): ExerciseState => ({
  v: 1, events: [], prefs: {}, competences: {}, declared: { equipment: [], environment: [], people: [] },
  qualifiedSupervision: false, seed: Math.random().toString(36).slice(2, 10), migrated: false,
});

export function normalizeState(raw: unknown): ExerciseState {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ExerciseState>;
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  return {
    v: 1,
    events: Array.isArray(r.events) ? r.events.filter((e) => e && typeof e.exerciseId === "string" && typeof e.date === "string") : [],
    prefs: r.prefs && typeof r.prefs === "object" ? r.prefs : {},
    competences: r.competences && typeof r.competences === "object" ? r.competences : {},
    declared: { equipment: arr(r.declared?.equipment), environment: arr(r.declared?.environment), people: arr(r.declared?.people) },
    qualifiedSupervision: r.qualifiedSupervision === true,
    seed: typeof r.seed === "string" && r.seed ? r.seed : base.seed,
    migrated: r.migrated === true,
  };
}
export function loadExerciseState(): ExerciseState {
  try { return normalizeState(JSON.parse(scoped.getItem(KEY) ?? "null")); } catch { return emptyState(); }
}
export function saveExerciseState(s: ExerciseState): void {
  try { scoped.setItem(KEY, JSON.stringify({ ...s, events: s.events.slice(-MAX_EVENTS) })); } catch { /* brak pamięci */ }
}

/**
 * Migracja starego dziennika (ostatni wpis na ćwiczenie). Nie zmyślamy wykonania: planowane powtórzenia zostają planem (brak `performed.reps`),
 * a konwencja kg jest `unknown`, bo dawny zapis jej nie miał.
 */
export function migrateWeightLog(log: WeightLog): ExerciseEvent[] {
  return Object.entries(log).map(([exerciseId, e]) => ({
    id: `mig-${exerciseId}-${e.date}`, sessionId: `legacy-${e.date}`, exerciseId, variantVersion: VARIANTS[exerciseId]?.version ?? 1, date: e.date,
    planned: null, performed: { kg: e.kg }, loadConvention: "unknown" as const,
    ...(e.completion ? { completion: e.completion } : {}), ...(e.choice ? { choice: e.choice } : {}), source: "migrated" as const,
  }));
}
export function ensureMigrated(s: ExerciseState, log: WeightLog): ExerciseState {
  if (s.migrated) return s;
  const have = new Set(s.events.map((e) => e.id));
  let next: ExerciseState = { ...s, migrated: true, events: [...s.events, ...migrateWeightLog(log).filter((e) => !have.has(e.id))] };
  for (const e of next.events) if (e.source === "migrated" && e.choice) next = applyChoicePrefs(next, e);
  return next;
}

function applyChoicePrefs(s: ExerciseState, e: Pick<ExerciseEvent, "exerciseId" | "choice" | "date">): ExerciseState {
  const prefs = { ...s.prefs };
  if (e.choice === "swap") prefs[e.exerciseId] = { mode: "avoid", since: e.date };
  else if (e.choice === "skip") prefs[e.exerciseId] = { mode: "skip_next", since: e.date };
  else if (e.choice) delete prefs[e.exerciseId];
  return { ...s, prefs };
}

/** Zapis wykonania. Wybór swap/skip realnie zmienia kolejny dobór (preferencja), a potwierdzone wykonanie daje kompetencję `grants`. */
export function recordExerciseOutcome(s: ExerciseState, o: Omit<ExerciseEvent, "id">): ExerciseState {
  const ev: ExerciseEvent = { ...o, id: `${o.sessionId}:${o.exerciseId}:${s.events.length}` };
  let next: ExerciseState = { ...s, events: [...s.events, ev].slice(-MAX_EVENTS) };
  if (o.choice) next = applyChoicePrefs(next, o);
  if (o.completion === "all") {
    const grants = VARIANTS[o.exerciseId]?.grants ?? [];
    const comp = { ...next.competences };
    for (const g of grants) if (!comp[g]) comp[g] = { source: "performed_in_app", date: o.date };
    next = { ...next, competences: comp };
  }
  return next;
}

export function consumeSkips(s: ExerciseState, variantIds: string[]): ExerciseState {
  const prefs = { ...s.prefs };
  for (const id of variantIds) if (prefs[id]?.mode === "skip_next") delete prefs[id];
  return { ...s, prefs };
}
export function setCompetences(s: ExerciseState, codes: string[], source: CompetenceSource, date: string): ExerciseState {
  const competences = { ...s.competences };
  for (const c of codes) competences[c] = { source, date };
  return { ...s, competences };
}
export function declare(s: ExerciseState, kind: "equipment" | "environment" | "people", tokens: string[]): ExerciseState {
  return { ...s, declared: { ...s.declared, [kind]: [...new Set([...s.declared[kind], ...tokens])] } };
}
export function clearPref(s: ExerciseState, id: string): ExerciseState {
  const prefs = { ...s.prefs }; delete prefs[id]; return { ...s, prefs };
}

export const familiarVariants = (s: ExerciseState): string[] => [...new Set(s.events.filter((e) => e.completion === "all").map((e) => e.exerciseId))];

/** Ostatnie kg z TEJ SAMEJ konwencji i wersji wariantu (inne konwencje i wersje mają osobną historię). */
export function lastLoad(s: ExerciseState, exerciseId: string, convention: LoadConvention, version = 1): number | null {
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i]!;
    if (e.exerciseId === exerciseId && e.loadConvention === convention && e.variantVersion === version && e.performed?.kg) return e.performed.kg;
  }
  return null;
}

export function buildContext(s: ExerciseState, p: { age: number; level: Level; position?: Position; equipment: Equipment[]; weekInCycle: number; minutesAvailable?: number }): AthleteContext {
  return {
    age: p.age, level: p.level, position: p.position, equipment: p.equipment, declared: s.declared, competences: s.competences,
    qualifiedSupervision: s.qualifiedSupervision, familiarVariants: familiarVariants(s), prefs: s.prefs, seed: s.seed,
    weekInCycle: p.weekInCycle, minutesAvailable: p.minutesAvailable,
  };
}

/** Zastosowanie odblokowań zadeklarowanych przez zawodnika (kompetencje, sprzęt/miejsce, nadzór). Przeszkolenie specjalisty wchodzi jako `previously_trained`, nigdy jako ocena trenera. */
export function applyUnlocks(s: ExerciseState, unlocks: Unlock[], date: string): ExerciseState {
  let st = s;
  for (const u of unlocks) {
    if (u.kind === "supervision") st = { ...st, qualifiedSupervision: true };
    else if (u.kind === "competence") st = setCompetences(st, u.tokens, u.tokens.some((t) => t.startsWith("qualified_instruction")) ? "previously_trained" : "self_assessed", date);
    else {
      const v = VARIANTS[u.variantId];
      if (!v) continue;
      const t = splitTokens(v, u.tokens);
      st = declare(declare(st, "equipment", t.equipment), "environment", t.environment);
    }
  }
  return st;
}
/** Odblokowania, które zawodnik może potwierdzić sam jednym dotknięciem (bez nadzoru i przeszkolenia specjalisty). */
export const selfConfirmable = (us: Array<Unlock | undefined>): Unlock[] =>
  us.filter((u): u is Unlock => !!u && (u.kind === "gear" || (u.kind === "competence" && !u.tokens.some((t) => t.startsWith("qualified_instruction")))));
