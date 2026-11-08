import { balanceStrengthSections } from "./strengthSessionBalance";
import { hasCurrentMethodRecipe } from "./methods/planner";
import { profileWithMethodEquipment } from "./methods/builders";
import { trainingMethodEligibility } from "./methods/eligibility";
import type { Profile, SessionDay, TrainingExercise } from "./types";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import {
  getApprovedExerciseDefinitions,
  getExerciseDefinition,
  getExerciseRegression,
  hydrateTrainingExerciseFromDefinition,
  isExerciseAllowedForProfile,
  resolveExerciseByName,
  type ExerciseDefinition,
} from "./exerciseLibrary";
import { isStrengthSession } from "./sessionClassification";
import {
  applyStrengthProgramming,
  estimateStrengthMinutes,
  selectStrengthMethod,
} from "./strengthProgramming";
import { structuredToFlat } from "./strengthBlocks";

const ADVANCED =
  /^(?:full_nordic|eccentric_nordic)|razor|depth.jump|zarzut|clean|snatch|overcoming/i;

/** Final check on canonical identity, including saved plans and replacements. */
export function enforceStrengthEligibility(session: SessionDay, profile: Profile): SessionDay {
  const secondSession = session.secondSession
    ? enforceStrengthEligibility(session.secondSession, profile)
    : session.secondSession;
  if (session.executionProtected)
    return secondSession === session.secondSession ? session : { ...session, secondSession };
  if (
    session.dayType === "club" ||
    session.dayType === "match" ||
    session.externalCommitment ||
    (!isStrengthSession(session) && !/^Siłownia:/i.test(session.title))
  )
    return secondSession === session.secondSession ? session : { ...session, secondSession };
  const athlete = buildAthleteTrainingProfile(
    profileWithMethodEquipment(profile, session.trainingMethods?.conditions),
  );
  const allowed = (def: ExerciseDefinition) => {
    if (!isExerciseAllowedForProfile(def, athlete).ok) return false;
    if (def.technicalComplexity >= 4 || ADVANCED.test(def.id)) {
      if ((athlete.strengthTrainingAge ?? 0) < 6 || athlete.movementCompetenceLevel !== "high")
        return false;
      if ((athlete.age ?? 0) < 18 && athlete.supervisionLevel !== "full") return false;
    }
    if (
      def.primaryAdaptation === "max_strength" &&
      def.loadingType !== "bodyweight" &&
      !athlete.exerciseSafetyProfile.allowHeavyCompounds
    )
      return false;
    if (def.plyometricIntensity === "very_high" && !athlete.exerciseSafetyProfile.allowDepthJumps)
      return false;
    return true;
  };
  const cache = new Map<string, ExerciseDefinition[]>();
  const alternative = (def: ExerciseDefinition) => {
    if (cache.has(def.id)) return cache.get(def.id)!;
    const regression = getExerciseRegression(def, athlete);
    const preferredIds = /nordic|razor|leg_curl/i.test(def.id)
      ? [
          "assisted_nordic_hamstring",
          "bilateral_slider_leg_curl",
          "prone_band_leg_curl",
          "lying_leg_curl",
          "long_lever_hamstring_iso",
        ]
      : def.movementPattern === "squat" || def.movementPattern === "olympic"
        ? ["goblet_squat", "bodyweight_squat"]
        : def.movementPattern === "hinge"
          ? ["romanian_deadlift_db", "glute_bridge"]
          : def.movementPattern === "lunge"
            ? ["bodyweight_split_squat"]
            : [];
    const kneeFlexion = /nordic|razor|leg_curl/i.test(def.id);
    const candidates = [
      ...(regression ? [regression] : []),
      ...preferredIds.map(getExerciseDefinition).filter((x): x is ExerciseDefinition => !!x),
      ...getApprovedExerciseDefinitions()
        .filter(
          (x) =>
            def.movementPattern !== "gait" &&
            ["strength", "power", "plyometric", "prehab", "core"].includes(x.category) &&
            x.family !== "football_ball_work" &&
            x.movementPattern === def.movementPattern &&
            x.difficultyLevel < def.difficultyLevel,
        )
        .sort((a, b) => a.difficultyLevel - b.difficultyLevel),
    ];
    const chosen = candidates.filter(
      (candidate) =>
        candidate.family !== "football_ball_work" &&
        ["strength", "power", "plyometric", "prehab", "core"].includes(candidate.category) &&
        (!kneeFlexion || /nordic|leg_curl|^long_lever_hamstring_iso$/i.test(candidate.id)) &&
        allowed(candidate),
    );
    cache.set(def.id, chosen);
    return chosen;
  };
  // Two different blocked exercises (e.g. both jumps of a contrast pair) often share
  // one regression. Each replacement must stay a distinct exercise in the session.
  let used = new Set<string>();
  const dropped = new Set<object>();
  const startRepresentation = (exercises: Array<{ name: string; exerciseId?: string }>) => {
    used = new Set(
      exercises.flatMap((exercise) => {
        const def =
          getExerciseDefinition(exercise.exerciseId ?? "") ?? resolveExerciseByName(exercise.name);
        return def && allowed(def) ? [def.id] : [];
      }),
    );
  };
  let changed = false;
  const fix = <T extends { name: string; exerciseId?: string; executionBlockedReason?: string }>(
    exercise: T,
  ): T => {
    const def =
      getExerciseDefinition(exercise.exerciseId ?? "") ?? resolveExerciseByName(exercise.name);
    if (!def || !["strength", "power", "plyometric", "prehab", "core"].includes(def.category))
      return exercise;
    if (allowed(def)) {
      if (!exercise.executionBlockedReason) return exercise;
      changed = true;
      return { ...exercise, executionBlockedReason: undefined };
    }
    const options = alternative(def);
    const replacement = options.find((option) => !used.has(option.id));
    if (!replacement && options.length) {
      // The only safe variant is already in this session: drop the repeat
      // rather than show the same exercise twice.
      changed = true;
      dropped.add(exercise);
      return exercise;
    }
    if (replacement) used.add(replacement.id);
    if (!replacement) {
      changed = true;
      return {
        ...exercise,
        executionBlockedReason:
          "Nie ma odpowiedniego wariantu przy tych ustawieniach. Sprawdź ćwiczenie z trenerem.",
      };
    }
    changed = true;
    const original = exercise as T & TrainingExercise;
    const cap = (s: string | undefined, maximum: number) => {
      const values = s?.match(/\d+/g)?.map(Number) ?? [maximum];
      return String(Math.max(1, Math.min(maximum, ...values)));
    };
    const next = hydrateTrainingExerciseFromDefinition({
      ...original,
      exerciseId: replacement.id,
      name: replacement.displayNamePl,
      visualId: replacement.id,
      executionBlockedReason: undefined,
      displayPrescription: undefined,
      setup: undefined,
      technique: undefined,
      cue: undefined,
      instructionSteps: undefined,
      commonMistake: undefined,
      purpose: undefined,
      progression: undefined,
      tempo: undefined,
      sets: cap(original.sets, 2),
      ...(replacement.movementPattern === "isometric"
        ? { reps: undefined, duration: "15 s" }
        : {
            reps: cap(original.reps, replacement.category === "plyometric" ? 3 : 6),
            duration: undefined,
          }),
      groundContacts: undefined,
      rpe: "5–6",
      rir: "3–4",
      loadTarget:
        replacement.loadingType === "bodyweight"
          ? "Masa ciała, kontrola ruchu"
          : "Lekko, nauka techniki",
      equipment: replacement.equipmentRequired.join(", "),
      wasAdjustedForAthleteProfile: true,
      replacementForBlockedExercise: original.replacementForBlockedExercise ?? def.displayNamePl,
      athleteProfileAdjustmentReason:
        "Łatwiejszy wariant dobrany do doświadczenia, kontroli ruchu i nadzoru.",
    });
    return {
      ...next,
      ...("prescription" in exercise
        ? { prescription: `${next.sets} × ${next.reps ?? next.duration}` }
        : {}),
    } as unknown as T;
  };
  startRepresentation([
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
    ...session.sections.cooldown,
  ]);
  const fixAll = <T extends { name: string; exerciseId?: string }>(list: T[]): T[] => {
    const next = list.map(fix);
    const kept = next.filter((exercise) => !dropped.has(exercise));
    // Never empty a group: a lone repeat stays rather than leaving a hole.
    return kept.length ? kept : next;
  };
  const sections = {
    warmup: fixAll(session.sections.warmup),
    main: fixAll(session.sections.main),
    accessory: fixAll(session.sections.accessory),
    footballTransfer: fixAll(session.sections.footballTransfer),
    cooldown: fixAll(session.sections.cooldown),
  };
  startRepresentation(
    (session.structuredSections ?? []).flatMap((section) =>
      section.blocks.flatMap((block) => block.exercises),
    ),
  );
  let structuredSections = session.structuredSections?.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      const exercises = fixAll(block.exercises);
      // A pair reduced to one exercise is no longer a superset/contrast.
      return exercises.length === 1 && block.exercises.length > 1
        ? {
            ...block,
            blockType: "single" as const,
            exercises: exercises.map((exercise) => ({
              ...exercise,
              restAfterPair: undefined,
              restAfterExercise:
                block.exercises
                  .find((item) => item.restAfterPair)
                  ?.restAfterPair?.replace(/\s*po (parze|rundzie)\s*$/i, "") ??
                exercise.restAfterExercise,
            })),
          }
        : { ...block, exercises };
    }),
  }));
  if (
    structuredSections?.length &&
    !(
      hasCurrentMethodRecipe(session) &&
      trainingMethodEligibility(
        session.trainingMethods!.primary,
        profile,
        session,
        session.trainingMethods?.conditions,
      ).allowed
    )
  ) {
    const phaseText = session.blockPhaseLabel ?? "";
    const weekPhase = /kalibr|wprowad|adapt/i.test(phaseText)
      ? "adaptation"
      : /deload|świeżość/i.test(phaseText)
        ? "deload"
        : "development";
    const programmed = applyStrengthProgramming(
      structuredSections,
      selectStrengthMethod(profile, { mdLabel: session.mdLabel, weekPhase }),
    );
    if (programmed !== structuredSections) {
      changed = true;
      structuredSections = programmed;
    }
  }
  if (structuredSections?.length) {
    const balanced = balanceStrengthSections(
      structuredSections,
      profile,
      session.durationMin > 25 &&
        !session.readinessAdjustedDate &&
        !session.readinessOriginalSession &&
        !["MD-2", "MD-1", "MD", "MD+1"].includes(session.mdLabel ?? "") &&
        !profile.painInjury &&
        profile.seasonPhase !== "return_injury",
    );
    if (balanced !== structuredSections) {
      structuredSections = balanced;
      changed = true;
    }
  }
  if (session.exercises) startRepresentation(session.exercises);
  const exercises = session.exercises && fixAll(session.exercises);
  if (!changed && secondSession === session.secondSession) return session;
  const projected = structuredSections?.length ? structuredToFlat(structuredSections) : sections;
  return {
    ...session,
    sections: projected,
    structuredSections,
    exercises,
    secondSession,
    ...(changed
      ? {
          durationMin: structuredSections?.length
            ? estimateStrengthMinutes(structuredSections)
            : session.durationMin,
          safetyNote:
            session.safetyNote ??
            "Warianty i układ ćwiczeń dostosowane do doświadczenia siłowego i nadzoru.",
        }
      : {}),
  };
}
