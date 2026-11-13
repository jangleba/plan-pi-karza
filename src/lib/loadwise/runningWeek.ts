import { EMPTY_DAY_LOAD, buildRunningRecipe, type RunningPhase } from "@/lib/running/prescription";
import type { RunningRecipe } from "@/lib/running/recipe";
import { applyRunningRecipe } from "@/lib/running/recipeSession";
import { offseasonStageForWeek } from "./offseasonPeriod";
import { normalizeSessionCategory } from "./sessionClassification";
import { computeLoadTags } from "./sessionLoadTags";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "./exerciseLibrary";
import type { Profile, SessionDay } from "./types";

/**
 * Test 5 min (MAS) jako dobrowolna zamiana zaplanowanego biegu.
 * Tygodniowy dobór receptur biegowych (prescribeRunningWeek) usunięto razem
 * z silnikiem układania tygodnia.
 */

const LOWER_LIMB_PAIN = new Set(["knee", "ankle", "hamstring", "groin", "hip"]);

function phaseFor(profile: Profile, date: string): RunningPhase {
  const stage = offseasonStageForWeek(profile, date);
  return stage === "base" ? "base" : (stage ?? "in_season");
}

function rebuild(session: SessionDay, recipe: RunningRecipe): SessionDay {
  const next = normalizeSessionCategory(applyRunningRecipe(session, recipe));
  if (next.classification) {
    next.classification = {
      ...next.classification,
      loadLevel: recipe.loadLevel,
      generatedBy: session.classification?.generatedBy ?? next.classification.generatedBy,
      placementReason:
        session.classification?.placementReason ?? next.classification.placementReason,
      repairTag: session.classification?.repairTag,
    };
  }
  return { ...next, loadTags: computeLoadTags(next) };
}

/** Czy zawodnik może dobrowolnie wykonać test 5 min (wiek, ból, wymagania ćwiczenia). */
export function fieldMasTestAvailable(profile: Profile): { ok: boolean; reason: string | null } {
  if (profile.painInjury || (profile.painLocations ?? []).some((p) => LOWER_LIMB_PAIN.has(p)))
    return { ok: false, reason: "Przy zgłoszonym bólu nóg test maksymalny nie jest dostępny." };
  const gate = isExerciseAllowedForProfile(
    getExerciseDefinition("field_mas_5_min_test"),
    buildAthleteTrainingProfile(profile),
  );
  return gate.ok ? { ok: true, reason: null } : { ok: false, reason: gate.reasons.join(" ") };
}

/**
 * Test 5 min na wyraźną prośbę zawodnika, w miejscu zaplanowanego biegu.
 * Pominięcie testu niczego nie blokuje — plan prowadzi wtedy czasem i RPE.
 */
export function buildFieldMasTestSession(session: SessionDay, profile: Profile): SessionDay {
  const available = fieldMasTestAvailable(profile);
  if (!available.ok) throw new Error(available.reason ?? "Test nie jest dostępny.");
  if (session.executionProtected) throw new Error("Rozpoczętej sesji nie zamieniamy na test.");
  const recipe = buildRunningRecipe(
    "field_mas_test",
    {
      date: session.date,
      age: profile.age,
      level: profile.level,
      goal: profile.goal,
      progressionLevel: profile.runningProgressionLevel ?? 0,
      fieldMasKmh: profile.fieldMasKmh ?? null,
      fieldMasTestedAt: profile.fieldMasTestedAt ?? null,
      phase: phaseFor(profile, session.date),
      availableMin: 60,
      sameDay: EMPTY_DAY_LOAD,
      previousDay: EMPTY_DAY_LOAD,
      nextDay: EMPTY_DAY_LOAD,
      week: { hardRuns: 0, methods: [], lastMethod: null, matches: 0, clubSessions: 0 },
      doubleHeavyAllowed: false,
    },
    ["wybór zawodnika"],
  );
  const next = rebuild({ ...session, trainingMethods: undefined }, recipe);
  return {
    ...next,
    safetyNote: "Test dobrowolny. Przerwij przy bólu, zawrotach głowy lub bólu w klatce.",
  };
}
