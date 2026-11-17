import { buildSprintSession } from "./sprintSession";
import { excludedFromMainStrength } from "../mainStrengthExclusions";
import { fitAthleticStrengthToBudget } from "./athleticFit";
import type { SprintSessionContext } from "./sprintSession";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import {
  getExerciseDefinition,
  isExerciseAllowedForProfile,
  resolveEquipmentId,
} from "../exerciseLibrary";
import type { Profile } from "../types";
import type { Dose, ExerciseDecision, Role, EngineSession } from "./model";
import { trainingTier, ROLE_NAMES } from "./model";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import {
  gymPowerCandidates,
  gymPowerDose,
  gymHamstringSupportCandidates,
  gymHamstringSupportDose,
  strengthLandingCount,
} from "./gymPower";
import {
  hasVerifiedAdvancedStrength,
  hasValidStrengthMonths,
  preparationProfile,
} from "./preparation";
import { GYM_EXERCISE_OPTIONS, type GymExerciseSlot } from "../gymProgramming";
import { meetsSessionRequirements } from "./placeRequirements";
import { arrangeStrengthPairs } from "./strengthPairs";
import { withoutUpperContrast } from "./upperContrast";
import { buildStrengthPreparation, strengthPreparationOverhead } from "./strengthPreparation";
import {
  applyAthleticStrengthLayout,
  athleticHamstringSupportCandidates,
  athleticPowerCandidates,
  isAthleticStrengthSelected,
} from "./athleticStrength";
import {
  coachedPrimerDose,
  coachedPrimerEligible,
  controlledKneeFlexionDose,
  quadricepsHoldingDose,
  clusterEligible,
  CLUSTER_INSTRUCTION,
  removeClusterProtocol,
} from "./strengthProtocols";

/** Roles describe function, independently of the legacy family/hinge labels. */
export const CANDIDATES: Record<Role, readonly string[]> = {
  knee_strength: ["heavy_back_squat", "front_squat", "leg_press", "goblet_squat"],
  hip_strength: [
    "trap_bar_deadlift",
    "barbell_deadlift",
    "barbell_romanian_deadlift",
    "romanian_deadlift_db",
    "hip_thrust",
  ],
  unilateral_strength: ["bulgarian_split_squat", "step_up", "reverse_lunge"],
  knee_flexion: [
    "full_nordic_hamstring",
    "eccentric_nordic_hamstring",
    "assisted_nordic_hamstring",
    "seated_leg_curl",
    "lying_leg_curl",
    "bilateral_slider_leg_curl",
    "prone_band_leg_curl",
    "bridge_walkout",
  ],
  hamstring_iso: [
    "long_lever_hamstring_iso",
    "heel_dig_hamstring_iso_30",
    "heel_dig_hamstring_iso_90",
  ],
  hamstring_dynamic_support: ["gym_fast_band_curl", "gym_bridge_pulses"],
  quad_iso: ["split_squat_iso_hold"],
  iso_primer: ["overcoming_pin_squat_primer"],
  adductor: ["copenhagen_plank", "adductor_bridge_squeeze"],
  calf_straight: ["standing_calf_raise"],
  calf_bent: ["seated_soleus_raise", "soleus_iso_hold"],
  push: ["barbell_bench_press", "dumbbell_bench_press", "push_up", "wall_push_up"],
  pull: [
    "one_arm_dumbbell_row",
    "lat_pulldown",
    "bodyweight_row",
    "face_pull_band",
    "prone_ytw_raise",
  ],
  trunk: ["pallof_press", "dead_bug", "plank"],
  power: [
    "dumbbell_jump_squat",
    "trap_bar_jump",
    "medicine_ball_rotational_scoop_toss",
    "countermovement_jump",
    "broad_jump",
    "squat_jump",
  ],
  upper_power: ["med_ball_throw", "medicine_ball_rotational_scoop_toss", "medicine_ball_slam"],
  landing: ["snap_down", "drop_landing"],
  speed: ["free_acceleration_sprint"],
  endurance: ["easy_aerobic_run"],
  warmup: ["hip_mobility_flow", "a_march", "bodyweight_squat", "glute_bridge"],
  mobility: [],
  breathing: [],
  ball_skill: [],
};

const GATED_EQUIPMENT = [
  "trap_bar",
  "nordic_setup",
  "machine",
  "fixed_pins",
  "sliders",
  "med_ball",
  "sled",
  "gym_jump_lane",
  "overhead_band_station",
  "low_band_station",
  "gym_throw_zone",
  "waist_band_station",
  "platform",
  "box",
];
const ownedEquipment = (p: Profile) => [
  ...new Set([...p.equipment, ...(p.trainingMethodPreferences?.declaredEquipment ?? [])]),
];
/** Gated equipment the exercise needs and the profile does not declare. */
export function missingGatedEquipment(id: string, p: Profile): string[] {
  const d = getExerciseDefinition(id);
  if (!d) return [];
  const equipment = ownedEquipment(p);
  return d.equipmentRequired.filter(
    (e) =>
      GATED_EQUIPMENT.includes(e) &&
      !equipment.some((value) => (resolveEquipmentId(value) ?? value) === e),
  );
}

export function eligibleExercise(id: string, p: Profile, role?: Role): boolean {
  // 16+: no trivial movement as main strength work, whichever path asks (pool, manual choice,
  // rotation, equipment rebuild). Warm-up and activation roles may still use them.
  if (role && excludedFromMainStrength(id, role)) return false;
  const d = getExerciseDefinition(id);
  if (
    [
      "drop_jump",
      "single_leg_drop_landing",
      "band_step_and_stick",
      "dead_stop_pin_squat",
      "jump_shrug",
      "hang_power_snatch",
    ].includes(id) &&
    (!hasVerifiedAdvancedStrength(p) || p.supervisionLevel !== "full")
  )
    return false;
  if (
    ["jump_shrug", "hang_power_snatch"].includes(id) &&
    p.trainingMethodPreferences?.coachedOlympicLifts !== true
  )
    return false;
  return (
    !!d &&
    d.approved !== false &&
    !d.draft &&
    meetsSessionRequirements(d, p, role) &&
    missingGatedEquipment(id, p).length === 0 &&
    isExerciseAllowedForProfile(d, buildAthleteTrainingProfile(p)).ok
  );
}

/**
 * Why an exercise is not eligible, as one structural cause. "equipment" wins when a declared
 * item is missing (the player can fix it by owning it); everything else that remains is the
 * verified preparation. "recipe" means the library has no approved recipe for the role.
 */
export function exerciseLimitation(
  id: string,
  p: Profile,
  role?: Role,
): "equipment" | "preparation" | "recipe" | null {
  if (eligibleExercise(id, p, role)) return null;
  const d = getExerciseDefinition(id);
  if (!d || d.approved === false || d.draft || (role && excludedFromMainStrength(id, role)))
    return "recipe";
  if (missingGatedEquipment(id, p).length || !meetsSessionRequirements(d, p, role))
    return "equipment";
  const allowed = isExerciseAllowedForProfile(d, buildAthleteTrainingProfile(p));
  // The library names a missing item in plain words; anything else is level, competence, age or supervision.
  return allowed.reasons.some((reason) => reason.startsWith("Brak wymaganego sprzętu"))
    ? "equipment"
    : "preparation";
}

const ROTATING_ROLES: readonly Role[] = [
  "knee_strength",
  "hip_strength",
  "unilateral_strength",
  "knee_flexion",
];
function gymChoice(role: Role, variant: "A" | "B", p: Profile): string | undefined {
  const slot: GymExerciseSlot | undefined =
    role === "knee_strength"
      ? "squat"
      : role === "hip_strength" && variant === "B"
        ? "hinge"
        : role === "unilateral_strength"
          ? "unilateral"
          : role === "knee_flexion"
            ? "kneeFlexion"
            : role === "power"
              ? variant === "A"
                ? "powerA"
                : "powerB"
              : role === "upper_power"
                ? "upperPower"
                : role === "trunk"
                  ? "trunk"
                  : role === "pull" && variant === "B"
                    ? "pullB"
                    : role === "push" && variant === "A"
                      ? "pushA"
                      : role === "landing"
                        ? "landing"
                        : role === "calf_straight"
                          ? "calfA"
                          : undefined;
  const requested = slot && p.trainingMethodPreferences?.gymExercises?.[slot];
  return requested &&
    slot &&
    (GYM_EXERCISE_OPTIONS[slot].ids as readonly string[]).includes(requested)
    ? requested
    : undefined;
}
const DEVELOPMENT_ONLY = [
  "depth_jump",
  "drop_jump",
  "single_leg_drop_landing",
  "band_step_and_stick",
  "jump_shrug",
  "hang_power_snatch",
];
const availableInPhase = (id: string, phase: EngineSession["phase"]) =>
  !DEVELOPMENT_ONLY.includes(id) || phase === "development";
function pick(
  role: Role,
  p: Profile,
  variant: "A" | "B",
  used: Set<string>,
  rotation = 0,
  phase: EngineSession["phase"] = "development",
): string | undefined {
  let ids = [...CANDIDATES[role]];
  const tier = trainingTier(p);
  const preparedLoaded =
    ["intermediate", "advanced"].includes(p.gymExperienceLevel ?? "") &&
    hasValidStrengthMonths(p, 12) &&
    p.movementCompetence === "high";
  if (role === "knee_strength" && !preparedLoaded)
    ids = tier === "foundation" ? ["goblet_squat", "leg_press"] : ["goblet_squat", "leg_press"];
  if (role === "hip_strength" && !preparedLoaded) ids = ["romanian_deadlift_db", "hip_thrust"];
  if (role === "knee_flexion" && tier !== "performance")
    ids = [
      "seated_leg_curl",
      "bilateral_slider_leg_curl",
      "prone_band_leg_curl",
      "assisted_nordic_hamstring",
      "bridge_walkout",
    ];
  // A develops horizontal upper work; B complements it with vertical work where eligible.
  // A novice still uses the same supported, technically accessible alternatives.
  if (variant === "B" && tier !== "foundation" && role === "push")
    ids = ["dumbbell_overhead_press", ...ids];
  if (variant === "B" && tier !== "foundation" && role === "pull")
    ids = ["pull_up", "lat_pulldown", ...ids];
  if (variant === "A" && role === "hip_strength")
    ids = preparedLoaded
      ? ["barbell_romanian_deadlift", "hip_thrust", "romanian_deadlift_db"]
      : ["hip_thrust", ...ids];
  if (variant === "B" && role === "trunk") ids = ["side_plank", "plank", ...ids];
  if (role === "push" && tier === "foundation")
    ids = ids.filter((id) => id !== "barbell_bench_press");
  if (role === "upper_power" && p.goal === "agility")
    ids = ["medicine_ball_rotational_scoop_toss", ...ids];
  if (role === "power") {
    const ballistic = p.goal === "power" && hasVerifiedAdvancedStrength(p);
    const declared = p.equipment.map((value) => resolveEquipmentId(value) ?? value);
    // Loaded/throwing equipment must be explicitly declared, not inferred from hasGym.
    ids = ids.filter((id) => {
      const d = getExerciseDefinition(id)!;
      return (
        d.family !== "power" ||
        (ballistic && d.equipmentRequired.every((e) => declared.includes(e)))
      );
    });
    if (variant === "B") {
      const rotational = ids.filter((id) => id === "medicine_ball_rotational_scoop_toss");
      ids = [
        ...(p.trainingMethodPreferences?.strength === "M09" ? [] : rotational),
        ...(p.goal === "agility" ? ["lateral_bound_to_stick"] : []),
        "broad_jump",
        ...ids.filter((id) => id !== "medicine_ball_rotational_scoop_toss"),
      ];
    }
  }
  const requested = gymChoice(role, variant, p);
  if (
    requested &&
    !used.has(requested) &&
    availableInPhase(requested, phase) &&
    eligibleExercise(requested, p, role)
  )
    return requested;
  const eligible = ids.filter(
    (id) => !used.has(id) && availableInPhase(id, phase) && eligibleExercise(id, p, role),
  );
  // A new stimulus picks another equivalent, eligible exercise of the same group; never an ineligible one.
  return rotation > 0 && ROTATING_ROLES.includes(role) && eligible.length > 1
    ? eligible[rotation % eligible.length]
    : eligible[0];
}

export function estimateSeconds(e: ExerciseDecision, hasNext = false): number {
  const d = e.dose;
  const repSeconds = d.tempo
    ? d.tempo.eccentricSeconds + d.tempo.pauseSeconds + d.tempo.concentricSeconds
    : d.intent === "explosive"
      ? 3
      : 4;
  // A hold counted in repetitions: each hold plus one second of relaxing before the next
  // (the coach's “1 s hard, 1 s easy”).
  const work = d.holdReps
    ? d.holdReps * ((d.seconds ?? 1) + 1)
    : (d.seconds ?? (d.distanceM ? 8 * (d.reps ?? 1) : (d.reps ?? 1) * repSeconds));
  // Sets done with a partner rest the short transition; sets done alone rest the round rest.
  const paired = Math.min(d.pairedSets ?? d.sets, d.sets);
  const between =
    Math.min(paired, Math.max(0, d.sets - 1)) * d.restSeconds +
    Math.max(0, d.sets - 1 - paired) * (d.soloRestSeconds ?? d.restSeconds);
  return (
    d.sets * work * (d.perSide ? 2 : 1) +
    d.sets *
      Math.max(0, (d.cluster?.repGroups.length ?? 1) - 1) *
      (d.cluster?.intraRestSeconds ?? 0) +
    between +
    (d.postRestSeconds ?? (hasNext ? d.restSeconds : 0)) +
    45
  );
}

/** Execution chronology: the final ordinary rest is only needed before a next row. */
export function estimateSessionSeconds(exercises: readonly ExerciseDecision[]): number {
  return exercises.reduce(
    (total, e, index) => total + estimateSeconds(e, index < exercises.length - 1),
    0,
  );
}

/** Stable A/B exercise identities; phase changes dose, not random exercise rotations. */
export function buildStrength(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
): EngineSession {
  return isAthleticStrengthSelected(p)
    ? buildAthleticStrength(p, variant, phase, rotation)
    : buildStrengthBase(p, variant, phase, rotation);
}

export function buildAthleticStrength(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
): EngineSession {
  if (!p.hasGym) return buildStrengthBase(p, variant, phase, rotation);
  const recipe = applyAthleticStrengthLayout(buildStrengthBase(p, variant, phase, rotation, true));
  recipe.minutes =
    Math.ceil(estimateSessionSeconds(recipe.exercises) / 60) + strengthPreparationOverhead(recipe);
  return recipe;
}

function buildStrengthBase(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
  rotation = 0,
  athletic = false,
): EngineSession {
  const preparation = preparationProfile(p),
    tier = preparation.tier,
    deload =
      phase === "deload" ||
      p.seasonPhase === "transition" ||
      p.goal === "return" ||
      p.secondaryLimiter === "fatigue",
    used = new Set<string>();
  const exercises: ExerciseDecision[] = [],
    missing: Role[] = [];
  const fullPreparedSession = p.hasGym && tier !== "foundation" && !deload && phase !== "peak";
  const fullSession = p.hasGym && !deload && phase !== "peak";
  // Stable work in weeks 1–3 allows two genuinely comparable exposures before load advice.
  const sets = deload ? (tier === "foundation" ? 1 : 2) : tier === "foundation" ? 2 : 3;
  const add = (role: Role, dose: Dose) => {
    const preferred =
      role === "power"
        ? athletic
          ? athleticPowerCandidates(p, variant, phase)
          : gymPowerCandidates(p, variant, phase)
        : role === "hamstring_dynamic_support"
          ? athletic
            ? athleticHamstringSupportCandidates(p, phase)
            : gymHamstringSupportCandidates(p, phase)
          : [];
    const legacy =
      role === "hamstring_dynamic_support"
        ? undefined
        : pick(role, p, variant, used, rotation, phase);
    const preferredId = preferred
      .filter((id) => athletic || id !== "gym_cmj")
      .find((candidate) => !used.has(candidate) && eligibleExercise(candidate, p, role));
    const legacyGymPower =
      legacy &&
      getExerciseDefinition(legacy)?.family === "power" &&
      (getExerciseDefinition(legacy)?.spaceRequirement !== "open_field" || p.hasPitch)
        ? legacy
        : undefined;
    const requested = gymChoice(role, variant, p);
    const id =
      (requested === legacy ? legacy : undefined) ??
      preferredId ??
      (role === "power" && p.hasGym
        ? (legacyGymPower ?? (eligibleExercise("gym_cmj", p) ? "gym_cmj" : undefined))
        : legacy);
    if (!id) {
      missing.push(role);
      return;
    }
    used.add(id);
    if (role === "power" && id.startsWith("gym_")) dose = gymPowerDose(id, p, phase);
    if (role === "hamstring_dynamic_support") dose = gymHamstringSupportDose(id, phase);
    if (
      ["knee_strength", "hip_strength"].includes(role) &&
      tier !== "foundation" &&
      !["external", "axial"].includes(getExerciseDefinition(id)!.loadingType)
    )
      dose = { ...dose, reps: deload ? 6 : 8, rir: deload ? 4 : 3, restSeconds: 90 };
    if (role === "knee_flexion") {
      dose = controlledKneeFlexionDose(id, dose.sets, tier);
      if (deload) dose = { ...dose, rir: 4 };
    }
    if (FUNCTIONAL_CATALOGUE[id]?.unilateral) dose = { ...dose, perSide: true };
    if (id.endsWith("_30")) dose = { ...dose, jointAngleDegrees: 30 };
    if (id.endsWith("_90")) dose = { ...dose, jointAngleDegrees: 90 };
    if (
      [
        "soleus_iso_hold",
        "standing_calf_iso_hold",
        "copenhagen_plank",
        "plank",
        "side_plank",
      ].includes(id)
    )
      dose = {
        ...dose,
        reps: undefined,
        seconds: deload ? 12 : 20,
        rir: undefined,
        intent: "hold",
      };
    if (id === "suitcase_carry")
      dose = {
        sets: dose.sets,
        seconds: 20,
        perSide: true,
        restSeconds: dose.restSeconds,
        intent: "controlled",
      };
    if (id === "tempo_back_squat")
      dose.tempo = { eccentricSeconds: 3, pauseSeconds: 1, concentricSeconds: 1 };
    if (id === "box_squat")
      dose.tempo = { eccentricSeconds: 2, pauseSeconds: 1, concentricSeconds: 1 };
    if (id === "dead_stop_pin_squat")
      dose.tempo = { eccentricSeconds: 2, pauseSeconds: 2, concentricSeconds: 1 };
    if (id === "bilateral_pogo")
      dose = {
        sets: deload ? 1 : 2,
        reps: deload ? 6 : 10,
        restSeconds: 120,
        contactsPerRep: 1,
        intent: "explosive",
      };
    if (["depth_jump", "drop_jump"].includes(id))
      dose = { sets: 3, reps: 3, restSeconds: 180, contactsPerRep: 2, intent: "explosive" };
    if (["jump_shrug", "hang_power_snatch"].includes(id))
      dose = {
        sets: 3,
        reps: 3,
        restSeconds: 180,
        ...(id === "jump_shrug" ? { contactsPerRep: 1 } : {}),
        intent: "explosive",
      };
    if (id === "fast_band_row") dose = { sets: 2, reps: 6, restSeconds: 90, intent: "explosive" };
    exercises.push({
      exerciseId: id,
      role,
      dose,
      reason: `Cel ćwiczenia: ${ROLE_NAMES[role]}.${requested && requested !== id ? " Wybrany wariant nie spełnia warunków sprzętu, przygotowania lub fazy; użyto dostępnego ćwiczenia tej funkcji." : ""}${
        ["knee_strength", "hip_strength"].includes(role) &&
        !["external", "axial"].includes(getExerciseDefinition(id)!.loadingType)
          ? " Wariant z masą ciała: kontrolowane powtórzenia i zachowanie zapasu."
          : ""
      }${
        ["knee_strength", "hip_strength"].includes(role)
          ? " Zachowaj ćwiczenie i dawkę; ciężar dobieraj do zapasu i porównywalnych wykonanych serii. Sam kolejny tydzień nie wymusza podwyżki."
          : ""
      }`,
    });
  };
  // Preparation and work can use the same movement in distinct occurrences.
  // Only work rows occupy `used`, so a bodyweight warm-up never removes the main lift.
  exercises.push(...buildStrengthPreparation((id) => eligibleExercise(id, p, "warmup")));
  if (coachedPrimerEligible(p, phase)) add("iso_primer", coachedPrimerDose());
  else if (
    p.trainingMethodPreferences?.strength === "M14" &&
    p.trainingMethodPreferences.coachedIsometricPrimer === true
  )
    missing.push("iso_primer");
  const powerRole =
    (tier === "foundation" && (!p.movementCompetence || p.movementCompetence === "low")) ||
    !(
      gymPowerCandidates(p, variant, phase).some((id) => eligibleExercise(id, p)) ||
      pick("power", p, variant, used)
    )
      ? "landing"
      : "power";
  add(powerRole, {
    sets: deload ? 2 : 3,
    reps: 3,
    restSeconds: powerRole === "power" && tier !== "foundation" ? 120 : 90,
    intent: powerRole === "landing" ? "controlled" : "explosive",
  });
  if (
    variant === "B" &&
    fullPreparedSession &&
    (gymChoice("upper_power", variant, p) ||
      CANDIDATES.upper_power.some((id) => eligibleExercise(id, p, "upper_power")))
  )
    add("upper_power", { sets: 3, reps: 3, restSeconds: 90, intent: "explosive" });
  if (
    p.hasGym &&
    ((variant === "B" && (resolveGymBraking(p) || gymChoice("landing", variant, p))) ||
      (athletic && variant === "A")) &&
    powerRole === "power" &&
    eligibleExercise("gym_step_brake", p)
  ) {
    const requested = gymChoice("landing", variant, p);
    const landingId =
      requested && availableInPhase(requested, phase) && eligibleExercise(requested, p, "landing")
        ? requested
        : "gym_step_brake";
    exercises.push({
      exerciseId: landingId,
      role: "landing",
      dose:
        landingId === "gym_step_brake"
          ? { sets: 1, reps: 2, perSide: true, restSeconds: 45, intent: "controlled" }
          : {
              sets: 2,
              reps: 3,
              perSide: FUNCTIONAL_CATALOGUE[landingId]?.unilateral || undefined,
              restSeconds: 90,
              intent: "controlled",
            },
      reason:
        getExerciseDefinition(landingId)?.objective ??
        "Kontrola przyjęcia obciążenia na siłowni; bez sprintu.",
    });
  }
  add(variant === "A" ? "knee_strength" : "hip_strength", {
    sets,
    reps: tier === "performance" && !preparation.provisional ? 4 : 6,
    rir: deload || tier === "foundation" ? 4 : preparation.provisional ? 3 : 2,
    restSeconds: tier === "performance" && !preparation.provisional ? 180 : 120,
    intent: "controlled",
  });
  // A loaded knee-dominant pattern must exist; without a squat variant a loaded split squat
  // covers it (and the reverse in B), never a trivial bodyweight movement.
  const coverKneePattern = (dose: Dose) => {
    if (exercises.some((e) => e.role === "knee_strength" || e.role === "unilateral_strength"))
      return;
    const before = missing.length;
    const role = variant === "A" ? "unilateral_strength" : "knee_strength";
    add(role, role === "unilateral_strength" ? { ...dose, perSide: true } : dose);
    if (exercises.some((e) => e.role === role)) {
      missing.splice(before);
      for (let i = missing.length - 1; i >= 0; i--)
        if (missing[i] === "knee_strength" || missing[i] === "unilateral_strength")
          missing.splice(i, 1);
    } else missing.splice(before);
  };
  if (variant === "A") {
    coverKneePattern({
      sets,
      reps: 6,
      rir: tier === "foundation" ? 4 : 3,
      restSeconds: 120,
      intent: "controlled",
    });
    if (fullPreparedSession && !athletic)
      add("hip_strength", { sets: 2, reps: 8, rir: 3, restSeconds: 120, intent: "controlled" });
    add("knee_flexion", {
      sets: deload ? 1 : 2,
      reps: tier === "performance" ? 4 : 6,
      rir: 3,
      restSeconds: 120,
      intent: "controlled",
    });
    if (
      athletic &&
      athleticHamstringSupportCandidates(p, phase).some((id) =>
        eligibleExercise(id, p, "hamstring_dynamic_support"),
      )
    )
      add("hamstring_dynamic_support", {
        sets: 2,
        seconds: 8,
        restSeconds: 60,
        intent: "controlled",
      });
    // The full A combines a squat, knee flexion and a moderate hip-extension accessory.
    // B retains its hinge + unilateral emphasis; neither is a hamstring-only workout.
    if (!exercises.some((e) => e.role === "knee_flexion" || e.role === "hip_strength"))
      add("hip_strength", {
        sets: deload ? 1 : 2,
        reps: 8,
        rir: deload ? 4 : 3,
        restSeconds: 90,
        intent: "controlled",
      });
  } else {
    add("unilateral_strength", {
      sets: deload ? 1 : tier === "performance" ? 3 : 2,
      reps: 5,
      perSide: true,
      rir: 3,
      restSeconds: tier === "performance" ? 120 : 90,
      intent: "controlled",
    });
    coverKneePattern({
      sets: deload ? 1 : 2,
      reps: 8,
      rir: 3,
      restSeconds: 90,
      intent: "controlled",
    });
    if (!athletic && gymHamstringSupportCandidates(p, phase).some((id) => eligibleExercise(id, p)))
      add("hamstring_dynamic_support", {
        sets: 2,
        seconds: 8,
        restSeconds: 60,
        intent: "controlled",
      });
    else
      add("hamstring_iso", { sets: deload ? 1 : 2, seconds: 15, restSeconds: 60, intent: "hold" });
  }
  add(variant === "A" ? "push" : "pull", {
    sets: deload ? 1 : 2,
    reps: 8,
    rir: 3,
    restSeconds: 75,
    intent: "controlled",
  });
  // A fuller prepared-athlete session covers both upper-body directions.
  // General football level still never unlocks technical loaded lifts.
  const upperFinale = fullSession;
  if (upperFinale)
    add(variant === "A" ? "pull" : "push", {
      sets: 2,
      reps: 8,
      rir: 3,
      restSeconds: 75,
      intent: "controlled",
    });
  if (variant === "A")
    add("adductor", { sets: deload ? 1 : 2, seconds: 15, restSeconds: 60, intent: "hold" });
  else
    add("trunk", { sets: deload ? 1 : 2, reps: 8, rir: 3, restSeconds: 60, intent: "controlled" });
  if (fullSession) {
    if (variant === "A")
      add("trunk", { sets: 2, reps: 8, rir: 3, restSeconds: 60, intent: "controlled" });
    else add("adductor", { sets: 2, seconds: 15, restSeconds: 60, intent: "hold" });
  }
  if (variant === "A" && p.trainingMethodPreferences?.strength === "M13")
    add("quad_iso", quadricepsHoldingDose(deload));
  add(variant === "A" ? "calf_straight" : "calf_bent", {
    sets: deload ? 1 : 2,
    reps: 10,
    restSeconds: 60,
    intent: "controlled",
  });
  // One moderate upper pair at the end, not additional lower-body volume.
  if (upperFinale && (tier === "foundation" || p.age < 18)) {
    const upper = exercises.filter((e) => e.role === "push" || e.role === "pull");
    for (const e of upper) {
      e.dose.sets = 2;
      e.dose.reps = 10;
      e.dose.rir = 3;
    }
    const rest = exercises.filter((e) => e.role !== "push" && e.role !== "pull");
    exercises.splice(0, exercises.length, ...rest, ...upper);
  }
  // Holding belongs to preparation, before power or strength, not a late accessory.
  const holdingIndex = exercises.findIndex((e) => e.role === "quad_iso");
  if (holdingIndex >= 0) {
    const [holding] = exercises.splice(holdingIndex, 1);
    exercises.splice(1, 0, holding);
  }
  let organization: EngineSession["organization"] =
    powerRole === "power" ? "power_first" : "straight";
  const primary = exercises.find(
    (e) => e.role === (variant === "A" ? "knee_strength" : "hip_strength"),
  );
  const power = exercises.find((e) => e.role === "power");
  const primaryDefinition = primary ? getExerciseDefinition(primary.exerciseId) : undefined;
  if (
    primary &&
    primaryDefinition &&
    clusterEligible(p, phase) &&
    ["external", "axial"].includes(primaryDefinition.loadingType)
  ) {
    const reps = primary.dose.reps!;
    primary.dose = {
      ...primary.dose,
      cluster: {
        repGroups: reps === 4 ? [2, 2] : [2, 2, 2],
        intraRestSeconds: 20,
      },
    };
    primary.reason += ` ${CLUSTER_INSTRUCTION}`;
  }
  if (
    p.trainingMethodPreferences?.strength === "M09" &&
    hasVerifiedAdvancedStrength(p) &&
    !p.painInjury &&
    p.seasonPhase !== "return_injury" &&
    !deload &&
    phase !== "adaptation" &&
    primary &&
    power &&
    primaryDefinition &&
    ["external", "axial"].includes(primaryDefinition.loadingType) &&
    FUNCTIONAL_CATALOGUE[power.exerciseId]?.actions.includes("jump")
  ) {
    organization = "contrast";
    const pairSets = Math.min(primary.dose.sets, power.dose.sets);
    primary.dose = { ...primary.dose, sets: pairSets, restSeconds: 30 };
    power.dose = { ...power.dose, sets: pairSets, restSeconds: 180, postRestSeconds: 180 };
    const primaryIndex = exercises.indexOf(primary),
      powerIndex = exercises.indexOf(power);
    if (primaryIndex > powerIndex) {
      exercises.splice(primaryIndex, 1);
      exercises.splice(powerIndex, 0, primary);
    }
  }
  const recipe = arrangeStrengthPairs(
    {
      variant: "full",
      strengthPreparationVersion: 1,
      roles: [variant === "A" ? "strengthA" : "strengthB"],
      tier,
      phase,
      organization,
      // Heavy lower only when a main leg pattern is actually in the session.
      highLower:
        tier !== "foundation" &&
        exercises.some((e) =>
          ["knee_strength", "hip_strength", "unilateral_strength", "iso_primer"].includes(e.role),
        ),
      exercises,
      missing,
      sprintMetres: 0,
      plyometricContacts: strengthLandingCount(exercises),
      minutes: Math.ceil(estimateSessionSeconds(exercises) / 60),
    },
    upperFinale && !athletic,
  );
  recipe.minutes =
    Math.ceil(estimateSessionSeconds(recipe.exercises) / 60) + strengthPreparationOverhead(recipe);
  if (rotation > 0) recipe.exerciseRotation = rotation;
  return recipe;
}

/** Trim the least important support first. A one-minute overrun must not turn all
 * accessories into one-set work. Main work, warm-up and ordinary recovery survive. */
export function fitStrengthToBudget(recipe: EngineSession, budget: number): EngineSession {
  if (recipe.strengthStructure === "athletic_ab")
    return fitAthleticStrengthToBudget(recipe, budget, estimateSessionSeconds);
  if (recipe.minutes <= budget) return recipe;
  let compact = structuredClone(recipe);
  const a = recipe.roles.includes("strengthA");
  const primaryRole = a ? "knee_strength" : "hip_strength";
  const minutes = () =>
    Math.ceil(estimateSessionSeconds(compact.exercises) / 60) +
    strengthPreparationOverhead(compact);
  const finish = () => {
    compact.minutes = minutes();
    compact.plyometricContacts = strengthLandingCount(compact.exercises);
    return compact;
  };
  const drop = (roles: readonly Role[]) => {
    compact.exercises = compact.exercises.filter((e) => !roles.includes(e.role));
  };
  // A free-standing throw is an optional addition, not a reason to erase the
  // basic leg/upper tasks. An explicit linked contrast is removed as a whole.
  if (!compact.upperContrast) drop(["upper_power"]);
  if (minutes() <= budget) return finish();
  // Optional lower support can go without changing the main dose or breaking a pair.
  if (a && compact.exercises.some((e) => e.role === "knee_flexion")) drop(["hip_strength"]);
  if (!a) drop(["hamstring_iso", "hamstring_dynamic_support"]);
  if (minutes() <= budget) return finish();
  if (compact.upperContrast) {
    compact = withoutUpperContrast(
      compact,
      "Zwykłe wyciskanie: dostępny czas nie pozwala zachować pełnego opcjonalnego kontrastu i jego przerw.",
    );
    if (minutes() <= budget) return finish();
  }

  // A shorter session uses ordinary accessory sets. Restore their full standalone
  // rests; 30 s was a transition to a partner, never the prescribed recovery alone.
  compact.variant = "compact";
  compact.organization = "straight";
  for (const e of compact.exercises) {
    const paired = compact.strengthPairs?.some((pair) => pair.roles.includes(e.role));
    if (paired) {
      e.dose.restSeconds = ["push", "pull"].includes(e.role) ? 75 : 60;
      delete e.dose.postRestSeconds;
    }
    removeClusterProtocol(e);
    e.reason += " Krótszy wariant: zachowaj pełne przerwy i zapisany zapas.";
  }
  delete compact.strengthPairs;
  // An explicitly selected contrast becomes independent power followed by strength.
  if (recipe.organization === "contrast") {
    const primary = compact.exercises.find((e) => e.role === primaryRole);
    const powerIndex = compact.exercises.findIndex((e) => e.role === "power");
    if (primary) primary.dose.restSeconds = Math.max(180, primary.dose.restSeconds);
    if (primary && powerIndex >= 0) {
      const [power] = compact.exercises.splice(powerIndex, 1);
      compact.exercises.splice(
        compact.exercises.findIndex((e) => e.role === primaryRole),
        0,
        power,
      );
    }
  }
  drop(["iso_primer", "quad_iso"]);
  if (minutes() <= budget) return finish();
  // Keep two working sets of accessories where possible, rather than spreading
  // one set across every exercise. Never add sets merely to fill a time limit.
  for (const roles of [
    ["calf_straight", "calf_bent"],
    ["adductor", "trunk"],
    ["power", "landing"],
    [a ? "pull" : "push"],
  ] as Role[][]) {
    drop(roles);
    if (minutes() <= budget) return finish();
  }
  const primary = compact.exercises.find((e) => e.role === primaryRole);
  if (primary) primary.dose.sets = Math.min(2, primary.dose.sets);
  if (minutes() <= budget) return finish();
  for (const e of compact.exercises)
    if (e.role !== "warmup" && e !== primary) e.dose.sets = Math.min(2, e.dose.sets);
  // If even the minimum does not fit, the scheduler reports an unmet target.
  // It never lies about duration or cuts warm-up/recovery to make it fit.
  return finish();
}

function resolveGymBraking(p: Profile): boolean {
  return p.goal === "agility" || p.secondaryLimiter === "cod";
}

export function buildRunning(
  p: Profile,
  role: "speed" | "endurance",
  phase: EngineSession["phase"],
  sprint: SprintSessionContext = {},
): EngineSession | null {
  if (role === "speed")
    return buildSprintSession(p, phase, (id) => eligibleExercise(id, p), sprint);
  const id = pick("endurance", p, "A", new Set());
  if (!id) return null;
  const tier = trainingTier(p);
  const seconds = (phase === "deload" ? 15 : tier === "foundation" ? 20 : 25) * 60;
  return {
    roles: ["endurance"],
    tier,
    phase,
    highLower: false,
    missing: [],
    exercises: [
      {
        exerciseId: id,
        role: "endurance",
        dose: {
          sets: 1,
          seconds,
          restSeconds: 0,
          intent: "easy",
        },
        reason: "Tempo konwersacyjne; bez zgadywania MAS i tempa z GPS.",
      },
    ],
    minutes: seconds / 60 + 10,
    sprintMetres: 0,
  };
}
