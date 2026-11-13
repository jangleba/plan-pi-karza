import { describe, expect, it } from "vitest";
import {
  EMPTY_DAY_LOAD,
  buildRunningRecipe,
  fitRecipeToMinutes,
  maxHardRunsPerWeek,
  runningTierFor,
  scaleRunningRecipe,
  selectRunningRecipe,
  type RunningPlanContext,
} from "./prescription";
import { recipeMainSeconds, recipeTotalSeconds } from "./recipe";
import { recipeSections, recipeToProtocol } from "./recipeSession";
import { RUNNING_EVIDENCE } from "./evidence";

const ctx = (patch: Partial<RunningPlanContext> = {}): RunningPlanContext => ({
  date: "2026-11-18",
  age: 22,
  level: "intermediate",
  goal: "endurance",
  limiter: null,
  fieldMasKmh: null,
  fieldMasTestedAt: null,
  progressionLevel: 0,
  phase: "in_season",
  availableMin: 65,
  mdLabel: null,
  sameDay: EMPTY_DAY_LOAD,
  previousDay: EMPTY_DAY_LOAD,
  nextDay: EMPTY_DAY_LOAD,
  week: { hardRuns: 0, methods: [], lastMethod: null, matches: 1, clubSessions: 3 },
  doubleHeavyAllowed: true,
  ...patch,
});

describe("dobór metody biegu", () => {
  it("bez kolizji w tygodniu wybiera mocny bodziec zgodny z celem", () => {
    const selection = selectRunningRecipe(ctx({ goal: "endurance", phase: "base" }));
    expect(selection.tier).toBe("hard");
    expect(selection.method).toBe("aerobic_intervals");
  });

  it("w sezonie przy celu szybkość/gotowość meczowa preferuje krótkie interwały lub RSA", () => {
    const method = selectRunningRecipe(ctx({ goal: "matchready" })).method;
    expect(["short_hiit", "rsa"]).toContain(method);
  });

  it("nie powtarza sztywno tej samej metody — powtórzenie w tygodniu obniża jej priorytet", () => {
    const first = selectRunningRecipe(
      ctx({
        phase: "base",
        week: { hardRuns: 0, methods: [], lastMethod: null, matches: 0, clubSessions: 2 },
      }),
    );
    const second = selectRunningRecipe(
      ctx({
        phase: "base",
        week: {
          hardRuns: 1,
          methods: [first.method],
          lastMethod: first.method,
          matches: 0,
          clubSessions: 2,
        },
      }),
    );
    expect(second.method).not.toBe(first.method);
  });

  it("dzień przed i po meczu oraz dzień ciężkich nóg dają tylko spokojny bieg", () => {
    for (const patch of [
      { mdLabel: "MD-1" },
      { mdLabel: "MD+1" },
      { sameDay: { ...EMPTY_DAY_LOAD, heavyLegs: true }, doubleHeavyAllowed: false },
      { nextDay: { ...EMPTY_DAY_LOAD, match: true } },
    ] as Partial<RunningPlanContext>[]) {
      const selection = selectRunningRecipe(ctx(patch));
      expect(selection.tier).toBe("easy");
      expect(["easy_continuous", "long_continuous"]).toContain(selection.method);
    }
  });

  it("bieg po siłowni nóg u przygotowanego zawodnika jest co najwyżej umiarkowany", () => {
    const selection = selectRunningRecipe(
      ctx({
        sameDay: { ...EMPTY_DAY_LOAD, heavyLegs: true },
        doubleHeavyAllowed: true,
        availableMin: 40,
      }),
    );
    expect(selection.tier).toBe("moderate");
    expect(["tempo", "easy_continuous"]).toContain(selection.method);
  });

  it("dodatkowa sesja w dzień klubu to zawsze lekki bieg w limicie czasu", () => {
    const club = { ...EMPTY_DAY_LOAD, club: true };
    for (const doubleHeavyAllowed of [true, false]) {
      const selection = selectRunningRecipe(
        ctx({ sameDay: club, sharesDay: true, doubleHeavyAllowed, availableMin: 40 }),
      );
      expect(selection.tier).toBe("easy");
      expect(selection.method).toBe("easy_continuous");
      expect(recipeTotalSeconds(selection.recipe)).toBeLessThanOrEqual(40 * 60);
    }
  });

  it("druga sesja dnia u młodszego/początkującego jest lekka", () => {
    expect(runningTierFor(ctx({ sharesDay: true, doubleHeavyAllowed: false })).tier).toBe("easy");
  });

  it("RSA nigdy obok dnia sprintu i nigdy u początkujących ani dzieci", () => {
    const sprintNext = ctx({ goal: "speed", nextDay: { ...EMPTY_DAY_LOAD, sprint: true } });
    expect(selectRunningRecipe(sprintNext).method).not.toBe("rsa");
    expect(selectRunningRecipe(ctx({ goal: "speed", level: "beginner" })).method).not.toBe("rsa");
    expect(selectRunningRecipe(ctx({ goal: "speed", age: 11 })).method).not.toBe("rsa");
  });

  it("limit mocnych biegów zależy od okresu, wieku i meczów", () => {
    expect(maxHardRunsPerWeek(ctx({ phase: "transition" }))).toBe(0);
    expect(maxHardRunsPerWeek(ctx({ phase: "in_season" }))).toBe(1);
    expect(maxHardRunsPerWeek(ctx({ phase: "base" }))).toBe(2);
    expect(maxHardRunsPerWeek(ctx({ phase: "base", age: 14 }))).toBe(1);
    expect(maxHardRunsPerWeek(ctx({ phase: "base", age: 11 }))).toBe(1);
    expect(
      selectRunningRecipe(
        ctx({
          week: {
            hardRuns: 1,
            methods: ["short_hiit"],
            lastMethod: "short_hiit",
            matches: 1,
            clubSessions: 3,
          },
        }),
      ).tier,
    ).toBe("easy");
  });

  it("test 5 min nigdy nie jest wybierany automatycznie", () => {
    for (const goal of ["endurance", "speed", "general"] as const)
      for (const phase of ["base", "preseason", "in_season"] as const)
        expect(selectRunningRecipe(ctx({ goal, phase })).method).not.toBe("field_mas_test");
  });
});

describe("dawka i intensywność", () => {
  it("bez wyniku testu prowadzi czasem i RPE — bez wymyślonego tempa", () => {
    for (const method of [
      "easy_continuous",
      "tempo",
      "aerobic_intervals",
      "short_hiit",
      "rsa",
    ] as const) {
      const recipe = buildRunningRecipe(method, ctx());
      expect(recipe.paceSource).toBe("effort");
      for (const block of recipe.blocks) {
        expect(block.intensity.pace).toBeUndefined();
        expect(block.intensity.rpe[0]).toBeGreaterThan(0);
        expect(block.intensity.label).toMatch(/RPE|Sprint/);
      }
      const text = recipeSections(recipe)
        .main.map((e) => e.prescription)
        .join(" ");
      expect(text).not.toMatch(/\/km/);
    }
  });

  it("z aktualnym testem podaje tempo tylko dla odcinków mierzalnych GPS", () => {
    const tested = ctx({ fieldMasKmh: 15, fieldMasTestedAt: "2026-11-01" });
    const long = buildRunningRecipe("aerobic_intervals", tested);
    expect(long.paceSource).toBe("field_mas");
    expect(long.blocks[0].intensity.pace?.label).toBe("4:13–4:27/km");
    const short = buildRunningRecipe("short_hiit", tested);
    expect(short.blocks[0].intensity.pace).toBeUndefined();
    expect(short.blocks[0].workDistanceHintM).toEqual([65, 70]);
  });

  it("test starszy niż 28 dni nie daje tempa", () => {
    const old = buildRunningRecipe(
      "tempo",
      ctx({ fieldMasKmh: 15, fieldMasTestedAt: "2026-09-01" }),
    );
    expect(old.paceSource).toBe("effort");
  });

  it("progresja zmienia jedną zmienną na poziom i rośnie monotonicznie", () => {
    for (const method of [
      "easy_continuous",
      "tempo",
      "aerobic_intervals",
      "short_hiit",
      "rsa",
    ] as const) {
      let previous = -1;
      for (const level of [0, 1, 2, 3]) {
        const recipe = buildRunningRecipe(method, ctx({ progressionLevel: level }));
        const work = recipe.blocks[0];
        const volume = work.sets * work.repsPerSet * work.work.seconds;
        // RSA na poziomie 3 skraca cykl (krótsza przerwa) przy tej samej objętości.
        expect(volume).toBeGreaterThanOrEqual(previous);
        previous = volume;
      }
    }
  });

  it("młodsi dostają mniejszą dawkę niż dorośli w tej samej metodzie", () => {
    for (const method of ["easy_continuous", "aerobic_intervals", "short_hiit"] as const) {
      const adult = recipeMainSeconds(buildRunningRecipe(method, ctx({ age: 24 })));
      const youth = recipeMainSeconds(buildRunningRecipe(method, ctx({ age: 14 })));
      expect(youth).toBeLessThan(adult);
    }
  });

  it("dopasowanie do czasu zmniejsza objętość, a nie intensywność ani przerwy", () => {
    const full = buildRunningRecipe("aerobic_intervals", ctx({ progressionLevel: 3 }));
    const fitted = fitRecipeToMinutes(full, 35)!;
    expect(recipeTotalSeconds(fitted)).toBeLessThanOrEqual(35 * 60);
    expect(fitted.blocks[0].intensity).toEqual(full.blocks[0].intensity);
    expect(fitted.blocks[0].recovery).toEqual(full.blocks[0].recovery);
    expect(fitted.blocks[0].work.seconds).toBe(full.blocks[0].work.seconds);
    expect(fitted.reducedFrom).toBe(recipeTotalSeconds(full));
    expect(fitRecipeToMinutes(full, 10)).toBeNull();
  });

  it("„mniej czasu” skraca bieg przez receptury", () => {
    const full = buildRunningRecipe("short_hiit", ctx({ progressionLevel: 2 }));
    const half = scaleRunningRecipe(full, 0.6);
    expect(recipeTotalSeconds(half)).toBeLessThan(recipeTotalSeconds(full));
    expect(half.blocks[0].intensity).toEqual(full.blocks[0].intensity);
  });

  it("każda metoda ma źródła odpowiednie dla grupy", () => {
    for (const method of [
      "easy_continuous",
      "long_continuous",
      "tempo",
      "aerobic_intervals",
      "short_hiit",
      "rsa",
      "field_mas_test",
    ] as const) {
      const recipe = buildRunningRecipe(method, ctx());
      expect(recipe.evidence.length).toBeGreaterThan(0);
      for (const id of recipe.evidence) expect(RUNNING_EVIDENCE[id]).toBeDefined();
    }
    expect(buildRunningRecipe("short_hiit", ctx({ age: 14 })).evidence).toContain("engel2018");
    expect(buildRunningRecipe("rsa", ctx({ age: 15 })).evidence).toContain("buchheit2010rsa");
  });
});

describe("jedna receptura: opis = licznik = zapis", () => {
  it("licznik zawiera rozgrzewkę, wszystkie odcinki, przerwy, przerwy między seriami i schłodzenie", () => {
    const recipe = buildRunningRecipe("short_hiit", ctx({ progressionLevel: 3 }));
    const protocol = recipeToProtocol(recipe);
    const block = recipe.blocks[0];
    const work = protocol.steps.filter((s) => s.kind === "work");
    expect(protocol.steps[0].phase).toBe("warmup");
    expect(protocol.steps.at(-1)!.phase).toBe("cooldown");
    expect(work).toHaveLength(block.sets * block.repsPerSet);
    expect(
      work.every((s) => s.target.value === block.work.seconds && s.repeatTotal === work.length),
    ).toBe(true);
    expect(protocol.steps.filter((s) => s.label === "Przerwa między seriami")).toHaveLength(
      block.sets - 1,
    );
    const timed = protocol.steps.reduce((sum, s) => sum + (s.target.value ?? 0), 0);
    expect(timed).toBe(recipeTotalSeconds(recipe));
    expect(protocol.steps.every((s) => s.target.mode === "time" && s.target.autoAdvance)).toBe(
      true,
    );
  });

  it("opis pokazuje te same liczby co licznik", () => {
    const recipe = buildRunningRecipe("aerobic_intervals", ctx());
    const [main] = recipeSections(recipe).main;
    expect(main.prescription).toContain(`${recipe.blocks[0].repsPerSet} × 3 min`);
    expect(main.prescription).toContain("przerwa 3 min truchtu");
    expect(main.exerciseId).toBe("method_interval_run");
  });

  it("RSA prowadzi cyklem startu (sprint + powrót) i jest opisane jako sprint 20 m", () => {
    const recipe = buildRunningRecipe("rsa", ctx({ goal: "speed" }));
    const protocol = recipeToProtocol(recipe);
    const sprint = protocol.steps.find((s) => s.kind === "work")!;
    expect(sprint.target.label).toBe("20 m");
    expect(recipeSections(recipe).main[0].prescription).toMatch(/sprint 20 m, start co 25 s/);
  });
});
