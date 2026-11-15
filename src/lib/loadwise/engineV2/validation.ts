import { sprintSeconds, sprintDistance, sprintChronology } from "./sprintRecipe";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "../exerciseLibrary";
import type { RunningRecipe } from "@/lib/running/recipe";
import type { Profile, SessionDay } from "../types";
import { trainingTier, type Dose, type EngineSession, type Issue } from "./model";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { sessionRequirementIssue } from "./placeRequirements";
import { coachedPrimerEligible, coachedPrimerDose, clusterEligible } from "./strengthProtocols";
import { hasCurrentVerifiedMas } from "./endurance";
import { hasVerifiedAdvancedStrength } from "./preparation";
import { drillSetById, variantById } from "./sprintCatalog";
import { MAS_TEST_SECONDS, isMasTestRecipe, masTestIneligibility } from "./masTestRecipe";
import { resolveGoalPolicy } from "./goalPolicy";
import {
  strengthLandingCount,
  gymSpecialWorkAllowed,
  gymPowerDose,
  gymHamstringSupportDose,
} from "./gymPower";
import { GYM_EXERCISE_RULES } from "../gymStrengthExercises";
import { maximalStrengthEligible } from "./strengthPolicy";
import { gymDoseWithinBounds } from "./gymProgression";
import { ADVANCED_CONTACT_LIMIT, advancedSessionsEligible } from "./advancedSessions";
import { parseRestDuration } from "../restTimer";

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
  "hamstring_dynamic_support",
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
  if (recipe.sprintRecipeVersion === 1)
    return {
      minutes: Math.ceil(sprintSeconds(recipe.exercises) / 60) + 2,
      sprintMetres: sprintDistance(recipe.exercises),
      highLower: true,
    };
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
      d.sets *
        Math.max(0, (d.cluster?.repGroups.length ?? 1) - 1) *
        (d.cluster?.intraRestSeconds ?? 0) +
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
        : Math.ceil(seconds / 60) + (gym || support ? 8 : recipe.roles.includes("speed") ? 2 : 10);
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
    case "hamstring_dynamic_support":
      return (
        ["dynamic", "mixed"].includes(metadata.contraction) &&
        (has("knee_flexion") || has("hip_extension"))
      );
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
  const strength = recipe.roles.some((role) => role.startsWith("strength"));
  if (recipe.strengthFocus) {
    const focus = recipe.strengthFocus;
    if (
      !strength ||
      focus.version !== "strength-policy-1" ||
      ![
        "foundation",
        "strength_build",
        "max_strength",
        "power_support",
        "maintenance",
        "deload",
        "reentry",
      ].includes(focus.mode)
    )
      fail("STRENGTH_FOCUS_INVALID", "Nieprawidłowy zapis akcentu siły.");
    if (focus.mode === "max_strength") {
      const primary = recipe.exercises.find(
        (e) => e.role === (recipe.roles.includes("strengthA") ? "knee_strength" : "hip_strength"),
      );
      if (
        !maximalStrengthEligible(profile) ||
        ["adaptation", "deload", "peak"].includes(recipe.phase) ||
        !primary ||
        !["external", "axial"].includes(
          getExerciseDefinition(primary.exerciseId)?.loadingType ?? "",
        ) ||
        (primary.dose.reps ?? 0) < (profile.age < 18 ? 5 : 4) ||
        (primary.dose.rir ?? 0) < (profile.age < 18 ? 3 : 2) ||
        primary.dose.restSeconds < 180
      )
        fail(
          "MAX_STRENGTH_ELIGIBILITY",
          "Akcent ciężkiej siły wymaga przygotowania, odpowiedniego zapasu i pełnych przerw; nie jest próbą 1RM.",
        );
    }
  }
  const pairLabels = new Set<string>();
  for (const pair of recipe.strengthPairs ?? []) {
    const allowed = [
      ["push", "pull"],
      ["pull", "push"],
      ["trunk", "adductor"],
      ["adductor", "trunk"],
    ];
    const rows = pair.roles?.map((role) => recipe.exercises.filter((e) => e.role === role));
    if (
      !strength ||
      !allowed.some((roles) => stableJson(roles) === stableJson(pair.roles)) ||
      !["B", "C"].includes(pair.label) ||
      pairLabels.has(pair.label) ||
      pair.transitionSeconds !== 30 ||
      pair.roundRestSeconds !== 180 ||
      !rows ||
      rows.some((group) => group.length !== 1) ||
      rows[0]?.[0]?.dose.sets !== rows[1]?.[0]?.dose.sets ||
      rows[0]?.[0]?.dose.restSeconds !== pair.transitionSeconds ||
      rows[1]?.[0]?.dose.restSeconds !== pair.roundRestSeconds
    ) {
      fail(
        "STRENGTH_PAIR_DOSE",
        "Superseria wymaga dwóch różnych zgodnych zadań uzupełniających, równych rund i zapisanych przerw.",
      );
      continue;
    }
    pairLabels.add(pair.label);
    const blocks =
      session.structuredSections
        ?.flatMap((s) => s.blocks)
        .filter((b) => b.exercises.some((e) => e.label === `${pair.label}1`)) ?? [];
    if (
      blocks.length !== 1 ||
      blocks[0].blockType !== "superset" ||
      blocks[0].executionProtocol !== "superset-rounds-v1" ||
      blocks[0].exercises.length !== 2 ||
      blocks[0].exercises.some(
        (e, i) =>
          e.exerciseId !== rows[i][0].exerciseId ||
          e.label !== `${pair.label}${i + 1}` ||
          parseRestDuration(e.restAfterExercise ?? "") !== rows[i][0].dose.restSeconds,
      ) ||
      parseRestDuration(blocks[0].exercises[1].restAfterPair ?? "") !== pair.roundRestSeconds
    )
      fail(
        "STRENGTH_PAIR_RENDER",
        "Widok i wykonanie nie zachowują zapisanej superserii i jej przerw.",
      );
  }
  if (!strength && recipe.exercises.some((e) => e.role === "iso_primer"))
    fail(
      "ISOMETRIC_PRIMER_ORDER",
      "Nadzorowany nacisk na piny należy do opracowanej sesji siłowej; nie dodawaj go do regeneracji, mobilności ani biegania.",
    );
  if (strength && recipe.roles.includes("speed"))
    fail("MIXED_STRENGTH_SPEED", "Siłownia i sprint wymagają osobnych jednostek.");
  if (recipe.roles.includes("strengthA") && recipe.roles.includes("strengthB"))
    fail("MIXED_STRENGTH_AB", "Siła A i B wymagają osobnych dni.");
  const complex = recipe.organization === "complex";
  if (complex) {
    if (!strength || !recipe.advancedTemplate || !advancedSessionsEligible(profile, recipe.phase))
      fail(
        "ADVANCED_SESSION_ELIGIBILITY",
        "Zaawansowane pary są dla zawodników od 16 lat z przygotowaniem zaawansowanym, w zwykłym tygodniu rozwoju.",
      );
    if ((recipe.plyometricContacts ?? 0) > ADVANCED_CONTACT_LIMIT(profile.age))
      fail("ADVANCED_CONTACT_LIMIT", "Za dużo lądowań w jednej sesji zaawansowanej.");
    const labels = new Set<string>();
    for (const pair of recipe.complexPairs ?? []) {
      const at = pair.exerciseIds.map((id) =>
        recipe.exercises.findIndex((e) => e.exerciseId === id),
      );
      const [a, b] = at.map((i) => recipe.exercises[i]);
      if (
        labels.has(pair.label) ||
        at.some((i) => i < 0) ||
        at[1] !== at[0] + 1 ||
        a.dose.sets !== b.dose.sets ||
        pair.transitionSeconds !== 30 ||
        a.dose.restSeconds !== pair.transitionSeconds ||
        b.dose.restSeconds !== pair.roundRestSeconds ||
        pair.roundRestSeconds < 60 ||
        (["power", "landing"].includes(b.role) && pair.roundRestSeconds < 90)
      ) {
        fail(
          "ADVANCED_PAIR_DOSE",
          "Para wymaga dwóch kolejnych ćwiczeń z równą liczbą rund, 30 s przejścia i pełną przerwą po rundzie.",
        );
        continue;
      }
      labels.add(pair.label);
      const rendered = session.structuredSections
        ?.flatMap((sec) => sec.blocks)
        .find((block) => block.exercises.some((e) => e.label === `${pair.label}1`));
      if (
        !rendered ||
        rendered.executionProtocol !== "superset-rounds-v1" ||
        rendered.exercises.map((e) => e.exerciseId).join() !== pair.exerciseIds.join()
      )
        fail("ADVANCED_PAIR_RENDER", "Ekran nie prowadzi pary tak, jak zapisano ją w recepturze.");
    }
  }
  if (strength) {
    const roles = new Set(recipe.exercises.map((e) => e.role));
    const tasks = recipe.exercises.filter((e) => e.role !== "warmup").map((e) => e.role);
    const primerIndex = recipe.exercises.findIndex((e) => e.role === "iso_primer");
    if (
      primerIndex >= 0 &&
      (primerIndex === 0 ||
        recipe.exercises.findIndex((e) => e.role !== "warmup") !== primerIndex ||
        recipe.exercises.slice(primerIndex + 1).some((e) => e.role === "warmup") ||
        !["power", "landing", "knee_strength", "hip_strength"].includes(
          recipe.exercises[primerIndex + 1]?.role ?? "",
        ))
    )
      fail(
        "ISOMETRIC_PRIMER_ORDER",
        "Krótki nacisk na piny wymaga rozgrzewki przed blokiem oraz zaplanowanej części głównej po pełnym odpoczynku.",
      );
    // These roles describe accessory holding work, not a general ban on brief
    // preparatory holds. The latter must have a separate reviewed prescription.
    const lastPriorityIndex = recipe.exercises.reduce(
      (last, e, index) =>
        ["power", "landing", "knee_strength", "hip_strength", "unilateral_strength"].includes(
          e.role,
        )
          ? index
          : last,
      -1,
    );
    // Advanced pairs deliberately open with a hold before the reactive jump (the coaching notes).
    if (
      !complex &&
      recipe.exercises.some(
        (e, index) => ["hamstring_iso", "quad_iso"].includes(e.role) && index < lastPriorityIndex,
      )
    )
      fail(
        "ISOMETRIC_SUPPORT_ORDER",
        "Uzupełniające utrzymania izometryczne wykonuj po zaplanowanej mocy i głównych ćwiczeniach siłowych; nie zastępują krótkiego nacisku przygotowawczego.",
      );
    if (!complex && new Set(tasks).size !== tasks.length)
      fail(
        "DUPLICATE_STRENGTH_FUNCTION",
        "Powtórzone zadanie siłowe wymaga przeglądu; nie kumuluj różnych ćwiczeń o tej samej funkcji.",
      );
    // Template guardrail, not an equation treating a hold as a dynamic working set.
    if (
      !complex &&
      (tasks.filter((r) =>
        ["hip_strength", "knee_flexion", "hamstring_iso", "hamstring_dynamic_support"].includes(r),
      ).length > 2 ||
        tasks.filter((r) => ["knee_strength", "unilateral_strength", "quad_iso"].includes(r))
          .length > 2)
    )
      fail(
        "REGIONAL_TASK_OVERLAP",
        "Zbyt wiele zadań jednej strony nóg w tej jednostce A/B; rozłóż akcenty w tygodniu.",
      );
    if (
      complex
        ? !["knee_strength", "unilateral_strength", "hip_strength", "knee_flexion"].some((r) =>
            roles.has(r as never),
          )
        : !(roles.has("knee_strength") || roles.has("unilateral_strength")) ||
          !(roles.has("hip_strength") || roles.has("knee_flexion"))
    )
      fail(
        "UNBALANCED_STRENGTH",
        "Siłownia wymaga dynamicznej pracy przodu i tyłu nóg; sama izometria nie zastępuje brakującego wzorca.",
      );
    // Missing equipment is reported truthfully; never invent an equipment-free row.
    if (
      !roles.has("push") &&
      !roles.has("pull") &&
      !recipe.missing.some((r) => r === "push" || r === "pull")
    )
      fail("MISSING_UPPER_TASK", "Brak zadania góry ciała lub informacji o brakującym sprzęcie.");
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
    if (GYM_EXERCISE_RULES[exercise.exerciseId]) {
      if (
        !gymDoseWithinBounds(
          exercise.exerciseId,
          exercise.dose,
          profile,
          recipe.phase,
          session.date,
        )
      )
        fail(
          "GYM_PROGRESSION_BOUNDS",
          "Dawka lub zmierzone ustawienie gumy przekracza zakres reguł progresji.",
        );
      const expectedRole =
        exercise.exerciseId === "gym_step_brake"
          ? "landing"
          : GYM_EXERCISE_RULES[exercise.exerciseId].timedDynamic
            ? "hamstring_dynamic_support"
            : "power";
      if (exercise.role !== expectedRole)
        fail(
          "GYM_FUNCTION_MISMATCH",
          "Wariant siłowni ma inne zadanie i sposób zapisu niż zaplanowana rola.",
        );
      const actual =
        session.structuredSections
          ?.flatMap((section) => section.blocks.flatMap((block) => block.exercises))
          .filter((row) => row.exerciseId === exercise.exerciseId) ?? [];
      const doseText = d.seconds
        ? `${d.seconds} s${d.perSide ? " / stronę" : ""}`
        : `${d.reps}${d.perSide ? " / stronę" : ""}`;
      if (
        actual.length !== 1 ||
        stableJson(actual[0].engineDose) !== stableJson(d) ||
        actual[0].sets !== String(d.sets) ||
        actual[0].displayPrescription !== `${d.sets} × ${doseText}` ||
        (d.seconds ? actual[0].duration !== doseText : actual[0].reps !== doseText) ||
        parseRestDuration(actual[0]?.restAfterExercise ?? "") !== d.restSeconds
      )
        fail(
          "GYM_RENDERED_DOSE_MISMATCH",
          "Ekran ćwiczenia siłowni nie odpowiada zapisanej dawce silnika.",
        );
      if (exercise.role === "power") {
        const expected = gymPowerDose(exercise.exerciseId, profile, recipe.phase);
        if (
          d.seconds !== undefined ||
          d.distanceM !== undefined ||
          d.rir !== undefined ||
          d.intent !== "explosive" ||
          !Number.isInteger(d.reps) ||
          d.reps! < 2 ||
          d.reps! > expected.reps! ||
          d.sets > expected.sets ||
          Boolean(d.perSide) !== Boolean(expected.perSide) ||
          d.contactsPerRep !== 1 ||
          d.restSeconds < expected.restSeconds
        )
          fail(
            "GYM_POWER_DOSE",
            "Skoki wymagają małej zapisanej dawki, właściwych stron i pełnych przerw; nie dodawaj obciążenia przez samą zmianę tygodnia.",
          );
      }
      if (exercise.role === "hamstring_dynamic_support") {
        const expected = gymHamstringSupportDose(exercise.exerciseId, recipe.phase);
        if (
          d.seconds !== expected.seconds ||
          d.sets > expected.sets ||
          d.restSeconds < expected.restSeconds ||
          d.perSide
        )
          fail(
            "GYM_DYNAMIC_SUPPORT_DOSE",
            "Czas, liczba prób lub odpoczynek nie odpowiadają krótkiej pracy dynamicznej tyłu uda.",
          );
      }
    }
    if (GYM_EXERCISE_RULES[exercise.exerciseId] && !strength)
      fail(
        "GYM_TASK_OUTSIDE_STRENGTH",
        "Te warianty siłowni należą do sesji A/B, nie do biegania ani osobnej sesji mocy.",
      );
    if (
      [
        "gym_cmj_assisted",
        "gym_cmj_resisted",
        "gym_fast_band_curl",
        "gym_bridge_pulses",
        "gym_lateral_bound",
      ].includes(exercise.exerciseId) &&
      !gymSpecialWorkAllowed(profile, recipe.phase)
    )
      fail(
        "GYM_SPECIAL_WORK_ELIGIBILITY",
        "Zaawansowany wariant nie odpowiada poziomowi, fazie lub bieżącemu zakresowi planu.",
      );
    if (
      exercise.role === "hamstring_dynamic_support" &&
      (!d.seconds || d.reps !== undefined || d.intent !== "controlled" || d.rir !== undefined)
    )
      fail(
        "GYM_DYNAMIC_SUPPORT_DOSE",
        "Krótka praca dynamiczna tyłu uda wymaga czasu i kontroli; nie jest utrzymaniem, serią do upadku ani pomiarem siły.",
      );
    if (d.cluster) {
      if (
        !clusterEligible(profile, recipe.phase) ||
        !["knee_strength", "hip_strength"].includes(exercise.role) ||
        !["external", "axial"].includes(definition?.loadingType ?? "") ||
        !Array.isArray(d.cluster.repGroups) ||
        d.cluster.repGroups.length < 2 ||
        d.cluster.repGroups.some((r) => !Number.isInteger(r) || r !== 2) ||
        d.cluster.repGroups.reduce((a, b) => a + b, 0) !== d.reps ||
        d.cluster.intraRestSeconds !== 20 ||
        d.restSeconds < 120
      ) {
        fail(
          "INVALID_CLUSTER",
          "Klaster wymaga kwalifikacji, zgodnej liczby powtórzeń i obu rodzajów przerw.",
        );
        validArithmetic = false;
      }
    }
    if (
      !definition ||
      definition.approved === false ||
      definition.draft ||
      !isExerciseAllowedForProfile(definition, athlete).ok
    )
      fail("INELIGIBLE_EXERCISE", `Ćwiczenie nie przechodzi wymagań: ${exercise.exerciseId}.`);
    if (definition && sessionRequirementIssue(definition, profile, exercise.role))
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
    const nonnegative = [
      d.restSeconds,
      d.runInM,
      d.postRestSeconds,
      d.fastMetres,
      d.runOutM,
      d.contactsPerRep,
    ];
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
      (!d.seconds ||
        d.reps !== undefined ||
        d.distanceM !== undefined ||
        d.cluster !== undefined ||
        (["hamstring_iso", "quad_iso"].includes(exercise.role) && d.intent !== "hold"))
    )
      fail(
        "ISOMETRIC_DOSE_MISMATCH",
        "Izometria wymaga czasu bez powtórzeń ruchu, dystansu i klastrów. Utrzymanie pozycji wymaga intencji hold; nacisk na piny ma osobny protokół.",
      );
    const isometricAngle = FUNCTIONAL_CATALOGUE[exercise.exerciseId]?.jointAngleDegrees;
    if (
      FUNCTIONAL_CATALOGUE[exercise.exerciseId]?.contraction === "isometric" &&
      isometricAngle !== undefined &&
      d.jointAngleDegrees !== isometricAngle
    )
      fail(
        "ISOMETRIC_ANGLE_MISMATCH",
        "Kąt w dawce izometrii nie odpowiada konkretnemu wariantowi ćwiczenia. Nie zamieniaj ustawienia 30° na 90° ani nie usuwaj go z receptury.",
      );
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
  if (
    strength &&
    recipe.plyometricContacts !== undefined &&
    recipe.plyometricContacts !== strengthLandingCount(recipe.exercises)
  )
    fail(
      "STALE_STRENGTH_CONTACTS",
      "Suma lądowań skocznościowych nie odpowiada rzeczywistej liczbie prób i stron.",
    );
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
      primary.dose.restSeconds !== 30 ||
      power.dose.restSeconds !== 180 ||
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
    const masTest = isMasTestRecipe(run);
    if (masTest) {
      const why = masTestIneligibility(profile, session.date);
      if (why) fail("MAS_TEST_ELIGIBILITY", why);
      if (run.blocks.length !== 1 || run.blocks[0].work.seconds !== MAS_TEST_SECONDS)
        fail("MAS_TEST_RECIPE", "Test MAS to jeden równy odcinek 5 minut.");
    }
    if (
      timeline.hard &&
      !masTest &&
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
    if (run.method === "rsa" || (run.method === "field_mas_test" && !masTest))
      fail(
        "UNSUPPORTED_RUN_METHOD",
        "Ta receptura nie może zastępować zaplanowanej pracy tlenowej lub interwałowej.",
      );
  }
  if (recipe.sprintRecipeVersion === 1) {
    const circuits = recipe.exercises.filter((e) => e.dose.circuit);
    const first = circuits[0]?.dose;
    if (
      circuits.length !== 3 ||
      !first?.circuit ||
      !first.circuit.id ||
      circuits.some(
        (e) =>
          e.dose.circuit?.id !== first.circuit?.id ||
          e.dose.sets !== first.sets ||
          !Number.isFinite(e.dose.circuit?.roundRestSeconds) ||
          (e.dose.circuit?.roundRestSeconds ?? -1) < 0,
      ) ||
      first.sets < 1 ||
      first.sets > 3
    ) {
      fail(
        "INVALID_SPRINT_CIRCUIT",
        "Sprint wymaga trzech stałych drilli i zgodnej liczby 1–3 rund.",
      );
      return issues;
    }
    // The stored variant must be the one actually prescribed (set, main exercise, drill triple).
    const ref = recipe.sprintVariant;
    if (ref) {
      const variant = variantById(ref.mainVariantId);
      const set = drillSetById(ref.drillSetId);
      const main = recipe.exercises.find((e) => e.dose.speedStage === "main");
      const drills = recipe.exercises.filter((e) => e.dose.circuit).map((e) => e.exerciseId);
      if (
        !variant ||
        !set ||
        variant.goal !== ref.goal ||
        variant.goal !== recipe.sprintGoal ||
        main?.exerciseId !== variant.exerciseId ||
        stableJson(drills) !== stableJson(set.drills)
      )
        fail(
          "SPRINT_VARIANT_MISMATCH",
          "Zapisany wariant sprintu nie odpowiada ćwiczeniom i zestawowi drilli w recepturze.",
        );
    }
    const stages = recipe.exercises.map((e) => e.dose.speedStage);
    const mainIndex = stages.indexOf("main"),
      buildupIndex = stages.indexOf("buildup");
    if (
      stages[0] !== "preparation" ||
      stages.at(-1) !== "cooldown" ||
      mainIndex < 0 ||
      buildupIndex < 0 ||
      buildupIndex >= mainIndex ||
      stages.filter((s) => s === "main").length !== 1 ||
      stages.filter((s) => s === "addition").length > 1 ||
      recipe.exercises.some(
        (e, i) =>
          (e.dose.circuit && (e.dose.speedStage !== "technical" || i >= buildupIndex)) ||
          (e.dose.speedStage === "resisted" && i >= mainIndex),
      )
    )
      fail(
        "INVALID_SPRINT_STAGES",
        "Sprint wymaga kolejnego przygotowania, drilli, przebieżek, pracy głównej i zakończenia.",
      );
    const actual =
      session.structuredSections?.flatMap((s) => s.blocks.flatMap((b) => b.exercises)) ?? [];
    const expected = sprintChronology(recipe.exercises);
    if (
      actual.length !== expected.length ||
      actual.some(
        (e, i) =>
          e.exerciseId !== expected[i]?.exerciseId ||
          stableJson(e.engineDose) !== stableJson(expected[i]?.dose),
      )
    )
      fail(
        "SPRINT_CHRONOLOGY_MISMATCH",
        "Kolejność i dawka runnera muszą odpowiadać rundom receptury.",
      );
    if (
      recipe.exercises.some(
        (e) =>
          (["speed", "landing"].includes(e.role) || e.dose.speedStage === "buildup") &&
          e.dose.fastMetres !== undefined &&
          e.dose.fastMetres < (e.dose.distanceM ?? 0) + (e.dose.runInM ?? 0),
      )
    )
      fail("UNDERCOUNTED_SPRINT_METRES", "Szybkie metry muszą obejmować cały odcinek i nabieg.");
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
