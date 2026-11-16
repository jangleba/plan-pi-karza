import type { Profile } from "../types";
import type { Dose, EngineSession, ExerciseDecision, Role } from "./model";
import { trainingTier } from "./model";
import { eligibleExercise, estimateSessionSeconds } from "./exercises";
import {
  gymHamstringSupportCandidates,
  gymHamstringSupportDose,
  gymPowerCandidates,
  gymPowerDose,
  strengthLandingCount,
} from "./gymPower";
import { resolveGoalPolicy } from "./goalPolicy";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { APP_MINIMUM_AGE, declaresLimitedStrength } from "./preparation";

/**
 * Advanced 16+ gym sessions built the way the athlete's own coaching notes are organised:
 * preparation, then pairs (isometric → reactive jumps, landing → depth jump, strength → jump),
 * the main lift, upper body and trunk pairs. Exercises always come from the existing library and
 * pass its eligibility, equipment and place rules; an unavailable exercise is replaced by the next
 * listed option or the pair is left out. Doses are product starting prescriptions.
 */
export type AdvancedTemplateId = "A_power" | "A_squat" | "B_hinge";
export type PairKind =
  "iso_reactive" | "landing_reactive" | "strength_power" | "hinge_brake" | "upper_trunk" | "trunk";

interface Slot {
  role: Role;
  /** First eligible id wins; the note's own wording is kept for the reason text. */
  /** Fixed ids, or a choice that depends on the athlete (e.g. declared band stations). */
  candidates: string[] | ((p: Profile, phase: EngineSession["phase"]) => string[]);
  note: string;
  /** `fallback` is true when a replacement (not the note's own exercise) was chosen. */
  dose: (
    youth: boolean,
    id: string,
    fallback: boolean,
    p: Profile,
    phase: EngineSession["phase"],
  ) => Dose;
  /** Left out within three days of a match (e.g. "uginanie nóg na maszynie, jeśli nie ma meczu"). */
  skipNearMatch?: boolean;
}
interface Item {
  kind: PairKind | "single";
  first: Slot;
  second?: Slot;
  /** Rest after the second exercise of a round (or after a single exercise). */
  roundRestSeconds: number;
  /** Keep the first exercise alone when the second is unavailable. */
  keepAlone?: boolean;
  /** May be dropped to fit a shorter time budget (never the main lift or the upper task). */
  optional?: boolean;
}
interface Template {
  id: AdvancedTemplateId;
  variant: "A" | "B";
  title: string;
  warmup: string;
  items: Item[];
  finish?: string;
}

const hold =
  (seconds: number, perSide = false) =>
  (youth: boolean): Dose => ({
    sets: youth ? 2 : 3,
    seconds,
    ...(perSide ? { perSide: true } : {}),
    restSeconds: 30,
    intent: "hold",
  });
const jumps =
  (adultReps: number, youthReps: number, adultSets = 3) =>
  (youth: boolean): Dose => ({
    sets: youth ? 2 : adultSets,
    reps: youth ? youthReps : adultReps,
    contactsPerRep: 1,
    restSeconds: 120,
    intent: "explosive",
  });
/** Gym jump variants keep their own reviewed dose (GP1 progression acts on it); youth: 2 sets. */
const gymJump =
  (adultReps: number, youthReps: number) =>
  (youth: boolean, id: string, _f: boolean, p: Profile, phase: EngineSession["phase"]): Dose => {
    if (!id.startsWith("gym_")) return jumps(adultReps, youthReps)(youth);
    const d = gymPowerDose(id, p, phase);
    return youth ? { ...d, sets: Math.min(2, d.sets) } : d;
  };
const landings = (): Dose => ({
  sets: 2,
  reps: 2,
  restSeconds: 30,
  intent: "controlled",
});
/** Note dose for the note's own exercise; a replacement gets a moderate 6+ reps with RIR 3. */
const lift =
  (reps: number, rir = 2, restSeconds = 150) =>
  (youth: boolean, id: string, fallback: boolean): Dose => ({
    sets: youth ? 2 : 3,
    reps: fallback ? Math.max(reps, 6) : reps,
    ...(FUNCTIONAL_CATALOGUE[id]?.unilateral ? { perSide: true } : {}),
    rir: youth || fallback ? Math.max(3, rir) : rir,
    restSeconds,
    intent: "controlled",
  });
const trunkHold =
  (seconds: number, perSide = false) =>
  (youth: boolean): Dose => ({
    sets: youth ? 2 : 3,
    seconds,
    ...(perSide ? { perSide: true } : {}),
    restSeconds: 30,
    intent: "hold",
  });
const trunkReps = (youth: boolean): Dose => ({
  sets: youth ? 2 : 3,
  reps: 8,
  perSide: true,
  rir: 3,
  restSeconds: 30,
  intent: "controlled",
});

/** Notes of 11.09: Iso/Pogo · Landing/Depth jump · Bulgary 3×3 · Sanki/Skok w dal · OHP · Plank/ISO z gumą. */
const A_POWER: Template = {
  id: "A_power",
  variant: "A",
  title: "Siła A — moc nóg w parach",
  warmup: "hip_mobility_flow",
  items: [
    {
      kind: "iso_reactive",
      first: {
        role: "quad_iso",
        candidates: ["split_squat_iso_hold"],
        note: "Iso",
        dose: hold(20, true),
      },
      second: {
        role: "power",
        candidates: ["bilateral_pogo"],
        note: "Pogosy",
        dose: jumps(6, 4, 2),
      },
      roundRestSeconds: 120,
    },
    {
      kind: "landing_reactive",
      first: {
        role: "landing",
        candidates: ["drop_landing", "snap_down"],
        note: "Landing",
        dose: landings,
      },
      second: {
        role: "power",
        candidates: ["depth_jump", "box_jump"],
        note: "Depth jump",
        dose: jumps(2, 2, 2),
      },
      roundRestSeconds: 150,
    },
    {
      kind: "single",
      first: {
        role: "knee_strength",
        candidates: ["bulgarian_split_squat", "goblet_squat", "leg_press"],
        note: "Bulgary 3×3",
        dose: lift(3),
      },
      roundRestSeconds: 150,
    },
    {
      // "Sanki / Skok w dal": sleds have no gym exercise yet. With declared band stations and the
      // specialist qualification the reviewed banded CMJ is used (its GP1 progression stays active).
      kind: "single",
      first: {
        role: "power",
        candidates: (p, phase) => [
          ...gymPowerCandidates(p, "A", phase).filter((id) => id.startsWith("gym_cmj_")),
          "gym_broad_jump",
          "broad_jump",
        ],
        note: "Skok (sanki: brak w bibliotece)",
        dose: gymJump(2, 2),
      },
      roundRestSeconds: 120,
    },
    {
      kind: "single",
      first: {
        role: "push",
        candidates: ["dumbbell_overhead_press", "push_up"],
        note: "OHP",
        dose: lift(6, 2, 120),
      },
      roundRestSeconds: 120,
    },
    {
      kind: "trunk",
      first: { role: "trunk", candidates: ["plank"], note: "Plank z ketlem", dose: trunkHold(30) },
      second: {
        role: "trunk",
        candidates: ["pallof_press"],
        note: "ISO przy bramie z gumą",
        dose: trunkReps,
      },
      roundRestSeconds: 60,
      keepAlone: true,
      optional: true,
    },
  ],
};

/** Third note: Siady pół/Skoki na boxa · ISO na dwójki/Dwa skoki w dal · ISO bokiem/Slam · OHP/Deska bokiem · Mobilność bioder. */
const A_SQUAT: Template = {
  id: "A_squat",
  variant: "A",
  title: "Siła A — przysiad i skoki w parach",
  warmup: "ankle_mobility_flow",
  items: [
    {
      kind: "strength_power",
      first: {
        role: "knee_strength",
        candidates: ["heavy_back_squat", "goblet_squat", "leg_press"],
        note: "Siady pół: mocno w górę, wolno w dół",
        dose: lift(5),
      },
      second: {
        role: "power",
        candidates: ["box_jump", "gym_broad_jump"],
        note: "Skoki na boxa",
        dose: jumps(3, 3),
      },
      roundRestSeconds: 150,
      keepAlone: true,
    },
    {
      kind: "iso_reactive",
      first: {
        role: "hamstring_iso",
        candidates: ["long_lever_hamstring_iso"],
        note: "ISO na dwójki",
        dose: hold(20),
      },
      second: {
        role: "power",
        candidates: ["repeated_broad_jump", "gym_broad_jump", "broad_jump"],
        note: "Dwa skoki w dal",
        dose: jumps(2, 2),
      },
      roundRestSeconds: 120,
    },
    {
      kind: "iso_reactive",
      first: {
        role: "adductor",
        candidates: ["copenhagen_plank"],
        note: "ISO bokiem",
        dose: hold(15, true),
      },
      second: {
        role: "power",
        candidates: ["medicine_ball_slam"],
        note: "Slam z ziemi",
        dose: jumps(5, 4),
      },
      roundRestSeconds: 90,
    },
    {
      kind: "upper_trunk",
      first: {
        role: "push",
        candidates: ["dumbbell_overhead_press", "push_up"],
        note: "OHP",
        dose: lift(6, 2, 120),
      },
      second: {
        role: "trunk",
        candidates: ["side_plank"],
        note: "Deska bokiem",
        dose: trunkHold(20, true),
      },
      roundRestSeconds: 90,
      keepAlone: true,
    },
  ],
  finish: "hip_mobility_flow",
};

/** Notes of 25.09: ISO holding · ISO cała stopa/Pogo · Skoki ze sztangą/Sanki · Uginanie (bez meczu) · RDL jednonóż/Hamowanie · Podciąganie · Deska/Brzuch. */
const B_HINGE: Template = {
  id: "B_hinge",
  variant: "B",
  title: "Siła B — biodro, hamowanie i skoki w parach",
  warmup: "hip_mobility_flow",
  items: [
    {
      kind: "iso_reactive",
      first: {
        role: "calf_bent",
        candidates: ["soleus_iso_hold"],
        note: "ISO cała stopa",
        dose: hold(20),
      },
      second: {
        role: "power",
        candidates: ["bilateral_pogo"],
        note: "Pogo",
        dose: jumps(10, 6, 2),
      },
      roundRestSeconds: 120,
    },
    {
      kind: "single",
      first: {
        role: "power",
        candidates: ["barbell_jump_squat", "dumbbell_jump_squat", "gym_broad_jump"],
        note: "Skoki ze sztangą (sanki: brak w bibliotece)",
        dose: jumps(3, 3),
      },
      roundRestSeconds: 150,
    },
    {
      kind: "single",
      first: {
        role: "knee_strength",
        candidates: ["leg_extension"],
        note: "Prostowanie nóg na maszynie (czwórki), jeśli nie ma meczu",
        dose: lift(10, 3, 90),
        skipNearMatch: true,
      },
      roundRestSeconds: 90,
      optional: true,
    },
    {
      kind: "single",
      first: {
        role: "hip_strength",
        candidates: [
          "single_leg_romanian_deadlift",
          "kickstand_romanian_deadlift",
          "romanian_deadlift_db",
        ],
        note: "RDL jednonóż",
        dose: lift(6),
      },
      roundRestSeconds: 120,
    },
    {
      // Short dynamic hamstring work of V2.8, only when its own qualification allows it.
      kind: "single",
      first: {
        role: "hamstring_dynamic_support",
        candidates: (p, phase) => gymHamstringSupportCandidates(p, phase),
        note: "Szybka praca tyłu uda",
        dose: (_y, id, _f, _p, phase) => gymHamstringSupportDose(id, phase),
      },
      roundRestSeconds: 60,
      optional: true,
    },
    {
      // "Hamowanie z gumą": the braking preparation has one fixed set per side, so it follows the
      // RDL instead of sharing its rounds.
      kind: "single",
      first: {
        role: "landing",
        candidates: ["gym_step_brake"],
        note: "Hamowanie",
        dose: () => ({ sets: 1, reps: 2, perSide: true, restSeconds: 45, intent: "controlled" }),
      },
      roundRestSeconds: 45,
      optional: true,
    },
    {
      kind: "single",
      first: {
        role: "pull",
        candidates: ["pull_up", "lat_pulldown", "bodyweight_row"],
        note: "Podciąganie lub nauka podciągania",
        dose: lift(5, 2, 120),
      },
      roundRestSeconds: 120,
    },
    {
      kind: "trunk",
      first: {
        role: "trunk",
        candidates: ["plank"],
        note: "Deska (na dużej piłce: brak w bibliotece)",
        dose: trunkHold(30),
      },
      second: {
        role: "trunk",
        candidates: ["pallof_press"],
        note: "Brzuch przy drabinkach (brak w bibliotece: antyrotacja)",
        dose: trunkReps,
      },
      roundRestSeconds: 60,
      keepAlone: true,
      optional: true,
    },
  ],
};

export const ADVANCED_TEMPLATES: Record<AdvancedTemplateId, Template> = {
  A_power: A_POWER,
  A_squat: A_SQUAT,
  B_hinge: B_HINGE,
};
const KIND_TITLE: Record<PairKind, string> = {
  iso_reactive: "Izometria i skoki",
  landing_reactive: "Lądowanie i skok reaktywny",
  strength_power: "Siła i skok",
  hinge_brake: "Biodro i hamowanie",
  upper_trunk: "Góra ciała i tułów",
  trunk: "Tułów",
};
export const pairTitle = (kind: PairKind) => KIND_TITLE[kind];

/** Landing events per session: below the weekly app budgets (48 for 16–17, 60 for adults). */
export const ADVANCED_CONTACT_LIMIT = (age: number) => (age < 18 ? 24 : 40);

/** 16+, gym, advanced preparation, an ordinary development week, no limitation declared. */
export function advancedSessionsEligible(p: Profile, phase: EngineSession["phase"]): boolean {
  return (
    p.hasGym &&
    p.trainingMethodPreferences?.gymTemplate === "paired_power" &&
    Number.isFinite(p.age) &&
    p.age >= APP_MINIMUM_AGE &&
    trainingTier(p) === "performance" &&
    !declaresLimitedStrength(p) &&
    phase === "development" &&
    !p.painInjury &&
    !["transition", "return_injury"].includes(p.seasonPhase) &&
    !resolveGoalPolicy(p).reduced &&
    // Multi-pair reactive work is a power prescription, not a default for every advanced athlete.
    resolveGoalPolicy(p).strengthGoal === "power" &&
    // An explicitly chosen specialist method keeps its own reviewed session.
    (!p.trainingMethodPreferences?.strength || p.trainingMethodPreferences.strength === "auto")
  );
}

/** Main exercise identities stay stable for the block. Only an explicit "vary"
 * cycle recommendation selects the alternate A; a calendar week never does. */
export function advancedTemplateFor(variant: "A" | "B", rotation: number): Template {
  return variant === "B" ? B_HINGE : rotation % 2 === 0 ? A_POWER : A_SQUAT;
}

export function buildAdvancedStrength(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
): EngineSession | null {
  if (!advancedSessionsEligible(p, phase)) return null;
  const template = advancedTemplateFor(variant, rotation);
  const youth = p.age < 18;
  const used = new Set<string>();
  const pick = (slot: Slot): ExerciseDecision | null => {
    const candidates =
      typeof slot.candidates === "function" ? slot.candidates(p, phase) : slot.candidates;
    const id = candidates.find((c) => !used.has(c) && eligibleExercise(c, p, slot.role));
    if (!id) return null;
    used.add(id);
    return {
      exerciseId: id,
      role: slot.role,
      dose: {
        ...slot.dose(youth, id, id !== candidates[0], p, phase),
        ...(id === "depth_jump" ? { contactsPerRep: 2 } : {}),
      },
      reason: `Z notatki: „${slot.note}”.${slot.skipNearMatch ? " Pomijane w ciągu 3 dni od meczu." : ""}`,
    };
  };
  const exercises: ExerciseDecision[] = [];
  const pairs: NonNullable<EngineSession["complexPairs"]> = [];
  const skipNearMatch: string[] = [];
  const optional: string[] = [];
  const warmup = eligibleExercise(template.warmup, p, "warmup")
    ? template.warmup
    : "hip_mobility_flow";
  used.add(warmup);
  exercises.push({
    exerciseId: warmup,
    role: "warmup",
    dose: { sets: 1, seconds: 60, perSide: true, restSeconds: 0, intent: "easy" },
    reason: "Rozgrzewka przed parami.",
  });
  const labels = "ABCDEFG";
  for (const item of template.items) {
    const first = pick(item.first);
    const second = item.second ? pick(item.second) : null;
    if (item.second && (!first || !second)) {
      if (!first || !item.keepAlone) {
        if (first) used.delete(first.exerciseId);
        if (second) used.delete(second.exerciseId);
        continue;
      }
    }
    if (!first) continue;
    const rows = second ? [first, second] : [first];
    if (rows.length === 2 && rows[0].dose.sets !== rows[1].dose.sets) {
      const sets = Math.min(rows[0].dose.sets, rows[1].dose.sets);
      rows[0].dose = { ...rows[0].dose, sets };
      rows[1].dose = { ...rows[1].dose, sets };
    }
    const last = rows[rows.length - 1];
    last.dose = {
      ...last.dose,
      restSeconds: Math.max(last.dose.restSeconds, item.roundRestSeconds),
    };
    if (rows.length === 2) {
      rows[0].dose = { ...rows[0].dose, restSeconds: 30 };
      last.dose = { ...last.dose, postRestSeconds: last.dose.restSeconds };
      pairs.push({
        label: labels[pairs.length],
        kind: item.kind as PairKind,
        exerciseIds: [rows[0].exerciseId, rows[1].exerciseId],
        transitionSeconds: 30,
        roundRestSeconds: last.dose.restSeconds,
      });
    }
    if (item.first.skipNearMatch) skipNearMatch.push(first.exerciseId);
    if (item.optional) optional.push(...rows.map((r) => r.exerciseId));
    exercises.push(...rows);
  }
  if (
    template.finish &&
    !used.has(template.finish) &&
    eligibleExercise(template.finish, p, "mobility")
  )
    exercises.push({
      exerciseId: template.finish,
      role: "mobility",
      dose: { sets: 1, seconds: 60, perSide: true, restSeconds: 0, intent: "easy" },
      reason: "Z notatki: „Mobilność bioder”.",
    });
  const roles = new Set(exercises.map((e) => e.role));
  // The note structure only stands when its core is there: a jump pair, a lower lift and upper work.
  if (
    !exercises.some((e) => e.role === "power") ||
    !["knee_strength", "hip_strength"].some((r) => roles.has(r as Role)) ||
    !(roles.has("push") || roles.has("pull"))
  )
    return null;
  const recipe: EngineSession = {
    variant: "full",
    roles: [variant === "A" ? "strengthA" : "strengthB"],
    tier: "performance",
    phase,
    organization: "complex",
    advancedTemplate: template.id,
    complexPairs: pairs,
    highLower: true,
    exercises,
    missing: [],
    sprintMetres: 0,
    plyometricContacts: strengthLandingCount(exercises),
    minutes: Math.ceil(estimateSessionSeconds(exercises) / 60) + 8,
    ...(skipNearMatch.length ? { skipNearMatch } : {}),
    ...(optional.length ? { optionalExercises: optional } : {}),
  };
  return (recipe.plyometricContacts ?? 0) <= ADVANCED_CONTACT_LIMIT(p.age) ? recipe : null;
}

/** Drops the rows a template marks for match proximity or a shorter budget, keeping pairs whole. */
export function withoutAdvancedRows(
  recipe: EngineSession,
  ids: ReadonlySet<string>,
): EngineSession {
  if (!ids.size) return recipe;
  const copy = structuredClone(recipe);
  copy.exercises = copy.exercises.filter((e) => !ids.has(e.exerciseId));
  // A partner left alone keeps the full rest of its round, not the 30 s transition.
  for (const pair of copy.complexPairs ?? [])
    if (pair.exerciseIds.some((id) => ids.has(id)))
      for (const e of copy.exercises)
        if (pair.exerciseIds.includes(e.exerciseId)) {
          e.dose.restSeconds = pair.roundRestSeconds;
          delete e.dose.postRestSeconds;
        }
  copy.complexPairs = (copy.complexPairs ?? []).filter((pair) =>
    pair.exerciseIds.every((id) => !ids.has(id)),
  );
  copy.complexPairs.forEach((pair, i) => (pair.label = "ABCDEFG"[i]));
  copy.skipNearMatch = copy.skipNearMatch?.filter((id) => !ids.has(id));
  copy.optionalExercises = copy.optionalExercises?.filter((id) => !ids.has(id));
  copy.plyometricContacts = strengthLandingCount(copy.exercises);
  copy.minutes = Math.ceil(estimateSessionSeconds(copy.exercises) / 60) + 8;
  return copy;
}
