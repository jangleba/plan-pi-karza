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

/** Individual ball work only: no partner, wall or goalkeeper equipment is silently assumed. */
export function buildSkills(
  p: Profile,
  phase: EngineSession["phase"] = "adaptation",
  context: { rotation?: number } = {},
): EngineSession | null {
  if (!hasDeclaredFootball(p)) return null;
  const firstTouch = usable("football_wall_first_touch", p)
    ? "football_wall_first_touch"
    : "football_self_feed_first_touch";
  const passing = usable("football_wall_one_touch", p)
    ? "football_wall_one_touch"
    : "football_turn_control";
  // Stable foundations repeat; only one complementary task rotates between weeks.
  // Rotation exposes other skills, never manufactures evidence of mastery or increases volume.
  const drillEligible = (d: FootballDrill) =>
    !d.intense &&
    d.space !== "pitch" &&
    !d.roles.every((role) => role === "cooldown") &&
    (!d.positions || d.positions.includes(p.position)) &&
    usable(d.id, p);
  const keeper = p.position === "goalkeeper";
  const fixed = keeper
    ? ["football_gk_distribution", firstTouch]
    : ["football_ball_mastery", firstTouch];
  const first = keeper ? "football_ball_mastery" : passing;
  const pool = [first, ...INDIVIDUAL_FOOTBALL_DRILLS.filter(drillEligible).map((d) => d.id)].filter(
    (id, index, all) => !fixed.includes(id) && all.indexOf(id) === index && usable(id, p),
  );
  const rotation =
    Number.isInteger(context.rotation) && context.rotation! >= 0 ? context.rotation! : 0;
  const extra = pool.length ? pool[rotation % pool.length] : null;
  const ids = [...fixed, ...(extra ? [extra] : [])];
  const beginner = p.age < 16 || p.level === "beginner";
  return recipe(
    "skills",
    p,
    phase,
    ids.map((id) =>
      decision(
        p,
        id,
        "ball_skill",
        {
          sets: phase === "deload" || beginner ? 1 : 2,
          seconds: beginner ? 30 : 45,
          restSeconds: 30,
          intent: "controlled",
        },
        `Cel: ${INDIVIDUAL_FOOTBALL_DRILLS.find((d) => d.id === id)?.quality ?? "Kontrola piłki"} Pracuj spokojnie obiema nogami. Najpierw powtarzalna dokładność, dopiero potem trudniejsza noga lub zmiana kierunku; zegar nie potwierdza opanowania umiejętności.`,
      ),
    ),
  );
}
