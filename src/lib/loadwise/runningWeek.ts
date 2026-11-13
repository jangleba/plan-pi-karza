import { isFieldMasCurrent } from "@/lib/running/engine";
import {
  EMPTY_DAY_LOAD,
  buildRunningRecipe,
  selectRunningRecipe,
  type RunningDayLoad,
  type RunningPhase,
  type RunningPlanContext,
} from "@/lib/running/prescription";
import type { RunningMethod, RunningRecipe } from "@/lib/running/recipe";
import { applyRunningRecipe, sessionRunningRecipe } from "@/lib/running/recipeSession";
import { isTrackableEnduranceRun } from "@/lib/running/session";
import { qualifiesForDoubleHeavy } from "./doubleHeavyPolicy";
import { mondayOf, offseasonStageForWeek } from "./offseasonPeriod";
import {
  classifySession,
  isClubSession,
  isEnduranceSession,
  isHeavyLegsSession,
  isMatchSession,
  isSpeedSession,
  normalizeSessionCategory,
} from "./sessionClassification";
import { computeLoadTags } from "./sessionLoadTags";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "./exerciseLibrary";
import { hasRealSpeedExposure } from "./speedLoad";
import type { Profile, SessionDay } from "./types";

/**
 * Ostatni krok planu dla biegania: każda sesja biegowa dostaje recepturę
 * dobraną do całego tygodnia (klub, mecz, siła, sprint, poprzednie biegi).
 * Kolejne biegi nie są wybierane po numerze sesji — o metodzie decydują
 * potrzeby i kolizje tygodnia.
 */

const LOWER_LIMB_PAIN = new Set(["knee", "ankle", "hamstring", "groin", "hip"]);
const NOT_RUN_SUBCATEGORIES = new Set([
  "bike_conditioning",
  "pool_conditioning",
  "low_impact_conditioning",
  "field_mas_test",
]);

function slots(day: SessionDay | undefined): SessionDay[] {
  if (!day) return [];
  return [day, day.secondSession].filter(Boolean) as SessionDay[];
}

function hardRecipe(recipe: RunningRecipe | null): boolean {
  return !!recipe && recipe.loadLevel === "high";
}

function dayLoad(day: SessionDay | undefined, except?: SessionDay): RunningDayLoad {
  const sessions = slots(day).filter((s) => s !== except && !s.isUnavailable);
  if (!sessions.length) return EMPTY_DAY_LOAD;
  return {
    club: sessions.some(isClubSession),
    match: sessions.some(isMatchSession),
    heavyLegs: sessions.some(isHeavyLegsSession),
    sprint: sessions.some((s) => isSpeedSession(s) || hasRealSpeedExposure(s)),
    hardRun: sessions.some(
      (s) =>
        hardRecipe(sessionRunningRecipe(s)) ||
        (isEnduranceSession(s) && !sessionRunningRecipe(s) && s.intensity === "wysoka"),
    ),
  };
}

/** Czy tę sesję prowadzi silnik receptur (bieg, nie rower/basen/test wybrany przez zawodnika). */
export function isRecipeManagedRun(session: SessionDay): boolean {
  if (session.executionProtected || session.isUnavailable) return false;
  if (session.trainingMethods?.selection === "athlete") return false;
  if (!isTrackableEnduranceRun(session)) return false;
  const c = session.classification ?? classifySession(session);
  return c.category === "endurance_conditioning" && !NOT_RUN_SUBCATEGORIES.has(c.subcategory);
}

function phaseFor(profile: Profile, date: string): RunningPhase {
  const stage = offseasonStageForWeek(profile, date);
  return stage === "base" ? "base" : (stage ?? "in_season");
}

function availableMinutes(profile: Profile, second: boolean, clubDay: boolean): number {
  const age = profile.age ?? 14;
  const base = age <= 12 ? 30 : age <= 15 ? 50 : 65;
  return second || clubDay ? Math.min(base, 40) : base;
}

function forceEasyFor(profile: Profile, session: SessionDay): boolean {
  const pain = [...(profile.painLocations ?? []), ...(profile.injuryHistory ?? [])];
  return Boolean(
    profile.painInjury ||
    (profile.painLocations ?? []).some((p) => LOWER_LIMB_PAIN.has(p)) ||
    (pain.length > 0 && profile.seasonPhase === "return_injury") ||
    profile.goal === "return" ||
    profile.secondaryLimiter === "fatigue" ||
    /wersji lekkiej/i.test(session.safetyNote ?? ""),
  );
}

export function buildRunningContext(input: {
  profile: Profile;
  session: SessionDay;
  day: SessionDay;
  previousDay?: SessionDay;
  nextDay?: SessionDay;
  second: boolean;
  week: RunningPlanContext["week"];
}): RunningPlanContext {
  const { profile, session, day } = input;
  const sameDay = dayLoad(day, session);
  return {
    date: session.date,
    age: profile.age,
    level: profile.level,
    goal: profile.goal,
    limiter: profile.secondaryLimiter ?? null,
    fieldMasKmh: profile.fieldMasKmh ?? null,
    fieldMasTestedAt: profile.fieldMasTestedAt ?? null,
    progressionLevel: profile.runningProgressionLevel ?? 0,
    phase: phaseFor(profile, session.date),
    availableMin: availableMinutes(profile, input.second, sameDay.club),
    mdLabel: session.mdLabel ?? day.mdLabel ?? null,
    sameDay,
    previousDay: dayLoad(input.previousDay),
    nextDay: dayLoad(input.nextDay),
    week: input.week,
    doubleHeavyAllowed: qualifiesForDoubleHeavy(profile),
    forceEasy: forceEasyFor(profile, session),
    sharesDay: input.second || sameDay.club,
  };
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

/** Przypisuje receptury wszystkim biegom planu, w kolejności dat. Zwraca nowy plan. */
export function prescribeRunningWeek(plan: SessionDay[], profile: Profile): SessionDay[] {
  const out = plan.map((day) => ({ ...day }));
  const weekState = new Map<
    string,
    { hardRuns: number; methods: RunningMethod[]; lastMethod: RunningMethod | null }
  >();
  const weekCounts = new Map<string, { matches: number; clubSessions: number }>();
  for (const day of out) {
    const key = mondayOf(day.date);
    const counts = weekCounts.get(key) ?? { matches: 0, clubSessions: 0 };
    for (const s of slots(day)) {
      if (isMatchSession(s)) counts.matches += 1;
      if (isClubSession(s)) counts.clubSessions += 1;
    }
    weekCounts.set(key, counts);
  }

  out.forEach((day, index) => {
    const key = mondayOf(day.date);
    const state = weekState.get(key) ?? { hardRuns: 0, methods: [], lastMethod: null };
    weekState.set(key, state);
    const assign = (session: SessionDay, second: boolean): SessionDay => {
      const existing = sessionRunningRecipe(session);
      if (!isRecipeManagedRun(session)) {
        if (existing) {
          state.methods.push(existing.method);
          state.lastMethod = existing.method;
          if (hardRecipe(existing)) state.hardRuns += 1;
        }
        return session;
      }
      const ctx = buildRunningContext({
        profile,
        session,
        day: out[index],
        previousDay: out[index - 1],
        nextDay: out[index + 1],
        // Kolejność slotów ustala się później (siła przed biegiem), więc liczy się
        // to, czy w tym dniu jest druga własna sesja, a nie numer slotu.
        second: second || slots(out[index]).length > 1,
        week: { ...state, methods: [...state.methods], ...weekCounts.get(key)! },
      });
      const { recipe } = selectRunningRecipe(ctx);
      state.methods.push(recipe.method);
      state.lastMethod = recipe.method;
      if (hardRecipe(recipe)) state.hardRuns += 1;
      return rebuild(session, recipe);
    };
    const primary = assign(day, false);
    const secondSession = day.secondSession ? assign(day.secondSession, true) : null;
    out[index] = {
      ...primary,
      secondSession: day.secondSession ? secondSession : day.secondSession,
    };
  });
  return out;
}

/** Profil ma ważny wynik testu 5 min (tempo z testu, nie z założeń). */
export function profileHasCurrentMas(profile: Profile, date: string): boolean {
  return (
    typeof profile.fieldMasKmh === "number" && isFieldMasCurrent(profile.fieldMasTestedAt, date)
  );
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
