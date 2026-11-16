import { INDIVIDUAL_FOOTBALL_DRILLS, type FootballDrill } from "../individualFootballDrills";
import { getExerciseDefinition } from "../exerciseLibrary";
import type { Profile } from "../types";
import { eligibleExercise, estimateSessionSeconds } from "./exercises";
import type { Dose, EngineSession, ExerciseDecision, Role } from "./model";
import { trainingTier } from "./model";

export type SupportKind = "activation" | "mobility" | "recovery" | "skills";
type SupportPreferences = {
  activationLocation?: "field" | "gym";
  mobilityFocus?: "general" | "hip" | "ankle" | "thoracic";
};
export { hasDeclaredFootball, hasDeclaredWall, requiresDeclaredWall } from "./placeRequirements";
import { meetsSessionRequirements, hasDeclaredFootball } from "./placeRequirements";

function usable(id: string, p: Profile): boolean {
  const def = getExerciseDefinition(id);
  return !!def && eligibleExercise(id, p) && meetsSessionRequirements(def, p);
}

function decision(
  p: Profile,
  id: string,
  role: Role,
  dose: Dose,
  reason: string,
): ExerciseDecision | null {
  return usable(id, p) ? { exerciseId: id, role, dose, reason } : null;
}

function recipe(
  kind: SupportKind,
  p: Profile,
  phase: EngineSession["phase"],
  proposed: Array<ExerciseDecision | null>,
): EngineSession | null {
  if (p.painInjury || p.seasonPhase === "return_injury") return null;
  const exercises = proposed.filter((e): e is ExerciseDecision => e !== null);
  if (!exercises.length) return null;
  return {
    roles: [kind],
    tier: trainingTier(p),
    highLower: false,
    exercises,
    missing: [],
    sprintMetres: 0,
    phase,
    // Eight minutes for gentle preparation, setup and transitions; no fabricated speed load.
    minutes: Math.ceil(estimateSessionSeconds(exercises) / 60) + 8,
  };
}

/** A short preparation session, never a strength/sprint quota or a maximal-force session. */
export function buildActivation(
  p: Profile,
  phase: EngineSession["phase"] = "adaptation",
  allowJump = true,
): EngineSession | null {
  const preference = p.trainingMethodPreferences as SupportPreferences | undefined;
  const location =
    preference?.activationLocation ?? (p.hasPitch || p.hasSprintSpace ? "field" : "gym");
  if (!["field", "gym"].includes(location)) return null;
  if (
    (location === "gym" && !p.hasGym) ||
    (location === "field" && !p.hasPitch && !p.hasSprintSpace)
  )
    return null;
  const out: Array<ExerciseDecision | null> = [
    decision(
      p,
      "a_march",
      "warmup",
      { sets: 1, seconds: 30, restSeconds: 0, intent: "easy" },
      "Spokojne przygotowanie i rytm ruchu; bez sprintu.",
    ),
    decision(
      p,
      "ankle_rock_forward",
      "mobility",
      { sets: 1, reps: 6, perSide: true, restSeconds: 20, intent: "controlled" },
      "Kontrolowany ruch stawu skokowego w komfortowym zakresie.",
    ),
  ];
  if (location === "gym") {
    out.push(
      decision(
        p,
        "bodyweight_squat",
        "warmup",
        { sets: 1, reps: 5, restSeconds: 30, intent: "controlled" },
        "Krótka próba ruchu z masą ciała; bez ciężaru roboczego.",
      ),
    );
    out.push(
      decision(
        p,
        "standing_calf_raise",
        "calf_straight",
        { sets: 1, reps: 6, restSeconds: 30, intent: "controlled" },
        "Krótka praca stopy i łydki bez serii do zmęczenia.",
      ),
    );
  } else {
    out.push(
      decision(
        p,
        "hip_mobility_flow",
        "mobility",
        { sets: 1, seconds: 30, restSeconds: 20, intent: "controlled" },
        "Łagodny ruch bioder przed meczem; bez wymuszania zakresu.",
      ),
    );
  }
  // A simple bodyweight jump uses the catalogue's age/bodyweight-competence gate;
  // unknown barbell experience does not make a prepared footballer a novice jumper.
  if (allowJump)
    out.push(
      decision(
        p,
        "countermovement_jump",
        "power",
        { sets: 2, reps: 2, restSeconds: 60, intent: "controlled" },
        "Cztery kontrolowane wybicia z pełnym odpoczynkiem; pomiń przy utracie jakości.",
      ),
    );
  return recipe("activation", p, phase, out);
}

const MOBILITY = {
  general: ["hip_mobility_flow", "ankle_rock_forward", "quadruped_thoracic_rotation"],
  hip: ["hip_mobility_flow", "adductor_rockback", "half_kneeling_hip_flexor_stretch"],
  ankle: ["ankle_rock_forward", "calf_wall_stretch", "soleus_bent_knee_stretch"],
  thoracic: ["cat_cow", "quadruped_thoracic_rotation"],
} as const;

/** Focus is an explicit training preference, not a diagnosis inferred from pain or posture. */
export function buildMobility(
  p: Profile,
  phase: EngineSession["phase"] = "adaptation",
): EngineSession | null {
  const preference = p.trainingMethodPreferences as SupportPreferences | undefined;
  const focus = preference?.mobilityFocus ?? "general";
  if (!Object.hasOwn(MOBILITY, focus)) return null;
  const bilateral = new Set<string>(["hip_mobility_flow", "cat_cow"]);
  return recipe(
    "mobility",
    p,
    phase,
    MOBILITY[focus].map((id) =>
      decision(
        p,
        id,
        "mobility",
        {
          sets: 1,
          seconds: 30,
          perSide: !bilateral.has(id),
          restSeconds: 20,
          intent: "controlled",
        },
        "Wykonuj w komfortowym zakresie; ten blok nie jest leczeniem ograniczenia ruchu.",
      ),
    ),
  );
}

/** Optional gentle movement; never labelled as verified restoration of readiness. */
export function buildRecovery(
  p: Profile,
  phase: EngineSession["phase"] = "adaptation",
): EngineSession | null {
  return recipe("recovery", p, phase, [
    decision(
      p,
      "diaphragmatic_breathing",
      "breathing",
      { sets: 1, seconds: 90, restSeconds: 0, intent: "easy" },
      "Spokojny oddech bez wstrzymywania; samopoczucie oceniasz samodzielnie.",
    ),
    decision(
      p,
      "cat_cow",
      "mobility",
      { sets: 1, reps: 6, restSeconds: 20, intent: "controlled" },
      "Łagodny ruch tułowia bez wymuszania skrajnych pozycji.",
    ),
    decision(
      p,
      "hip_mobility_flow",
      "mobility",
      { sets: 1, seconds: 30, restSeconds: 20, intent: "easy" },
      "Spokojny ruch bioder; bez obietnicy usunięcia zmęczenia.",
    ),
  ]);
}

/**
 * Ordered slots of an individual ball session. Each slot takes the first usable drill from its
 * list, starting at the week's rotation, so the session changes week to week without inventing
 * equipment, space or a partner. Drills marked intense are left out of light sessions.
 */
const OUTFIELD_SLOTS: readonly (readonly string[])[] = [
  ["football_ball_mastery", "football_fast_feet_sequence"],
  ["football_wall_first_touch", "football_self_feed_first_touch"],
  [
    "football_wall_one_touch",
    "football_wall_receive_turn",
    "football_scan_control",
    "football_turn_control",
    "football_target_pass",
  ],
  ["football_gate_dribble", "football_cone_feints", "football_speed_dribble"],
  [
    "football_finishing_corners",
    "football_juggling_record",
    "football_long_pass_zone",
    "football_slalom_time",
  ],
];
const KEEPER_SLOTS: readonly (readonly string[])[] = [
  ["football_ball_mastery", "football_fast_feet_sequence"],
  ["football_gk_distribution", "football_gk_wall_handling"],
  ["football_wall_first_touch", "football_self_feed_first_touch"],
  ["football_gk_distribution", "football_target_pass"],
  ["football_gk_kick_zone", "football_long_pass_zone", "football_juggling_record"],
];
/** The first two slots are stable foundations (first usable drill); the others rotate weekly. */
const FIXED_SLOTS = 2;
/** Removed first when the time budget is short: challenge, then dribbling/position work. */
const DROP_ORDER = [4, 3, 2];

/**
 * Individual ball session: warm-up with the ball, first touch, passing or turning, dribbling,
 * one challenge and calm contacts at the end. No partner, wall, goal or pitch is assumed
 * beyond what the athlete declared.
 */
export function buildSkills(
  p: Profile,
  phase: EngineSession["phase"] = "adaptation",
  context: { rotation?: number; budget?: number; secondSession?: boolean } = {},
): EngineSession | null {
  if (!hasDeclaredFootball(p)) return null;
  const rotation =
    Number.isInteger(context.rotation) && context.rotation! >= 0 ? context.rotation! : 0;
  const beginner = p.age < 16 || p.level === "beginner";
  // Next to club training or another session: no fast or forceful drills and fewer sets.
  const light = beginner || phase === "deload" || !!context.secondSession;
  const drillById = new Map<string, FootballDrill>(
    INDIVIDUAL_FOOTBALL_DRILLS.map((d) => [d.id, d as FootballDrill]),
  );
  const fits = (id: string) => {
    const d = drillById.get(id);
    return (
      !!d &&
      (!d.positions || d.positions.includes(p.position)) &&
      !(light && d.intense) &&
      usable(id, p)
    );
  };
  const slots = p.position === "goalkeeper" ? KEEPER_SLOTS : OUTFIELD_SLOTS;
  const chosen: (string | null)[] = [];
  for (const [slot, list] of slots.entries()) {
    const shift = slot < FIXED_SLOTS ? 0 : rotation;
    const ordered = list.map((_, i) => list[(i + shift) % list.length]);
    chosen.push(ordered.find((id) => fits(id) && !chosen.includes(id)) ?? null);
  }
  const dose = (slot: number, sets: number): Dose =>
    slot === 0
      ? { sets: 1, seconds: 120, restSeconds: 30, intent: "controlled" }
      : {
          sets,
          seconds: beginner ? 45 : ["advanced", "elite"].includes(p.level) ? 75 : 60,
          restSeconds: beginner ? 30 : 45,
          intent: "controlled",
        };
  const build = (ids: (string | null)[], sets: number) =>
    recipe("skills", p, phase, [
      ...ids.map((id, slot) =>
        id
          ? decision(
              p,
              id,
              "ball_skill",
              dose(slot, sets),
              `Cel: ${drillById.get(id)?.quality ?? "Kontrola piłki"}`,
            )
          : null,
      ),
      fits("football_easy_contacts")
        ? decision(
            p,
            "football_easy_contacts",
            "ball_skill",
            { sets: 1, seconds: 90, restSeconds: 0, intent: "easy" },
            "Spokojne kontakty na koniec sesji.",
          )
        : null,
    ]);
  const budget = context.budget ?? Number.POSITIVE_INFINITY;
  let sets = light ? 2 : 3;
  let ids = [...chosen];
  let session = build(ids, sets);
  for (const slot of DROP_ORDER) {
    if (!session || session.minutes <= budget) break;
    if (ids.filter(Boolean).length <= 2) break;
    ids = ids.map((id, i) => (i === slot ? null : id));
    session = build(ids, sets);
  }
  while (session && session.minutes > budget && sets > 1) {
    sets -= 1;
    session = build(ids, sets);
  }
  return session && session.minutes <= budget ? session : null;
}
