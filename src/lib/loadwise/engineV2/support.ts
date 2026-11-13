import { getExerciseDefinition, resolveEquipmentId } from "../exerciseLibrary";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "../individualFootballDrills";
import type { Profile } from "../types";
import { eligibleExercise, estimateSessionSeconds } from "./exercises";
import type { Dose, EngineSession, ExerciseDecision, Role } from "./model";
import { trainingTier } from "./model";

export type SupportKind = "activation" | "mobility" | "recovery" | "skills";
type SupportPreferences = {
  activationLocation?: "field" | "gym";
  mobilityFocus?: "general" | "hip" | "ankle" | "thoracic";
};
const normal = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
const football = (v: string) =>
  /^(?:pilka(?: noz?na)?|football(?:_ball)?|soccer(?:_ball)?|ball)$/.test(normal(v));
const wall = (v: string) =>
  /^(?:rebounder|wall|sciana|odbojnik|sciana\s*\/\s*odbojnik|wall\s*\/\s*rebounder)$/.test(
    normal(resolveEquipmentId(v) ?? v),
  );

/** Pitch or gym access does not prove ownership of a football. */
export function hasDeclaredFootball(profile: Profile): boolean {
  return (
    [...profile.equipment, ...(profile.homeEquipment ?? [])].some(football) &&
    !(profile.unavailableEquipmentIds ?? []).some(football)
  );
}

/** The existing wall checkbox is stored as rebounder; ownership is never inferred from venue. */
export function hasDeclaredWall(profile: Profile): boolean {
  return (
    [...profile.equipment, ...(profile.homeEquipment ?? [])].some(wall) &&
    !(profile.unavailableEquipmentIds ?? []).some(wall)
  );
}

/** Wall requirements live in the canonical solo-drill metadata, including goalkeeper tasks. */
export function requiresDeclaredWall(exerciseId: string): boolean {
  const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((entry) => entry.id === exerciseId);
  return !!drill && "wall" in drill && drill.wall === true;
}

function usable(id: string, p: Profile): boolean {
  const def = getExerciseDefinition(id);
  if (!def || !eligibleExercise(id, p) || def.minParticipants > 1 || def.requiresPartner)
    return false;
  if (def.requiresBall && !hasDeclaredFootball(p)) return false;
  if (requiresDeclaredWall(id) && !hasDeclaredWall(p)) return false;
  if (/^football_gk_/.test(id) && p.position !== "goalkeeper") return false;
  if (["pitch", "open_field"].includes(def.spaceRequirement) && !p.hasPitch) return false;
  if (def.spaceRequirement === "indoor_gym" && !p.hasGym) return false;
  if (def.spaceRequirement === "sprint_lane" && !p.hasSprintSpace) return false;
  return true;
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
): EngineSession | null {
  if (!hasDeclaredFootball(p)) return null;
  const firstTouch = usable("football_wall_first_touch", p)
    ? "football_wall_first_touch"
    : "football_self_feed_first_touch";
  const passing = usable("football_wall_one_touch", p)
    ? "football_wall_one_touch"
    : "football_turn_control";
  const ids =
    p.position === "goalkeeper"
      ? ["football_gk_distribution", "football_ball_mastery", firstTouch]
      : ["football_ball_mastery", firstTouch, passing];
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
          sets: phase === "deload" ? 1 : 2,
          seconds: 45,
          restSeconds: 30,
          intent: "controlled",
        },
        "Spokojna technika z piłką: dokładność i kontrola, bez zaliczania tego jako sprintu.",
      ),
    ),
  );
}
