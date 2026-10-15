import type { Profile, SessionDay, TrainingExercise } from "./types";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import {
  getApprovedExerciseDefinitions, getExerciseDefinition, getExerciseRegression,
  hydrateTrainingExerciseFromDefinition, isExerciseAllowedForProfile, resolveExerciseByName,
  type ExerciseDefinition,
} from "./exerciseLibrary";
import { isStrengthSession } from "./sessionClassification";

const ADVANCED = /^(?:full_nordic|eccentric_nordic)|razor|depth.jump|zarzut|clean|snatch|overcoming/i;

/** Final check on canonical identity, including saved plans and replacements. */
export function enforceStrengthEligibility(session: SessionDay, profile: Profile): SessionDay {
  const secondSession = session.secondSession
    ? enforceStrengthEligibility(session.secondSession, profile) : session.secondSession;
  if (session.dayType === "club" || session.dayType === "match" ||
      session.externalCommitment || !isStrengthSession(session))
    return secondSession === session.secondSession ? session : { ...session, secondSession };
  const athlete = buildAthleteTrainingProfile(profile);
  const allowed = (def: ExerciseDefinition) => {
    if (!isExerciseAllowedForProfile(def, athlete).ok) return false;
    if (def.technicalComplexity >= 4 || ADVANCED.test(def.id)) {
      if ((athlete.strengthTrainingAge ?? 0) < 6 || athlete.movementCompetenceLevel !== "high")
        return false;
      if ((athlete.age ?? 0) < 18 && athlete.supervisionLevel !== "full") return false;
    }
    if (def.primaryAdaptation === "max_strength" && def.loadingType !== "bodyweight" &&
        !athlete.exerciseSafetyProfile.allowHeavyCompounds) return false;
    if (def.plyometricIntensity === "very_high" &&
        !athlete.exerciseSafetyProfile.allowDepthJumps) return false;
    return true;
  };
  const cache = new Map<string, ExerciseDefinition | undefined>();
  const alternative = (def: ExerciseDefinition) => {
    if (cache.has(def.id)) return cache.get(def.id);
    const regression = getExerciseRegression(def, athlete);
    const preferredIds = /nordic|razor/i.test(def.id)
      ? ["assisted_nordic_hamstring", "bilateral_slider_leg_curl", "prone_band_leg_curl", "lying_leg_curl"]
      : def.movementPattern === "squat" || def.movementPattern === "olympic"
        ? ["goblet_squat", "bodyweight_squat"]
        : def.movementPattern === "hinge"
          ? ["romanian_deadlift_db", "glute_bridge"]
          : def.movementPattern === "lunge"
            ? ["bodyweight_split_squat"] : [];
    const kneeFlexion = /nordic|razor|leg_curl/i.test(def.id);
    const candidates = [
      ...(regression ? [regression] : []),
      ...preferredIds.map(getExerciseDefinition).filter((x): x is ExerciseDefinition => !!x),
      ...getApprovedExerciseDefinitions().filter(x => def.movementPattern !== "gait" &&
        ["strength", "power", "plyometric", "prehab", "core"].includes(x.category) &&
        x.family !== "football_ball_work" && x.movementPattern === def.movementPattern &&
        x.difficultyLevel < def.difficultyLevel).sort((a, b) => a.difficultyLevel - b.difficultyLevel),
    ];
    const chosen = candidates.find(candidate =>
      candidate.family !== "football_ball_work" &&
      ["strength", "power", "plyometric", "prehab", "core"].includes(candidate.category) &&
      (!kneeFlexion || /nordic|leg_curl/i.test(candidate.id)) && allowed(candidate));
    cache.set(def.id, chosen);
    return chosen;
  };
  let changed = false;
  const fix = <T extends { name: string; exerciseId?: string; executionBlockedReason?: string }>(exercise: T): T => {
    const def = getExerciseDefinition(exercise.exerciseId ?? "") ?? resolveExerciseByName(exercise.name);
    if (!def || !["strength", "power", "plyometric", "prehab"].includes(def.category))
      return exercise;
    if (allowed(def)) {
      if (!exercise.executionBlockedReason) return exercise;
      changed = true;
      return { ...exercise, executionBlockedReason: undefined };
    }
    const replacement = alternative(def);
    if (!replacement) {
      changed = true;
      return { ...exercise, executionBlockedReason: "Nie ma odpowiedniego wariantu przy tych ustawieniach. Sprawdź ćwiczenie z trenerem." };
    }
    changed = true;
    const original = exercise as T & TrainingExercise;
    const cap = (s: string | undefined, maximum: number) => {
      const values = s?.match(/\d+/g)?.map(Number) ?? [maximum];
      return String(Math.max(1, Math.min(maximum, ...values)));
    };
    const next = hydrateTrainingExerciseFromDefinition({
      ...original,
      exerciseId: replacement.id, name: replacement.displayNamePl,
      visualId: replacement.id,
      executionBlockedReason: undefined, displayPrescription: undefined,
      setup: undefined, technique: undefined, cue: undefined, instructionSteps: undefined,
      commonMistake: undefined, purpose: undefined, progression: undefined,
      tempo: undefined,
      sets: cap(original.sets, 2), reps: cap(original.reps, replacement.category === "plyometric" ? 3 : 6),
      duration: undefined, groundContacts: undefined, rpe: "5–6", rir: "3–4",
      loadTarget: replacement.loadingType === "bodyweight" ? "Masa ciała, kontrola ruchu" : "Lekko, nauka techniki",
      equipment: replacement.equipmentRequired.join(", "),
      wasAdjustedForAthleteProfile: true,
      replacementForBlockedExercise: original.replacementForBlockedExercise ?? def.displayNamePl,
      athleteProfileAdjustmentReason: "Łatwiejszy wariant dobrany do doświadczenia, kontroli ruchu i nadzoru.",
    });
    return { ...next,
      ...("prescription" in exercise ? { prescription: `${next.sets} × ${next.reps}` } : {}),
    } as unknown as T;
  };
  const sections = {
    warmup: session.sections.warmup.map(fix), main: session.sections.main.map(fix),
    accessory: session.sections.accessory.map(fix),
    footballTransfer: session.sections.footballTransfer.map(fix), cooldown: session.sections.cooldown.map(fix),
  };
  const structuredSections = session.structuredSections?.map(section => ({ ...section,
    blocks: section.blocks.map(block => ({ ...block, exercises: block.exercises.map(fix) })),
  }));
  const exercises = session.exercises?.map(fix);
  if (!changed && secondSession === session.secondSession) return session;
  return { ...session, sections, structuredSections, exercises, secondSession,
    ...(changed ? { safetyNote: "Warianty ćwiczeń dostosowane do doświadczenia siłowego i nadzoru." } : {}),
  };
}
