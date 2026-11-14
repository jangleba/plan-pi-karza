import { recipeTotalSeconds, type RunningRecipe, type RunIntensity } from "@/lib/running/recipe";
import type { Profile } from "../types";
import { resolveGoalPolicy } from "./goalPolicy";
import { trainingTier, type EngineSession } from "./model";
import { hasCurrentVerifiedMas } from "./endurance";

/** A voluntary field MAS test the engine itself prepared; no other recipe may use this id. */
export const MAS_TEST_ID_PREFIX = "v2:mas-test:";
export const MAS_TEST_SECONDS = 300;
export const isMasTestRecipe = (run: Pick<RunningRecipe, "id" | "method"> | null | undefined) =>
  !!run && run.method === "field_mas_test" && run.id.startsWith(MAS_TEST_ID_PREFIX);

/** Who may be offered the test. Conservative product rules, not a medical clearance. */
export function masTestIneligibility(p: Profile, date: string): string | null {
  if (p.painInjury || p.seasonPhase === "return_injury")
    return "Test maksymalnego wysiłku nie jest układany przy zgłoszonym bólu lub powrocie po urazie.";
  if (p.age < 16 || !["intermediate", "advanced", "elite"].includes(p.level))
    return "Test 5-minutowy wymaga co najmniej 16 lat i potwierdzonego przygotowania sportowego.";
  if (resolveGoalPolicy(p).reduced) return "Test nie jest układany w trybie powrotu lub zmęczenia.";
  if (!p.hasPitch) return "Test wymaga boiska lub miejsca do równego biegu.";
  if (hasCurrentVerifiedMas(p, date))
    return `Aktualny wynik testu (z ${p.fieldMasTestedAt}) jest nadal ważny.`;
  return null;
}

export function buildMasTestSession(p: Profile, date: string): EngineSession {
  const easy: RunIntensity = {
    zone: "easy",
    rpe: [3, 4],
    label: "Swobodny oddech; rozmawiasz pełnymi zdaniami.",
  };
  const test: RunIntensity = {
    zone: "test",
    rpe: [9, 10],
    label: "Równy, maksymalny wysiłek, który utrzymasz przez pełne 5 minut.",
  };
  const run: RunningRecipe = {
    schema: "ballwise-run-recipe-v1",
    id: `${MAS_TEST_ID_PREFIX}${date}`,
    method: "field_mas_test",
    title: "Test terenowego MAS",
    population: p.age < 18 ? "late_youth" : "adult",
    level: 0,
    paceSource: "effort",
    warmup: {
      seconds: 600,
      label: "Rozgrzewka",
      instruction: "Marsz, lekki trucht i dwie krótkie przebieżki; bez zmęczenia przed testem.",
      intensity: easy,
    },
    blocks: [
      {
        id: "mas-test",
        label: "Test 5 min",
        sets: 1,
        repsPerSet: 1,
        work: { seconds: MAS_TEST_SECONDS, label: "5 min równo i szybko" },
        intensity: test,
        recovery: { seconds: 0, mode: "walk" },
        setRest: null,
        cue: "Zacznij kontrolowanie i utrzymaj możliwie równe tempo. Wynik wymaga dystansu z GPS.",
      },
    ],
    cooldown: {
      seconds: 300,
      label: "Schłodzenie",
      instruction: "Zwolnij do marszu i uspokój oddech.",
      intensity: easy,
    },
    intensity: "wysoka",
    loadLevel: "high",
    evidence: ["berthon1997", "foster2001"],
    reasons: [
      "Dobrowolny test 5-minutowy ustala Twoje tempo do kolejnych biegów. RPE nie jest pomiarem MAS.",
      "Wynik powstaje dopiero z zapisanego dystansu i czasu; zegar bez dystansu nie potwierdza tempa.",
    ],
  };
  return {
    roles: ["endurance"],
    tier: trainingTier(p),
    // Maximal running is treated as high load: it keeps its distance from heavy leg days.
    highLower: true,
    exercises: [
      {
        exerciseId: "field_mas_5_min_test",
        role: "endurance",
        dose: { sets: 1, seconds: MAS_TEST_SECONDS, restSeconds: 0, intent: "controlled" },
        reason: "Cel ćwiczenia: ustalenie własnego tempa biegowego testem 5-minutowym.",
      },
    ],
    missing: [],
    minutes: Math.ceil(recipeTotalSeconds(run) / 60),
    sprintMetres: 0,
    phase: "development",
    runningRecipe: run,
  };
}
