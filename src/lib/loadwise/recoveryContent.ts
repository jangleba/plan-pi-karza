import { getExerciseDefinition } from "./exerciseLibrary";
import { preparationMoveFor } from "./preparation/protocols";
import type { ExerciseItem } from "./types";

/**
 * Concrete recovery, mobility and cool-down content.
 *
 * Every item names one movement from the exercise library with a dose the
 * athlete can follow (sets, seconds, sides). Generic placeholders such as
 * "Mobilność całego ciała 10 min" or "Rozciąganie 5 min" leave the athlete
 * guessing what to do, so the builders below are the single source for this
 * kind of work.
 */

function item(exerciseId: string, prescription: string, cue?: string): ExerciseItem {
  const definition = getExerciseDefinition(exerciseId);
  if (!definition) throw new Error(`Unknown recovery exercise: ${exerciseId}`);
  // Same anatomy, setup and dose reasoning as the guided timer, so the list
  // view and the timer explain the movement identically.
  const guide = preparationMoveFor({ exerciseId });
  return {
    exerciseId,
    visualId: exerciseId,
    name: definition.displayNamePl,
    prescription,
    ...(cue ? { cue } : {}),
    ...(guide
      ? {
          purpose: `${guide.anatomy} ${guide.doseReason}`,
          technique: guide.setup,
        }
      : {}),
  };
}

const HOLD = "Łagodne rozciąganie, bez bólu i bez sprężynowania.";

/** Short walk-down after running: the session's run already ended easy. */
export function runningCooldown(): ExerciseItem[] {
  return [
    item("sprint_cooldown_walk", "3 min spokojnego marszu", "Wyrównaj oddech, rozluźnij barki."),
    item("calf_wall_stretch", "2 × 30 s / strona", HOLD),
    item("half_kneeling_hip_flexor_stretch", "2 × 30 s / strona", "Napnij pośladek nogi z tyłu."),
    item("half_kneeling_hamstring_stretch", "2 × 30 s / strona", "Plecy proste, biodra w tył."),
  ];
}

/** Cool-down for field, ball and mixed sessions. */
export function generalCooldown(): ExerciseItem[] {
  return [
    item("sprint_cooldown_walk", "3 min spokojnego marszu", "Wyrównaj oddech."),
    item("standing_quad_stretch", "2 × 30 s / strona", HOLD),
    item("half_kneeling_hip_flexor_stretch", "2 × 30 s / strona", "Napnij pośladek nogi z tyłu."),
    item("half_kneeling_hamstring_stretch", "2 × 30 s / strona", "Plecy proste, biodra w tył."),
  ];
}

/** Short cool-down after a gym session (about 6–7 min with side switches). */
export function gymCooldown(): ExerciseItem[] {
  return [
    item("half_kneeling_hip_flexor_stretch", "2 × 30 s / strona", "Napnij pośladek nogi z tyłu."),
    item("half_kneeling_hamstring_stretch", "2 × 30 s / strona", "Plecy proste, biodra w tył."),
    item("calf_wall_stretch", "2 × 30 s / strona", HOLD),
  ];
}

/** Dynamic preparation before an easy or tempo run, without a separate jog. */
export function runningPreparation(): ExerciseItem[] {
  return [
    item("ankle_rock_forward", "1 × 8 / strona", "Pięta zostaje na podłożu."),
    item("adductor_rockback", "1 × 6 / strona", "Cofaj biodra bez zaokrąglania pleców."),
    item("a_march", "2 × 10 m", "Wysokie kolano, stopa pod biodrem."),
  ];
}

/** Joint-by-joint mobility circuit used in recovery and mobility sessions. */
export function mobilityCircuit(sets = 2): ExerciseItem[] {
  return [
    item("cat_cow", `${sets} × 8 powtórzeń`, "Ruch płynny, z oddechem."),
    item("quadruped_thoracic_rotation", `${sets} × 6 / strona`, "Biodra zostają nad kolanami."),
    item("ankle_rock_forward", `${sets} × 8 / strona`, "Pięta zostaje na podłożu."),
    item("adductor_rockback", `${sets} × 8 / strona`, "Cofaj biodra bez zaokrąglania pleców."),
  ];
}

/** Static stretches for the end of a recovery or mobility session. */
export function recoveryStretches(): ExerciseItem[] {
  return [
    item("half_kneeling_hip_flexor_stretch", "2 × 30 s / strona", "Napnij pośladek nogi z tyłu."),
    item("half_kneeling_hamstring_stretch", "2 × 30 s / strona", "Plecy proste, biodra w tył."),
    item("soleus_bent_knee_stretch", "2 × 30 s / strona", HOLD),
  ];
}

export interface RecoveryContent {
  warmup: ExerciseItem[];
  main: ExerciseItem[];
  accessory: ExerciseItem[];
  cooldown: ExerciseItem[];
}

/**
 * A complete recovery session (about 25–30 min): light circulation, a
 * mobility circuit, low-load tissue work and stretches with breathing.
 */
export function recoverySessionContent(options: { circulationMin?: number } = {}): RecoveryContent {
  const minutes = options.circulationMin ?? 10;
  return {
    warmup: [
      item(
        "easy_cycle_recovery",
        `${minutes} min spacer lub rower, bardzo lekko`,
        "Tempo pozwalające swobodnie rozmawiać.",
      ),
    ],
    main: mobilityCircuit(2),
    accessory: [
      item("soleus_iso_hold", "2 × 30 s", "Lekko, pięty minimalnie nad podłożem."),
      item("long_lever_hamstring_iso", "2 × 20 s", "Pięty wbite w podłoże, biodra uniesione."),
    ],
    cooldown: [
      ...recoveryStretches(),
      item("diaphragmatic_breathing", "3 min", "Wdech nosem, dłuższy wydech, rozluźnij barki."),
    ],
  };
}
