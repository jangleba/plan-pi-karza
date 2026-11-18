import type { Profile } from "../types";
import type {
  DoseAdjustment,
  EngineSession,
  ExerciseDecision,
  LimitationCause,
  Role,
  StrengthPathNote,
} from "./model";
import { trainingTier } from "./model";
import { eligibleExercise, estimateSessionSeconds, exerciseLimitation } from "./exercises";
import { limitationText } from "./limitations";
import { strengthLandingCount } from "./gymPower";
import { resolveGoalPolicy } from "./goalPolicy";
import { COACH_SKELETONS, type Ref, type Skeleton, type SkeletonSlot } from "./coachSkeletons";
import { NOTE_FUNCTIONS, orderedCandidates } from "./noteFunctions";
import { adaptDose, noteLevelDecision } from "./noteDosage";
import { APP_MINIMUM_AGE } from "./preparation";
import { buildStrengthPreparation, strengthPreparationOverhead } from "./strengthPreparation";

/**
 * Gym sessions built like the athlete's coaching notes: blocks of one to three exercises done
 * in rounds (1a → 1b → 1c, then the round rest), reactive work paired with strength, upper body
 * push/pull and accessories at the end. These four notes are the template for every gym session
 * of a 16+ player with a gym. Exercises come from the library and pass its eligibility,
 * equipment and place rules; a player without the preparation for the note's exercise gets the
 * next listed option from the same family (e.g. trap-bar jump instead of a hang power clean),
 * never a trivial bodyweight movement. Doses are the notes' prescriptions for prepared adults
 * and product starting doses for everyone else, not individually tested loads.
 */
export type AdvancedTemplateId =
  | "N_squat_bench"
  | "N_clean_plyo"
  | "N_step_reactive"
  | "N_trapbar"
  // Earlier note sessions (kept readable in saved plans).
  | "A_power"
  | "A_squat"
  | "B_hinge";
export type PairKind =
  | "iso_reactive"
  | "landing_reactive"
  | "strength_power"
  | "power_reactive"
  | "strength_reactive"
  | "upper_hip"
  | "upper_pull"
  | "hinge_brake"
  | "upper_trunk"
  | "trunk"
  | "accessory";

export type { NoteLevel } from "./noteDosage";
export { noteLevel } from "./noteDosage";

/**
 * A note session is compiled from the coach's skeleton (coachSkeletons.ts): the skeleton fixes the
 * blocks, their goals, the order and the reference dose; noteFunctions.ts chooses the library
 * exercise for each slot's function; noteDosage.ts turns the reference dose into this athlete's
 * dose; kilograms are never set here (the athlete's logged performance drives later suggestions).
 */
interface Template {
  id: AdvancedTemplateId;
  variant: "A" | "B";
  title: string;
  skeleton: Skeleton;
}
const templateOf = (id: AdvancedTemplateId): Template => {
  const skeleton = COACH_SKELETONS[id];
  if (!skeleton) throw new Error(`Brak szkieletu ${id}`);
  return { id, variant: skeleton.variant, title: skeleton.title, skeleton };
};
const N_SQUAT_BENCH = templateOf("N_squat_bench");
const N_CLEAN_PLYO = templateOf("N_clean_plyo");
const N_STEP_REACTIVE = templateOf("N_step_reactive");
const N_TRAPBAR = templateOf("N_trapbar");

export const ADVANCED_TEMPLATES: Partial<Record<AdvancedTemplateId, Template>> = {
  N_squat_bench: N_SQUAT_BENCH,
  N_clean_plyo: N_CLEAN_PLYO,
  N_step_reactive: N_STEP_REACTIVE,
  N_trapbar: N_TRAPBAR,
};

/** The reference dose of the week: the second (heavier) message of Day 1 overrides what it states. */
export const weekRef = (slot: SkeletonSlot, heavy: boolean): Ref =>
  heavy && slot.heavy?.ref ? { ...slot.ref, ...slot.heavy.ref } : slot.ref;
/** The coach's own exercise for the slot in that week: the one a substitute is measured against. */
export const coachExercise = (slot: SkeletonSlot, heavy: boolean): string =>
  (heavy ? slot.heavy?.prefer : undefined) ??
  slot.prefer?.[0] ??
  NOTE_FUNCTIONS[slot.fn].candidates[0];
/** Exercises that can stand for the slot, the coach's own first, then the function's equivalents. */
export const slotCandidates = (slot: SkeletonSlot, heavy: boolean): string[] =>
  orderedCandidates(
    NOTE_FUNCTIONS[slot.fn],
    slot.prefer ?? [],
    heavy ? slot.heavy?.prefer : undefined,
  );

const KIND_TITLE: Record<PairKind, string> = {
  iso_reactive: "Izometria i skoki",
  landing_reactive: "Lądowanie i skok reaktywny",
  strength_power: "Siła i moc",
  power_reactive: "Moc i skoki",
  strength_reactive: "Siła i skok reaktywny",
  upper_hip: "Góra ciała i biodro",
  upper_pull: "Pchanie i przyciąganie",
  hinge_brake: "Biodro i hamowanie",
  upper_trunk: "Góra ciała i tułów",
  trunk: "Tułów",
  accessory: "Akcesoria",
};
export const pairTitle = (kind: PairKind) => KIND_TITLE[kind] ?? "Superseria";

/** Landing events per gym session: below the weekly app budgets (48 for 16–17, 60 for adults). */
export const ADVANCED_CONTACT_LIMIT = (age: number) => (age < 18 ? 30 : 48);

/** A concrete reason the note sessions do not apply to a profile; null when they do. */
export interface NoteIneligibility {
  code: string;
  message: string;
}
export function advancedIneligibility(p: Profile): NoteIneligibility | null {
  const template = p.trainingMethodPreferences?.gymTemplate;
  if (!p.hasGym) return { code: "NO_GYM", message: "Sesje według notatek wymagają siłowni." };
  if (!Number.isFinite(p.age) || p.age < APP_MINIMUM_AGE)
    return { code: "AGE", message: "Sesje według notatek są dla zawodników od 16 lat." };
  if (p.painInjury || p.seasonPhase === "return_injury")
    return {
      code: "RETURN_REVIEW",
      message: "Przy zgłoszonym bólu lub powrocie po urazie sesje według notatek są wstrzymane.",
    };
  if (p.seasonPhase === "transition")
    return {
      code: "TRANSITION_PHASE",
      message: "W fazie przejściowej sesje według notatek nie są układane; zastosowano zwykłe A/B.",
    };
  if (resolveGoalPolicy(p).reduced)
    return {
      code: "REDUCED_GOAL",
      message:
        "Zadeklarowany powrót lub ograniczenie zmęczeniem wybiera lżejszą siłę A/B zamiast notatek.",
    };
  if (template === "athletic_ab" || template === "balanced")
    return {
      code: "LAYOUT_CHOSEN",
      message: "Zawodnik wybrał własny układ siłowni (sportowe lub zrównoważone A/B).",
    };
  // Exercises the player picked by hand keep the usual A/B layout they were chosen for.
  if (Object.values(p.trainingMethodPreferences?.gymExercises ?? {}).some(Boolean))
    return {
      code: "MANUAL_EXERCISES",
      message: "Ręcznie wybrane ćwiczenia siłowni zachowują zwykły układ A/B.",
    };
  if (p.trainingMethodPreferences?.strength && p.trainingMethodPreferences.strength !== "auto")
    return {
      code: "METHOD_CHOSEN",
      message: "Wybrana metoda specjalistyczna zachowuje zwykły układ A/B.",
    };
  return null;
}

/**
 * Every 16+ player with a gym gets the note sessions, unless they chose another layout
 * (athletic or balanced A/B), their own gym exercises or a specialist method, report pain, return from injury or are in
 * a transition phase. Lighter weeks keep the notes with fewer rounds (planner.finalizeAdvanced).
 */
export function advancedSessionsEligible(p: Profile, _phase?: EngineSession["phase"]): boolean {
  return advancedIneligibility(p) === null;
}

/**
 * Two A and two B notes alternate by block rotation; a power, speed or agility goal starts with
 * the more reactive note, a strength or general goal with the heavier one.
 */
export function advancedTemplateFor(variant: "A" | "B", rotation: number, p?: Profile): Template {
  const goal = p ? resolveGoalPolicy(p).strengthGoal : "strength";
  const reactiveFirst = ["power", "speed", "agility"].includes(goal);
  const pair =
    variant === "A"
      ? reactiveFirst
        ? [N_CLEAN_PLYO, N_SQUAT_BENCH]
        : [N_SQUAT_BENCH, N_CLEAN_PLYO]
      : reactiveFirst
        ? [N_STEP_REACTIVE, N_TRAPBAR]
        : [N_TRAPBAR, N_STEP_REACTIVE];
  return pair[Math.abs(rotation) % 2];
}

/** Why the coach's exercise was not used: the structural cause, never a vague "unavailable". */
function substitutionReason(
  coach: string,
  chosen: string,
  p: Profile,
  role: Role,
  used: ReadonlySet<string>,
): string {
  const cause = exerciseLimitation(coach, p, role);
  if (cause === "equipment") return "brak sprzętu lub miejsca na ćwiczenie trenera.";
  if (cause === "preparation")
    return "przygotowanie, wiek lub nadzór zawodnika nie pozwalają na ćwiczenie trenera.";
  if (cause === "recipe")
    return "ćwiczenie trenera nie jest dostępne w bibliotece dla tego profilu.";
  return used.has(coach) ? "ćwiczenie trenera jest już użyte w tej sesji." : `wybrano ${chosen}.`;
}

const LOWER_ROLES: Role[] = ["knee_strength", "hip_strength", "unilateral_strength"];

/** Why a template cannot stand for this profile: the structural cause of the missing main part. */
function templateLimitation(
  p: Profile,
  template: Template,
): { cause: LimitationCause; message: string } {
  const slots = template.skeleton.blocks
    .flatMap((block) => block.slots)
    .map((slot) => ({
      role: NOTE_FUNCTIONS[slot.fn].role,
      main: Boolean(NOTE_FUNCTIONS[slot.fn].main),
      candidates: slotCandidates(slot, false),
      alt: NOTE_FUNCTIONS[slot.fn].alt,
    }));
  const probe = (roles: Role[]) => {
    const ids = slots.flatMap((slot) => [
      ...(roles.includes(slot.role) ? slot.candidates.map((id) => ({ id, role: slot.role })) : []),
      ...(slot.alt && roles.includes(slot.alt.role)
        ? slot.alt.candidates.map((id) => ({ id, role: slot.alt!.role }))
        : []),
    ]);
    const why = ids.map(({ id, role }) => exerciseLimitation(id, p, role)).filter(Boolean);
    const cause: LimitationCause = why.includes("equipment")
      ? "equipment"
      : why.includes("preparation")
        ? "preparation"
        : "recipe";
    return { cause, role: roles[0] };
  };
  const lowerPresent = slots.some(
    (slot) =>
      slot.main &&
      LOWER_ROLES.includes(slot.role) &&
      (slot.candidates.some((id) => eligibleExercise(id, p, slot.role)) ||
        slot.alt?.candidates.some((id) => eligibleExercise(id, p, slot.alt!.role))),
  );
  const missing = lowerPresent ? probe(["push", "pull"]) : probe(LOWER_ROLES);
  const label = lowerPresent
    ? "zadanie góry ciała (pchanie lub przyciąganie)"
    : "główny wzorzec nóg";
  return {
    cause: missing.cause,
    message: `Notatka „${template.title}” niedostępna. ${limitationText(missing.cause, missing.role, label)}`,
  };
}

export interface AdvancedAttempt {
  session: EngineSession | null;
  /** Set when the first-choice note was replaced or no note could be built. */
  path?: StrengthPathNote;
}

/**
 * The one entry of the note path with its outcome explained. The first-choice note of the
 * rotation is tried, then the other note of the same A/B variant; only when neither stands is
 * the usual A/B session used, with the structural cause of both failures.
 */
export function attemptAdvancedStrength(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
  keep?: AdvancedTemplateId,
): AdvancedAttempt {
  const ineligible = advancedIneligibility(p);
  if (ineligible)
    return {
      session: null,
      path: { path: "standard", code: ineligible.code, message: ineligible.message },
    };
  const kept = keep && ADVANCED_TEMPLATES[keep];
  const first =
    kept && [advancedTemplateFor(variant, 0, p), advancedTemplateFor(variant, 1, p)].includes(kept)
      ? kept
      : advancedTemplateFor(variant, rotation, p);
  const second = advancedTemplateFor(
    variant,
    first === advancedTemplateFor(variant, 0, p) ? 1 : 0,
    p,
  );
  // The note's second loading week comes every second time the note is due.
  const heavy = Math.floor(Math.abs(rotation) / 2) % 2 === 1;
  const built = buildFromTemplate(p, variant, phase, first, heavy);
  if (built) return { session: built };
  const firstWhy = templateLimitation(p, first);
  const alternative = second !== first ? buildFromTemplate(p, variant, phase, second, heavy) : null;
  if (alternative)
    return {
      session: alternative,
      path: {
        path: "note",
        code: "NOTE_SUBSTITUTED",
        cause: firstWhy.cause,
        requestedTemplate: first.id,
        message: `${firstWhy.message} Użyto drugiej notatki tego dnia („${second.title}”).`,
      },
    };
  const secondWhy = second !== first ? templateLimitation(p, second) : firstWhy;
  const cause =
    firstWhy.cause === "equipment" || secondWhy.cause === "equipment"
      ? "equipment"
      : firstWhy.cause === "preparation" || secondWhy.cause === "preparation"
        ? "preparation"
        : "recipe";
  return {
    session: null,
    path: {
      path: "standard",
      code: `NOTE_${cause.toUpperCase()}`,
      cause,
      requestedTemplate: first.id,
      message: `${firstWhy.message}${second !== first ? ` ${secondWhy.message}` : ""} Zastosowano zwykłą siłę A/B.`,
    },
  };
}

export function buildAdvancedStrength(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
  /** A rebuild of a saved session keeps its note (when it still exists and matches A/B). */
  keep?: AdvancedTemplateId,
): EngineSession | null {
  const attempt = attemptAdvancedStrength(p, variant, phase, rotation, keep);
  if (attempt.session && attempt.path) attempt.session.strengthPath = attempt.path;
  return attempt.session;
}

function buildFromTemplate(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  template: Template,
  heavy = false,
): EngineSession | null {
  const decision = noteLevelDecision(p);
  const used = new Set<string>();
  const omissions: NonNullable<EngineSession["noteOmissions"]> = [];
  const pick = (slot: SkeletonSlot): ExerciseDecision | null => {
    const fn = NOTE_FUNCTIONS[slot.fn];
    const coach = coachExercise(slot, heavy);
    let role = fn.role;
    let id = slotCandidates(slot, heavy).find((c) => !used.has(c) && eligibleExercise(c, p, role));
    if (!id && fn.alt) {
      role = fn.alt.role;
      id = fn.alt.candidates.find((c) => !used.has(c) && eligibleExercise(c, p, role));
    }
    if (!id) {
      // Never filled with another function: the slot is left out and the cause is reported.
      omissions.push({
        slot: slot.id,
        function: slot.fn,
        cause: exerciseLimitation(coach, p, fn.role) ?? "recipe",
      });
      return null;
    }
    used.add(id);
    const substitute = id !== coach;
    const { dose, adjustments, productDefaults } = adaptDose({
      slot,
      ref: weekRef(slot, heavy),
      exerciseId: id,
      substitute,
      level: decision.level,
      p,
      phase,
    });
    const text = heavy ? (slot.heavy?.text ?? slot.text) : slot.text;
    const all: DoseAdjustment[] = substitute
      ? [
          {
            field: "exercise",
            from: coach,
            to: id,
            reason: substitutionReason(coach, id, p, role, used),
          },
          ...adjustments,
        ]
      : adjustments;
    return {
      exerciseId: id,
      role,
      dose,
      reason: `Z notatki trenera (${slot.id}): „${text}”${!substitute && slot.coachNote ? ` (${slot.coachNote})` : ""}.${substitute ? ` Zamiennik tej samej funkcji („${fn.label}”): ${all[0].reason}` : ""}${adjustments.length ? ` Dawka zmieniona: ${adjustments.map((a) => a.reason).join(" ")}` : ""}`,
      noteSlot: { id: slot.id, text, function: slot.fn },
      ...(substitute ? { substituteFor: coach } : {}),
      ...(all.length ? { doseAdjustments: all } : {}),
      ...(productDefaults.length ? { productDefaults } : {}),
    };
  };
  const exercises: ExerciseDecision[] = [];
  const pairs: NonNullable<EngineSession["complexPairs"]> = [];
  const optional: string[] = [];
  exercises.push(...buildStrengthPreparation((id) => eligibleExercise(id, p, "warmup")));
  const labels = "ABCDEFGH";
  for (const block of template.skeleton.blocks) {
    const picked = block.slots.map(pick);
    let rows = picked.filter((r): r is ExerciseDecision => Boolean(r));
    if (!rows.length) continue;
    // A group keeps the exercises that are available (e.g. the isometric push without the jump).
    // The sets are the note's own: exercises of one group may differ (bench 4 sets, face pull 3);
    // the group runs as many rounds as its longest exercise and the others stop earlier.
    const last = rows[rows.length - 1];
    const roundRest = Math.max(last.dose.restSeconds, block.roundRestSeconds);
    if (rows.length > 1) {
      rows = rows.map((r) => ({ ...r, dose: { ...r.dose } }));
      layoutGroup(rows, roundRest);
      pairs.push({
        label: labels[pairs.length],
        kind: block.pair as PairKind,
        exerciseIds: rows.map((r) => r.exerciseId),
        transitionSeconds: 30,
        roundRestSeconds: roundRest,
      });
    } else rows[0] = { ...rows[0], dose: { ...rows[0].dose, restSeconds: roundRest } };
    if (block.optional) optional.push(...rows.map((r) => r.exerciseId));
    exercises.push(...rows);
  }
  const roles = new Set(exercises.map((e) => e.role));
  // The note structure stands with a loaded lower lift and upper work; jumps follow preparation.
  // The main lower work (heavy squat, step-up, hinge) must itself be present: a light accessory
  // for the hips does not make a note session.
  const mainLower = exercises.some(
    (e) =>
      e.noteSlot &&
      NOTE_FUNCTIONS[e.noteSlot.function as keyof typeof NOTE_FUNCTIONS]?.main &&
      LOWER_ROLES.includes(e.role),
  );
  if (!mainLower || !(roles.has("push") || roles.has("pull"))) return null;
  const recipe: EngineSession = {
    variant: "full",
    strengthPreparationVersion: 1,
    roles: [variant === "A" ? "strengthA" : "strengthB"],
    tier: trainingTier(p),
    phase,
    organization: "complex",
    advancedTemplate: template.id,
    noteLevelBasis: decision.basis,
    ...(omissions.length ? { noteOmissions: omissions } : {}),
    complexPairs: pairs,
    highLower: true,
    exercises,
    missing: [],
    sprintMetres: 0,
    plyometricContacts: strengthLandingCount(exercises),
    minutes: 0,
    ...(optional.length ? { optionalExercises: optional } : {}),
  };
  const fitted = fitContacts(resyncAdvancedGroups(recipe), ADVANCED_CONTACT_LIMIT(p.age));
  fitted.minutes =
    Math.ceil(estimateSessionSeconds(fitted.exercises) / 60) + strengthPreparationOverhead(fitted);
  return fitted;
}

/** Records a change of the coach's reference dose with its reason. */
function noteAdjustment(
  row: ExerciseDecision,
  field: DoseAdjustment["field"],
  from: number,
  to: number,
  reason: string,
) {
  const list = row.doseAdjustments ?? [];
  const last = list[list.length - 1];
  // Repeated steps of one reason (landing limit, one by one) read as a single change.
  row.doseAdjustments =
    last && last.field === field && last.reason === reason
      ? [...list.slice(0, -1), { ...last, to }]
      : [...list, { field, from, to, reason }];
}

/**
 * Keeps the session's landings within the limit without touching the strength work: first fewer
 * repetitions of the last jump rows (not below 2), then the last jump rows are left out.
 */
function fitContacts(recipe: EngineSession, limit: number): EngineSession {
  const jumps = () =>
    [...recipe.exercises].reverse().filter((e) => (e.dose.contactsPerRep ?? 0) > 0);
  for (let guard = 0; guard < 40 && strengthLandingCount(recipe.exercises) > limit; guard++) {
    const row = jumps().find((e) => (e.dose.reps ?? 0) > 2);
    if (!row) break;
    row.dose = { ...row.dose, reps: (row.dose.reps ?? 3) - 1 };
    noteAdjustment(
      row,
      "reps",
      (row.dose.reps ?? 2) + 1,
      row.dose.reps ?? 2,
      `Limit lądowań w sesji (${limit}).`,
    );
  }
  let out = recipe;
  while (strengthLandingCount(out.exercises) > limit) {
    const last = [...out.exercises].reverse().find((e) => (e.dose.contactsPerRep ?? 0) > 0);
    if (!last) break;
    out = withoutAdvancedRows(out, new Set([last.exerciseId]));
  }
  out.plyometricContacts = strengthLandingCount(out.exercises);
  return out;
}

/**
 * Gym-station progression (GP1/GP2) row by row, so a regression that turns one station into
 * another keeps its place in the group; a station that would repeat another row of the session
 * is left out (one exercise appears once per session).
 */
export function progressAdvanced(
  recipe: EngineSession,
  progress: (r: EngineSession) => EngineSession,
): EngineSession {
  const out = structuredClone(recipe);
  out.gymProgressionDecisions = [];
  const drop = new Set<number>();
  const renamed = new Map<string, string>();
  recipe.exercises.forEach((row, i) => {
    if (!row.exerciseId.startsWith("gym_")) return;
    const single = progress({ ...recipe, exercises: [row], complexPairs: [] });
    out.gymProgressionDecisions!.push(...(single.gymProgressionDecisions ?? []));
    const next = single.exercises[0];
    if (!next) drop.add(i);
    else {
      out.exercises[i] = next;
      if (next.exerciseId !== row.exerciseId) renamed.set(row.exerciseId, next.exerciseId);
    }
  });
  const seen = new Set<string>();
  out.exercises.forEach((row, i) => {
    if (drop.has(i)) return;
    if (seen.has(row.exerciseId)) drop.add(i);
    seen.add(row.exerciseId);
  });
  // Dropped rows get a unique marker, so a duplicate leaves without taking its namesake along.
  const marker = (i: number) => `__dropped_${i}`;
  const original = recipe.exercises.map((e) => e.exerciseId);
  out.complexPairs = (out.complexPairs ?? []).map((pair) => ({
    ...pair,
    exerciseIds: pair.exerciseIds.map((id) => {
      const i = original.indexOf(id);
      return drop.has(i) ? marker(i) : out.exercises[i].exerciseId;
    }),
  }));
  out.exercises = out.exercises.map((e, i) => (drop.has(i) ? { ...e, exerciseId: marker(i) } : e));
  if (out.optionalExercises)
    out.optionalExercises = out.optionalExercises.map((id) => renamed.get(id) ?? id);
  const lost = recipe.exercises.filter((_, i) => drop.has(i)).map((e) => e.role);
  const result = withoutAdvancedRows(out, new Set([...drop].map(marker)));
  result.missing = [
    ...new Set([
      ...result.missing,
      ...lost.filter((role) => !result.exercises.some((e) => e.role === role)),
    ]),
  ];
  return resyncAdvancedGroups(result);
}

/**
 * A short note session: optional groups, then other groups (or single rows) leave from the end
 * until the session fits, keeping the one with the main lower lift and the first with upper work.
 */
export function shortenAdvanced(recipe: EngineSession, budget: number): EngineSession {
  const LOWER = ["knee_strength", "hip_strength", "unilateral_strength"];
  const units: string[][] = [];
  const grouped = new Set((recipe.complexPairs ?? []).flatMap((g) => g.exerciseIds));
  for (const e of recipe.exercises) {
    if (e.role === "warmup" || e.role === "mobility") continue;
    const group = recipe.complexPairs?.find((g) => g.exerciseIds[0] === e.exerciseId);
    if (group) units.push(group.exerciseIds);
    else if (!grouped.has(e.exerciseId)) units.push([e.exerciseId]);
  }
  const role = (id: string) => recipe.exercises.find((e) => e.exerciseId === id)?.role;
  const lower = units.find((u) => u.some((id) => LOWER.includes(role(id) ?? "")));
  const upper = units.find((u) => u.some((id) => ["push", "pull"].includes(role(id) ?? "")));
  const optional = new Set(recipe.optionalExercises ?? []);
  let out = recipe;
  // Optional groups leave first, then the others from the end.
  for (const onlyOptional of [true, false])
    for (const unit of [...units].reverse()) {
      if (out.minutes <= budget) return out;
      if (unit === lower || unit === upper) continue;
      if (onlyOptional && !unit.every((id) => optional.has(id))) continue;
      if (!unit.some((id) => out.exercises.some((e) => e.exerciseId === id))) continue;
      out = withoutAdvancedRows(out, new Set(unit));
    }
  return out;
}

/** After a dose change (progression), every group again shares its rounds and rests. */
/**
 * Rests of one note group whose exercises may have different numbers of sets. In every round the
 * exercises that still have sets follow each other with the short transition; the last of them
 * rests the full round rest. An exercise with more sets than its later partners does its
 * extra sets alone (`pairedSets`) and rests the round rest after them (`soloRestSeconds`).
 */
export function layoutGroup(rows: ExerciseDecision[], roundRestSeconds: number, transition = 30) {
  rows.forEach((row, i) => {
    const later = Math.max(0, ...rows.slice(i + 1).map((r) => r.dose.sets));
    const d = { ...row.dose };
    delete d.pairedSets;
    delete d.soloRestSeconds;
    delete d.postRestSeconds;
    if (i === rows.length - 1) {
      d.restSeconds = roundRestSeconds;
      d.postRestSeconds = roundRestSeconds;
    } else {
      d.restSeconds = transition;
      if (d.sets > later) {
        d.pairedSets = later;
        d.soloRestSeconds = roundRestSeconds;
        d.postRestSeconds = roundRestSeconds;
      }
    }
    row.dose = d;
  });
}

export function resyncAdvancedGroups(recipe: EngineSession): EngineSession {
  const pairs: NonNullable<EngineSession["complexPairs"]> = [];
  for (const pair of recipe.complexPairs ?? []) {
    const rows = recipe.exercises.filter((e) => pair.exerciseIds.includes(e.exerciseId));
    // Groups may have exercises with different numbers of sets (a gym jump with fewer rounds by
    // its own rules simply stops earlier), so nothing leaves the group here.
    if (rows.length < 2) {
      for (const r of rows) {
        r.dose = { ...r.dose, restSeconds: pair.roundRestSeconds };
        delete r.dose.postRestSeconds;
        delete r.dose.pairedSets;
        delete r.dose.soloRestSeconds;
      }
      continue;
    }
    layoutGroup(rows, pair.roundRestSeconds);
    pairs.push({ ...pair, exerciseIds: rows.map((r) => r.exerciseId) });
  }
  pairs.forEach((pair, i) => (pair.label = "ABCDEFGH"[i]));
  recipe.complexPairs = pairs;
  recipe.plyometricContacts = strengthLandingCount(recipe.exercises);
  recipe.minutes =
    Math.ceil(estimateSessionSeconds(recipe.exercises) / 60) + strengthPreparationOverhead(recipe);
  return recipe;
}

/**
 * A lighter week keeps the note: `hold` (maintenance, deload, re-entry) caps every row at two
 * rounds with at least 3 reps in reserve on the lifts; otherwise (time) one round less.
 */
export function lighterAdvanced(
  recipe: EngineSession,
  dropReactiveDepth: boolean,
  hold = true,
): EngineSession {
  const copy = structuredClone(recipe);
  for (const e of copy.exercises)
    if (e.role !== "warmup" && e.role !== "mobility") {
      const before = e.dose.sets;
      e.dose = {
        ...e.dose,
        sets: Math.max(1, hold ? Math.min(2, e.dose.sets) : e.dose.sets - 1),
        ...(hold && e.dose.rir !== undefined ? { rir: Math.max(3, e.dose.rir) } : {}),
      };
      if (e.dose.sets !== before)
        noteAdjustment(
          e,
          "sets",
          before,
          e.dose.sets,
          hold
            ? "Lżejszy tydzień (utrzymanie, odciążenie lub powrót): najwyżej 2 serie."
            : "Skrócenie sesji do dostępnego czasu: o serię mniej.",
        );
    }
  let out = copy;
  if (dropReactiveDepth) {
    const deep = copy.exercises
      .filter((e) => (e.dose.contactsPerRep ?? 1) >= 2)
      .map((e) => e.exerciseId);
    out = withoutAdvancedRows(copy, new Set(deep));
  }
  // Set changes alter how many rounds have a partner and how many rest alone.
  // Recompute those rests before time fitting or the compact recipe can undercount recovery.
  return resyncAdvancedGroups(out);
}

/** Drops rows (match proximity, time, lighter week), keeping the rest of each group in rounds. */
export function withoutAdvancedRows(
  recipe: EngineSession,
  ids: ReadonlySet<string>,
): EngineSession {
  if (!ids.size) return recipe;
  const copy = structuredClone(recipe);
  copy.exercises = copy.exercises.filter((e) => !ids.has(e.exerciseId));
  const pairs: NonNullable<EngineSession["complexPairs"]> = [];
  for (const pair of copy.complexPairs ?? []) {
    const left = pair.exerciseIds.filter((id) => !ids.has(id));
    if (left.length === pair.exerciseIds.length) {
      pairs.push(pair);
      continue;
    }
    const rows = copy.exercises.filter((e) => left.includes(e.exerciseId));
    if (left.length >= 2) {
      // The shorter group keeps the transitions and ends with the full round rest.
      layoutGroup(rows, pair.roundRestSeconds);
      pairs.push({ ...pair, exerciseIds: left });
    } else
      for (const e of rows) {
        // A partner left alone keeps the full rest of its round, not the 30 s transition.
        e.dose.restSeconds = pair.roundRestSeconds;
        delete e.dose.postRestSeconds;
        delete e.dose.pairedSets;
        delete e.dose.soloRestSeconds;
      }
  }
  pairs.forEach((pair, i) => (pair.label = "ABCDEFGH"[i]));
  copy.complexPairs = pairs;
  copy.skipNearMatch = copy.skipNearMatch?.filter((id) => !ids.has(id));
  copy.optionalExercises = copy.optionalExercises?.filter((id) => !ids.has(id));
  copy.plyometricContacts = strengthLandingCount(copy.exercises);
  copy.minutes =
    Math.ceil(estimateSessionSeconds(copy.exercises) / 60) + strengthPreparationOverhead(copy);
  return copy;
}
