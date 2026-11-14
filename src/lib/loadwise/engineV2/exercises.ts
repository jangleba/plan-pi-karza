import { buildSprintSession } from "./sprintSession";
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
import { hasVerifiedAdvancedStrength, preparationProfile } from "./preparation";
import {
  coachedPrimerDose,
  coachedPrimerEligible,
  controlledKneeFlexionDose,
  quadricepsHoldingDose,
  clusterEligible,
} from "./strengthProtocols";

/** Roles describe function, independently of the legacy family/hinge labels. */
export const CANDIDATES: Record<Role, readonly string[]> = {
  knee_strength: [
    "heavy_back_squat",
    "front_squat",
    "leg_press",
    "goblet_squat",
    "bodyweight_squat",
  ],
  hip_strength: [
    "trap_bar_deadlift",
    "barbell_deadlift",
    "barbell_romanian_deadlift",
    "romanian_deadlift_db",
    "hip_thrust",
    "glute_bridge",
  ],
  unilateral_strength: [
    "bulgarian_split_squat",
    "step_up",
    "reverse_lunge",
    "bodyweight_split_squat",
  ],
  knee_flexion: [
    "full_nordic_hamstring",
    "eccentric_nordic_hamstring",
    "assisted_nordic_hamstring",
    "seated_leg_curl",
    "lying_leg_curl",
    "bilateral_slider_leg_curl",
    "prone_band_leg_curl",
  ],
  hamstring_iso: [
    "long_lever_hamstring_iso",
    "heel_dig_hamstring_iso_30",
    "heel_dig_hamstring_iso_90",
  ],
  quad_iso: ["split_squat_iso_hold"],
  iso_primer: ["overcoming_pin_squat_primer"],
  adductor: ["copenhagen_plank", "adductor_bridge_squeeze"],
  calf_straight: ["standing_calf_raise"],
  calf_bent: ["seated_soleus_raise", "soleus_iso_hold"],
  push: ["dumbbell_bench_press", "push_up", "incline_push_up"],
  pull: ["one_arm_dumbbell_row", "lat_pulldown", "bodyweight_row", "face_pull_band"],
  trunk: ["pallof_press", "dead_bug", "plank"],
  power: [
    "dumbbell_jump_squat",
    "trap_bar_jump",
    "medicine_ball_rotational_scoop_toss",
    "countermovement_jump",
    "broad_jump",
    "squat_jump",
  ],
  landing: ["snap_down", "drop_landing"],
  speed: ["free_acceleration_sprint"],
  endurance: ["easy_aerobic_run"],
  warmup: ["hip_mobility_flow", "a_march", "bodyweight_squat", "glute_bridge"],
  mobility: [],
  breathing: [],
  ball_skill: [],
};

export function eligibleExercise(id: string, p: Profile): boolean {
  const d = getExerciseDefinition(id);
  const equipment = [
    ...new Set([...p.equipment, ...(p.trainingMethodPreferences?.declaredEquipment ?? [])]),
  ];
  return (
    !!d &&
    d.approved !== false &&
    !d.draft &&
    (d.spaceRequirement !== "indoor_gym" || p.hasGym) &&
    d.equipmentRequired
      .filter((e) =>
        [
          "trap_bar",
          "nordic_setup",
          "machine",
          "fixed_pins",
          "sliders",
          "med_ball",
          "sled",
        ].includes(e),
      )
      .every((e) => equipment.some((value) => (resolveEquipmentId(value) ?? value) === e)) &&
    isExerciseAllowedForProfile(d, buildAthleteTrainingProfile({ ...p, equipment })).ok
  );
}

function pick(role: Role, p: Profile, variant: "A" | "B", used: Set<string>): string | undefined {
  let ids = [...CANDIDATES[role]];
  const tier = trainingTier(p);
  if (role === "knee_strength" && tier !== "performance")
    ids =
      tier === "foundation"
        ? ["goblet_squat", "bodyweight_squat", "leg_press"]
        : ["goblet_squat", "leg_press", "bodyweight_squat"];
  if (role === "hip_strength" && tier !== "performance")
    ids = ["romanian_deadlift_db", "glute_bridge", "hip_thrust"];
  if (role === "knee_flexion" && tier !== "performance")
    ids = [
      "seated_leg_curl",
      "bilateral_slider_leg_curl",
      "prone_band_leg_curl",
      "assisted_nordic_hamstring",
    ];
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
  return ids.find((id) => !used.has(id) && eligibleExercise(id, p));
}

export function estimateSeconds(e: ExerciseDecision, hasNext = false): number {
  const d = e.dose;
  const work = d.seconds ?? (d.distanceM ? 8 : (d.reps ?? 1) * (d.intent === "explosive" ? 3 : 4));
  return (
    d.sets * work * (d.perSide ? 2 : 1) +
    d.sets *
      Math.max(0, (d.cluster?.repGroups.length ?? 1) - 1) *
      (d.cluster?.intraRestSeconds ?? 0) +
    Math.max(0, d.sets - 1) * d.restSeconds +
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
  // Stable work in weeks 1–3 allows two genuinely comparable exposures before load advice.
  const sets = deload ? (tier === "foundation" ? 1 : 2) : tier === "foundation" ? 2 : 3;
  const add = (role: Role, dose: Dose) => {
    const id = pick(role, p, variant, used);
    if (!id) {
      missing.push(role);
      return;
    }
    used.add(id);
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
    if (id === "soleus_iso_hold" || id === "copenhagen_plank" || id === "plank")
      dose = {
        ...dose,
        reps: undefined,
        seconds: deload ? 12 : 20,
        rir: undefined,
        intent: "hold",
      };
    exercises.push({
      exerciseId: id,
      role,
      dose,
      reason: `Cel ćwiczenia: ${ROLE_NAMES[role]}.${
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
  add("warmup", { sets: 1, seconds: 60, perSide: true, restSeconds: 0, intent: "easy" });
  if (coachedPrimerEligible(p, phase)) add("iso_primer", coachedPrimerDose());
  else if (
    p.trainingMethodPreferences?.strength === "M14" &&
    p.trainingMethodPreferences.coachedIsometricPrimer === true
  )
    missing.push("iso_primer");
  const powerRole =
    (tier === "foundation" && (!p.movementCompetence || p.movementCompetence === "low")) ||
    !pick("power", p, variant, used)
      ? "landing"
      : "power";
  add(powerRole, {
    sets: deload ? 2 : 3,
    reps: 3,
    restSeconds: powerRole === "power" && tier !== "foundation" ? 120 : 90,
    intent: powerRole === "landing" ? "controlled" : "explosive",
  });
  add(variant === "A" ? "knee_strength" : "hip_strength", {
    sets,
    reps: tier === "performance" && !preparation.provisional ? 4 : 6,
    rir: deload || tier === "foundation" ? 4 : preparation.provisional ? 3 : 2,
    restSeconds: tier === "performance" && !preparation.provisional ? 180 : 120,
    intent: "controlled",
  });
  if (variant === "A") {
    add("knee_flexion", {
      sets: deload ? 1 : 2,
      reps: tier === "performance" ? 4 : 6,
      rir: 3,
      restSeconds: 120,
      intent: "controlled",
    });
    if (!exercises.some((e) => e.role === "knee_flexion"))
      add("hip_strength", {
        sets: deload ? 1 : 2,
        reps: 8,
        rir: deload ? 4 : 3,
        restSeconds: 90,
        intent: "controlled",
      });
  } else {
    add("unilateral_strength", {
      sets: deload ? 1 : 2,
      reps: 5,
      perSide: true,
      rir: 3,
      restSeconds: 90,
      intent: "controlled",
    });
    add("hamstring_iso", { sets: deload ? 1 : 2, seconds: 15, restSeconds: 60, intent: "hold" });
  }
  add(variant === "A" ? "push" : "pull", {
    sets: deload ? 1 : 2,
    reps: 8,
    rir: 3,
    restSeconds: 75,
    intent: "controlled",
  });
  if (variant === "A")
    add("adductor", { sets: deload ? 1 : 2, seconds: 15, restSeconds: 60, intent: "hold" });
  else
    add("trunk", { sets: deload ? 1 : 2, reps: 8, rir: 3, restSeconds: 60, intent: "controlled" });
  if (variant === "A" && p.trainingMethodPreferences?.strength === "M13")
    add("quad_iso", quadricepsHoldingDose(deload));
  add(variant === "A" ? "calf_straight" : "calf_bent", {
    sets: deload ? 1 : 2,
    reps: 10,
    restSeconds: 60,
    intent: "controlled",
  });
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
    primary.reason +=
      " Klaster: 20 s między grupami po 2 powtórzenia. Łączna liczba powtórzeń i zwykła przerwa między seriami pozostają zapisane osobno; nie dodawaj ciężaru za samą zmianę metody.";
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
    primary.dose = { ...primary.dose, sets: pairSets, restSeconds: 180 };
    power.dose = { ...power.dose, sets: pairSets, restSeconds: 180 };
    const primaryIndex = exercises.indexOf(primary),
      powerIndex = exercises.indexOf(power);
    if (primaryIndex > powerIndex) {
      exercises.splice(primaryIndex, 1);
      exercises.splice(powerIndex, 0, primary);
    }
  }
  return {
    variant: "full",
    roles: [variant === "A" ? "strengthA" : "strengthB"],
    tier,
    phase,
    organization,
    highLower: tier !== "foundation",
    exercises,
    missing,
    sprintMetres: 0,
    minutes: Math.ceil(estimateSessionSeconds(exercises) / 60) + 8,
  };
}

/** Keep front/back legs and one upper-body task. Never shorten rests or erase
 * warm-up to pretend a complete session fits a small time budget. */
export function fitStrengthToBudget(recipe: EngineSession, budget: number): EngineSession {
  if (recipe.minutes <= budget) return recipe;
  const essential = recipe.roles.includes("strengthA")
    ? ["warmup", "knee_strength", "knee_flexion", "hip_strength", "push"]
    : ["warmup", "hip_strength", "unilateral_strength", "pull"];
  const compact = structuredClone(recipe);
  compact.variant = "compact";
  compact.organization = "straight";
  const primary = (role: string) => role === "knee_strength" || role === "hip_strength";
  compact.exercises = compact.exercises
    .filter((e) => essential.includes(e.role))
    .map((e) => ({
      ...e,
      dose: {
        ...e.dose,
        cluster: undefined,
        sets: e.role === "warmup" ? 1 : primary(e.role) ? Math.min(2, e.dose.sets) : 1,
      },
      reason: `Cel ćwiczenia: ${ROLE_NAMES[e.role]}. Krótszy wariant: zwykłe serie, podstawowe zadania i pełne przerwy. Nie jest to wykonanie metody specjalistycznej.`,
    }));
  const extras = recipe.exercises.filter(
    (e) => !essential.includes(e.role) && e.role !== "iso_primer",
  );
  const minutes = () => Math.ceil(estimateSessionSeconds(compact.exercises) / 60) + 8;
  compact.minutes = minutes();
  for (const e of extras) {
    const index = e.role === "power" || e.role === "landing" ? 1 : compact.exercises.length;
    compact.exercises.splice(index, 0, { ...e, dose: { ...e.dose, sets: 1 } });
    if (minutes() > budget) compact.exercises.splice(index, 1);
  }
  compact.minutes = minutes();
  return compact;
}

export function buildRunning(
  p: Profile,
  role: "speed" | "endurance",
  phase: EngineSession["phase"],
): EngineSession | null {
  if (role === "speed") return buildSprintSession(p, phase, (id) => eligibleExercise(id, p));
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
