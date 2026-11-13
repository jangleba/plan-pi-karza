import { buildAthleteTrainingProfile } from "../athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "../exerciseLibrary";
import type { RunningRecipe } from "@/lib/running/recipe";
import type { Profile, SessionDay } from "../types";
import { trainingTier, type Dose, type EngineSession, type Issue } from "./model";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { hasDeclaredFootball, hasDeclaredWall, requiresDeclaredWall } from "./support";
import { coachedPrimerEligible, coachedPrimerDose } from "./strengthProtocols";
import { hasCurrentVerifiedMas } from "./endurance";
import { hasVerifiedAdvancedStrength } from "./preparation";
import { resolveGoalPolicy } from "./goalPolicy";

const TARGETS = new Set([
  "strengthA",
  "strengthB",
  "speed",
  "endurance",
  "activation",
  "recovery",
  "mobility",
  "skills",
]);
const FUNCTIONS = new Set([
  "knee_strength",
  "hip_strength",
  "unilateral_strength",
  "knee_flexion",
  "hamstring_iso",
  "quad_iso",
  "iso_primer",
  "adductor",
  "calf_straight",
  "calf_bent",
  "push",
  "pull",
  "trunk",
  "power",
  "landing",
  "braking",
  "speed",
  "endurance",
  "warmup",
  "mobility",
  "recovery",
  "breathing",
  "ball_skill",
]);
type NumericDose = Dose & { postRestSeconds?: number };

export interface DerivedSessionLoad {
  minutes: number;
  sprintMetres: number;
  highLower: boolean;
}

function runningTimeline(
  recipe: RunningRecipe,
): { seconds: number; mainSeconds: number; hard: boolean } | null {
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (
    !recipe ||
    !recipe.warmup ||
    !recipe.cooldown ||
    !finite(recipe.warmup.seconds) ||
    !finite(recipe.cooldown.seconds) ||
    !Array.isArray(recipe.blocks) ||
    !recipe.blocks.length
  )
    return null;
  let mainSeconds = 0;
  let hard = !["easy_continuous", "long_continuous"].includes(recipe.method);
  for (const block of recipe.blocks) {
    if (
      !block ||
      !Number.isInteger(block.sets) ||
      block.sets < 1 ||
      !Number.isInteger(block.repsPerSet) ||
      block.repsPerSet < 1 ||
      !block.work ||
      !finite(block.work.seconds) ||
      block.work.seconds === 0 ||
      !block.recovery ||
      !finite(block.recovery.seconds) ||
      (block.setRest && !finite(block.setRest.seconds)) ||
      !block.intensity ||
      !Array.isArray(block.intensity.rpe) ||
      block.intensity.rpe.length !== 2 ||
      block.intensity.rpe.some((v) => !finite(v) || v > 10)
    )
      return null;
    mainSeconds += block.sets * block.repsPerSet * block.work.seconds;
    mainSeconds += block.sets * Math.max(0, block.repsPerSet - 1) * block.recovery.seconds;
    if (block.setRest) mainSeconds += Math.max(0, block.sets - 1) * block.setRest.seconds;
    if (block.intensity.zone !== "easy") hard = true;
  }
  return {
    seconds: recipe.warmup.seconds + mainSeconds + recipe.cooldown.seconds,
    mainSeconds,
    hard,
  };
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, normalize(v)]),
          )
        : item;
  return JSON.stringify(normalize(value));
}

/** Independent arithmetic from the numeric prescription, not its cached totals. */
export function deriveEngineSessionLoad(
  recipe: EngineSession,
  profile: Profile,
): DerivedSessionLoad {
  let seconds = 0,
    sprintMetres = 0;
  for (const [index, exercise] of recipe.exercises.entries()) {
    const d = exercise.dose as NumericDose;
    const sides = d.perSide ? 2 : 1;
    const repetitions = d.reps ?? 1;
    const work =
      d.seconds ??
      (d.distanceM ? 8 * repetitions : repetitions * (d.intent === "explosive" ? 3 : 4));
    seconds +=
      d.sets * work * sides +
      Math.max(0, d.sets - 1) * d.restSeconds +
      (d.postRestSeconds ?? (index < recipe.exercises.length - 1 ? d.restSeconds : 0)) +
      45;
    if (d.distanceM !== undefined && ["speed", "landing", "braking"].includes(exercise.role)) {
      sprintMetres += d.sets * repetitions * sides * (d.distanceM + (d.runInM ?? 0));
    }
  }
  const gym = recipe.roles.some((r) => r === "strengthA" || r === "strengthB");
  const enduranceOnly = recipe.roles.length === 1 && recipe.roles[0] === "endurance";
  const support = recipe.roles.every((r) =>
    ["activation", "recovery", "mobility", "skills"].includes(r),
  );
  const run = recipe.runningRecipe ? runningTimeline(recipe.runningRecipe) : null;
  const minutes =
    enduranceOnly && run
      ? run.seconds / 60
      : enduranceOnly
        ? recipe.exercises.reduce(
            (sum, e) => sum + e.dose.sets * (e.dose.reps ?? 1) * (e.dose.seconds ?? 0),
            0,
          ) /
            60 +
          10
        : Math.ceil(seconds / 60) + (gym || support ? 8 : 10);
  const highLower =
    !!run?.hard ||
    recipe.exercises.some((e) => e.role === "speed" || e.role === "iso_primer") ||
    (recipe.exercises.some((e) =>
      ["knee_strength", "hip_strength", "unilateral_strength"].includes(e.role),
    ) &&
      trainingTier(profile) !== "foundation");
  return { minutes, sprintMetres, highLower };
}

function compatibleFunction(id: string, role: string): boolean {
  const metadata = FUNCTIONAL_CATALOGUE[id];
  const definition = getExerciseDefinition(id);
  if (!definition) return false;
  if (role === "warmup") return true;
  if (role === "mobility") return definition.category === "mobility";
  if (role === "recovery")
    return definition.family === "recovery" || definition.category === "mobility";
  if (role === "breathing") return id === "diaphragmatic_breathing";
  if (role === "ball_skill") return definition.family === "football_ball_work";
  if (role === "endurance")
    return definition.category === "endurance" && definition.family === "conditioning";
  if (!metadata) return false;
  const has = (action: string) => metadata.actions.some((a) => a === action);
  switch (role) {
    case "knee_strength":
      return has("knee_extension") && metadata.contraction !== "isometric";
    case "hip_strength":
      return has("hip_extension") && metadata.contraction !== "isometric";
    case "unilateral_strength":
      return (
        metadata.unilateral &&
        metadata.contraction !== "isometric" &&
        (has("hip_extension") || has("knee_extension"))
      );
    case "knee_flexion":
      return has("knee_flexion") && metadata.contraction !== "isometric";
    case "hamstring_iso":
      return metadata.contraction === "isometric" && (has("knee_flexion") || has("hip_extension"));
    case "quad_iso":
    case "iso_primer":
      return metadata.contraction === "isometric" && has("knee_extension");
    case "adductor":
      return has("hip_adduction");
    case "calf_straight":
      return has("plantar_flexion") && id === "standing_calf_raise";
    case "calf_bent":
      return has("plantar_flexion") && ["seated_soleus_raise", "soleus_iso_hold"].includes(id);
    case "push":
      return has("push");
    case "pull":
      return has("pull");
    case "trunk":
      return has("brace") && !has("hip_adduction");
    case "power":
      return metadata.contraction === "ballistic" || metadata.contraction === "reactive";
    case "landing":
    case "braking":
      return has("landing") || id === "progressive_run_three_step_stop";
    case "speed":
      return definition.category === "speed" && has("locomotion");
    default:
      return false;
  }
}

/** Validate final *unprotected* own-session prescriptions before any write. */
export function validateEngineSession(
  session: SessionDay,
  profile: Profile,
  options: { minutesPerSession?: number } = {},
): Issue[] {
  const recipe = session.engineV2;
  if (!recipe) return [];
  const issues: Issue[] = [];
  const fail = (code: string, message: string) =>
    issues.push({ code, date: session.date, message });
  if (
    !Array.isArray(recipe.roles) ||
    !recipe.roles.length ||
    recipe.roles.some((r) => !TARGETS.has(r)) ||
    new Set(recipe.roles).size !== recipe.roles.length
  ) {
    fail("INVALID_SESSION_ROLES", "Sesja ma nieznane lub powtórzone zadania.");
    if (!Array.isArray(recipe.roles)) return issues;
  }
  if (!Array.isArray(recipe.exercises) || !recipe.exercises.length) {
    fail("EMPTY_ENGINE_SESSION", "Trening własny nie zawiera ćwiczeń.");
    return issues;
  }
  const athlete = buildAthleteTrainingProfile(profile);
  const ids = new Set<string>();
  let validArithmetic = true;
  for (const exercise of recipe.exercises) {
    if (!exercise || typeof exercise.exerciseId !== "string" || !exercise.dose) {
      fail("INVALID_EXERCISE_DECISION", "Niepełny zapis ćwiczenia i dawki.");
      validArithmetic = false;
      continue;
    }
    const d = exercise.dose as NumericDose;
    const definition = getExerciseDefinition(exercise.exerciseId);
    if (
      !definition ||
      definition.approved === false ||
      definition.draft ||
      !isExerciseAllowedForProfile(definition, athlete).ok
    )
      fail("INELIGIBLE_EXERCISE", `Ćwiczenie nie przechodzi wymagań: ${exercise.exerciseId}.`);
    if (
      definition &&
      (definition.minParticipants > 1 ||
        definition.requiresPartner ||
        (definition.requiresBall && !hasDeclaredFootball(profile)) ||
        (requiresDeclaredWall(definition.id) && !hasDeclaredWall(profile)) ||
        (/^football_gk_/.test(definition.id) && profile.position !== "goalkeeper") ||
        (["pitch", "open_field"].includes(definition.spaceRequirement) && !profile.hasPitch) ||
        (definition.spaceRequirement === "sprint_lane" && !profile.hasSprintSpace))
    )
      fail(
        "MISSING_SESSION_REQUIREMENT",
        `Brak wymaganego partnera, piłki lub miejsca: ${exercise.exerciseId}.`,
      );
    if (ids.has(exercise.exerciseId))
      fail("DUPLICATE_EXERCISE", `Powtórzone ćwiczenie: ${exercise.exerciseId}.`);
    ids.add(exercise.exerciseId);
    if (!FUNCTIONS.has(exercise.role) || !compatibleFunction(exercise.exerciseId, exercise.role))
      fail(
        "FUNCTION_MISMATCH",
        `Ćwiczenie nie realizuje przypisanej funkcji: ${exercise.exerciseId}.`,
      );
    const positive = [d.reps, d.seconds, d.distanceM];
    const nonnegative = [d.restSeconds, d.runInM, d.postRestSeconds];
    if (
      !Number.isInteger(d.sets) ||
      d.sets <= 0 ||
      !Number.isFinite(d.restSeconds) ||
      positive.some((n) => n !== undefined && (!Number.isFinite(n) || n <= 0)) ||
      nonnegative.some((n) => n !== undefined && (!Number.isFinite(n) || n < 0)) ||
      (d.reps === undefined && d.seconds === undefined && d.distanceM === undefined) ||
      (d.rir !== undefined && (!Number.isFinite(d.rir) || d.rir < 0 || d.rir > 10)) ||
      (d.perSide !== undefined && typeof d.perSide !== "boolean")
    ) {
      fail(
        "INVALID_DOSE",
        `Dawka nie jest dodatnia, skończona lub kompletna: ${exercise.exerciseId}.`,
      );
      validArithmetic = false;
    }
    if (
      ["hamstring_iso", "quad_iso", "iso_primer"].includes(exercise.role) &&
      (!d.seconds || d.reps !== undefined)
    )
      fail("ISOMETRIC_DOSE_MISMATCH", "Izometria wymaga czasu utrzymania zamiast liczby ruchów.");
    if (exercise.role === "iso_primer") {
      const protocol = coachedPrimerDose();
      if (
        !coachedPrimerEligible(profile, recipe.phase) ||
        d.sets !== protocol.sets ||
        d.seconds !== protocol.seconds ||
        d.restSeconds !== protocol.restSeconds ||
        d.postRestSeconds !== protocol.postRestSeconds ||
        d.jointAngleDegrees !== protocol.jointAngleDegrees ||
        d.intent !== protocol.intent ||
        d.perSide === true
      )
        fail(
          "ISOMETRIC_PROTOCOL_MISMATCH",
          "Nadzorowany blok izometrii wymaga jawnych kwalifikacji, stałego stanowiska i pełnej dawki z odpoczynkiem.",
        );
    }
    if (d.runInM && !d.distanceM)
      fail("INCOMPLETE_DISTANCE", "Nabieg wymaga zapisanego odcinka biegu.");
  }
  if (!validArithmetic) return issues;
  if (recipe.organization === "contrast") {
    if (
      !hasVerifiedAdvancedStrength(profile) ||
      resolveGoalPolicy(profile).reduced ||
      profile.trainingMethodPreferences?.strength !== "M09" ||
      ["adaptation", "deload"].includes(recipe.phase) ||
      profile.seasonPhase === "transition" ||
      profile.goal === "return" ||
      profile.secondaryLimiter === "fatigue" ||
      profile.painInjury ||
      profile.seasonPhase === "return_injury"
    )
      fail(
        "CONTRAST_ELIGIBILITY",
        "Wybrana metoda kontrastowa wymaga przygotowanego dorosłego zawodnika.",
      );
    const primary = recipe.exercises.find(
      (e) => e.role === "knee_strength" || e.role === "hip_strength",
    );
    const power = recipe.exercises.find((e) => e.role === "power");
    if (
      !primary ||
      !power ||
      !["external", "axial"].includes(
        getExerciseDefinition(primary.exerciseId)?.loadingType ?? "",
      ) ||
      primary.dose.sets !== power.dose.sets ||
      primary.dose.restSeconds < 180 ||
      power.dose.restSeconds < 180 ||
      !FUNCTIONAL_CATALOGUE[power.exerciseId]?.actions.includes("jump")
    )
      fail(
        "CONTRAST_DOSE_MISMATCH",
        "Para kontrastowa wymaga zgodnych rund siły i skoku oraz pełnych przerw.",
      );
    const pairs =
      session.structuredSections
        ?.flatMap((s) => s.blocks)
        .filter((b) => b.blockType === "contrast") ?? [];
    if (
      pairs.length !== 1 ||
      pairs[0].exercises.length !== 2 ||
      pairs[0].exercises[0].exerciseId !== primary?.exerciseId ||
      pairs[0].exercises[1].exerciseId !== power?.exerciseId
    )
      fail("CONTRAST_RENDER_MISMATCH", "Zapis wykonania nie zachowuje wybranej pary siła–skok.");
  }
  if (recipe.roles.length === 1 && recipe.roles[0] === "endurance") {
    const run = recipe.runningRecipe,
      timeline = run ? runningTimeline(run) : null;
    if (!run || !timeline) {
      fail(
        "INVALID_RUN_RECIPE",
        "Sesja wydolnościowa wymaga kompletnej, skończonej receptury biegu.",
      );
      return issues;
    }
    if (!session.runningRecipe || stableJson(session.runningRecipe) !== stableJson(run))
      fail("RUN_RECIPE_MISMATCH", "Licznik i silnik mają różne receptury biegu.");
    const numericMain = recipe.exercises.reduce(
      (sum, e) =>
        sum +
        e.dose.sets * (e.dose.reps ?? 1) * (e.dose.seconds ?? 0) +
        Math.max(0, e.dose.sets - 1) * e.dose.restSeconds,
      0,
    );
    if (numericMain !== timeline.mainSeconds)
      fail("RUN_DOSE_MISMATCH", "Numeryczna dawka biegu nie zachowuje pracy i przerw receptury.");
    if (
      timeline.hard &&
      run.blocks.some(
        (b) =>
          (b.repsPerSet > 1 && b.recovery.seconds <= 0) ||
          (b.sets > 1 && (!b.setRest || b.setRest.seconds <= 0)),
      )
    )
      fail(
        "MISSING_INTERVAL_RECOVERY",
        "Receptura interwałów nie zawiera odpoczynków pomiędzy odcinkami.",
      );
    if (
      timeline.hard &&
      (!hasCurrentVerifiedMas(profile, session.date) ||
        profile.age < 16 ||
        !["intermediate", "advanced", "elite"].includes(profile.level))
    )
      fail(
        "UNVERIFIED_INTERVAL_PROFILE",
        "Mocny wariant wydolności wymaga aktualnego testu i potwierdzonego przygotowania sportowego.",
      );
    if (run.paceSource === "field_mas" && !hasCurrentVerifiedMas(profile, session.date))
      fail("UNVERIFIED_RUN_PACE", "Tempo biegu nie pochodzi z aktualnego wskazanego testu.");
    if (["rsa", "field_mas_test"].includes(run.method))
      fail(
        "UNSUPPORTED_RUN_METHOD",
        "Ta receptura nie może zastępować zaplanowanej pracy tlenowej lub interwałowej.",
      );
  }
  const totals = deriveEngineSessionLoad(recipe, profile);
  if (
    !Number.isFinite(recipe.minutes) ||
    recipe.minutes !== totals.minutes ||
    session.durationMin !== totals.minutes
  )
    fail("STALE_DURATION", "Czas sesji nie odpowiada rzeczywistej dawce i przerwom.");
  if (!Number.isFinite(recipe.sprintMetres) || recipe.sprintMetres !== totals.sprintMetres)
    fail("STALE_SPRINT_METRES", "Suma metrów nie odpowiada odcinkom, nabiegom i stronom.");
  if (recipe.highLower !== totals.highLower)
    fail("STALE_LOAD_CLASSIFICATION", "Klasyfikacja obciążenia nie odpowiada zadaniom sesji.");
  if (totals.minutes > (options.minutesPerSession ?? 75))
    fail("TIME_LIMIT", "Rzeczywista dawka przekracza dostępny czas.");
  if (totals.sprintMetres > 240)
    fail("SPRINT_LIMIT", "Rzeczywista suma szybkich odcinków przekracza 240 m.");
  if (session.runningRecipe) {
    const timeline = runningTimeline(session.runningRecipe);
    if (!timeline || timeline.seconds !== totals.minutes * 60)
      fail("RUN_CLOCK_MISMATCH", "Licznik biegu nie odpowiada dawce i czasowi sesji.");
  }
  return issues;
}
