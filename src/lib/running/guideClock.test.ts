import { describe, expect, it } from "vitest";
import {
  EMPTY_GUIDE_DRAFT,
  activeElapsed,
  advanceGuide,
  countdownSecond,
  finishGuide,
  guidePosition,
  parseGuideDraft,
  pauseGuide,
  skipGuideStep,
  startGuide,
} from "./guideClock";
import {
  crossedSteps,
  formatCountdown,
  isTimedProtocol,
  positionAt,
  repLabel,
  stageLabel,
  targetLabel,
} from "./guideTimeline";
import { planLockScreenCues, isRunCueId } from "./lockScreenCues";
import { stepAnnouncement } from "./runSignals";
import { recipeToProtocol } from "./recipeSession";
import { EMPTY_DAY_LOAD, selectRunningRecipe, type RunningPlanContext } from "./prescription";

const ctx = (patch: Partial<RunningPlanContext> = {}): RunningPlanContext => ({
  date: "2026-11-12",
  age: 20,
  level: "intermediate",
  goal: "endurance",
  limiter: null,
  progressionLevel: 0,
  phase: "preseason",
  availableMin: 60,
  mdLabel: null,
  sameDay: EMPTY_DAY_LOAD,
  previousDay: EMPTY_DAY_LOAD,
  nextDay: EMPTY_DAY_LOAD,
  week: { hardRuns: 0, methods: [], lastMethod: null, matches: 0, clubSessions: 0 },
  doubleHeavyAllowed: false,
  ...patch,
});

const intervals = () => {
  const recipe = selectRunningRecipe(ctx()).recipe;
  return { recipe, protocol: recipeToProtocol(recipe) };
};
const T0 = 1_800_000_000_000;

describe("oś czasu receptury", () => {
  it("receptura daje protokół w pełni czasowy z etapami i numerami odcinków", () => {
    const { recipe, protocol } = intervals();
    expect(isTimedProtocol(protocol)).toBe(true);
    expect(stageLabel(protocol.steps[0])).toBe("Rozgrzewka");
    expect(stageLabel(protocol.steps.at(-1)!)).toBe("Schłodzenie");
    const work = protocol.steps.find((s) => s.kind === "work" && s.phase === "main")!;
    expect(["Bieg", "Sprint"]).toContain(stageLabel(work));
    expect(repLabel(work)).toMatch(/^Odcinek 1\//);
    // Bez wyniku testu cel to odczuwany wysiłek, nie tempo.
    expect(recipe.paceSource).toBe("effort");
    expect(targetLabel(work)).toBe(work.effort?.label);
  });

  it("pozycja i przekroczone kroki wynikają tylko z czasu", () => {
    const { protocol } = intervals();
    const warm = protocol.steps[0].target.value!;
    expect(positionAt(protocol, warm - 1).index).toBe(0);
    expect(positionAt(protocol, warm).index).toBe(1);
    expect(positionAt(protocol, 1e6).done).toBe(true);
    expect(crossedSteps(protocol, 0, warm + 1).map((s) => s.index)).toEqual([0]);
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(3725)).toBe("1:02:05");
  });
});

describe("licznik na zegarze ściennym", () => {
  it("czas biegnie bez ticków (ekran zablokowany) i wszystkie kroki trafiają do wyników raz", () => {
    const { protocol } = intervals();
    const warm = protocol.steps[0].target.value!;
    const work = protocol.steps[1].target.value!;
    let draft = startGuide(EMPTY_GUIDE_DRAFT, T0);
    const later = T0 + (warm + work + 1) * 1000;
    const step = advanceGuide(protocol, draft, later);
    expect(step.added.map((r) => [r.number, r.kind])).toEqual([
      [1, "run_rest"],
      [2, "run_clock"],
    ]);
    draft = step.draft;
    expect(advanceGuide(protocol, draft, later).changed).toBe(false);
    expect(guidePosition(protocol, draft, later).index).toBe(2);
  });

  it("pauza zatrzymuje czas biegu", () => {
    const { protocol } = intervals();
    let draft = startGuide(EMPTY_GUIDE_DRAFT, T0);
    draft = pauseGuide(draft, T0 + 30_000);
    expect(activeElapsed(draft, T0 + 600_000)).toBe(30);
    expect(guidePosition(protocol, draft, T0 + 600_000).stepElapsedSec).toBe(30);
    draft = startGuide(draft, T0 + 600_000);
    expect(activeElapsed(draft, T0 + 610_000)).toBe(40);
  });

  it("pominięcie kroku zapisuje część i przechodzi do następnego", () => {
    const { protocol } = intervals();
    const draft = startGuide(EMPTY_GUIDE_DRAFT, T0);
    const skipped = skipGuideStep(protocol, draft, T0 + 20_000);
    expect(skipped.added).toEqual([{ number: 1, seconds: 20, kind: "run_rest", saved: false }]);
    const at = guidePosition(protocol, skipped.draft, T0 + 20_000);
    expect(at.index).toBe(1);
    expect(at.stepElapsedSec).toBe(0);
    // Pominięty czas nie liczy się do czasu biegu.
    expect(activeElapsed(skipped.draft, T0 + 20_000)).toBe(20);
    // Kolejny przebieg nie dubluje rozgrzewki.
    expect(advanceGuide(protocol, skipped.draft, T0 + 25_000).changed).toBe(false);
  });

  it("zakończenie w trakcie odcinka zapisuje go jako częściowy", () => {
    const { protocol } = intervals();
    const warm = protocol.steps[0].target.value!;
    const done = finishGuide(protocol, startGuide(EMPTY_GUIDE_DRAFT, T0), T0 + (warm + 10) * 1000);
    expect(done.draft.finished).toBe(true);
    expect(done.draft.runningSince).toBeNull();
    expect(done.added.at(-1)).toMatchObject({ number: 2, seconds: 10, kind: "run_clock_partial" });
  });

  it("koniec receptury kończy bieg i zamraża czas", () => {
    const { protocol } = intervals();
    const total = protocol.steps.reduce((s, x) => s + (x.target.value ?? 0), 0);
    const done = advanceGuide(
      protocol,
      startGuide(EMPTY_GUIDE_DRAFT, T0),
      T0 + (total + 50) * 1000,
    );
    expect(done.draft.finished).toBe(true);
    expect(activeElapsed(done.draft, T0 + 9e6)).toBe(total);
    expect(done.added).toHaveLength(protocol.steps.length);
  });

  it("odlicza 3-2-1 tylko przed odcinkiem", () => {
    const { protocol } = intervals();
    const restIndex = protocol.steps.findIndex(
      (s, i) => s.kind === "recovery" && protocol.steps[i + 1]?.kind === "work",
    );
    const start = protocol.steps.slice(0, restIndex).reduce((s, x) => s + (x.target.value ?? 0), 0);
    const end = start + protocol.steps[restIndex].target.value!;
    expect(countdownSecond(protocol, positionAt(protocol, end - 2.5))).toBe(3);
    expect(countdownSecond(protocol, positionAt(protocol, end - 0.5))).toBe(1);
    expect(countdownSecond(protocol, positionAt(protocol, end - 10))).toBeNull();
    const workEnd = start - 1;
    expect(countdownSecond(protocol, positionAt(protocol, workEnd))).toBeNull();
  });

  it("odrzuca uszkodzony szkic", () => {
    expect(parseGuideDraft(EMPTY_GUIDE_DRAFT)).toEqual(EMPTY_GUIDE_DRAFT);
    expect(parseGuideDraft({ ...EMPTY_GUIDE_DRAFT, activeSec: -1 })).toBeUndefined();
    expect(parseGuideDraft({ ...EMPTY_GUIDE_DRAFT, v: 1 })).toBeUndefined();
    expect(
      parseGuideDraft({
        ...EMPTY_GUIDE_DRAFT,
        results: [{ number: 1, seconds: 5, kind: "x", saved: false }],
      }),
    ).toBeUndefined();
  });
});

describe("sygnały przy zablokowanym ekranie", () => {
  it("planuje jedno powiadomienie na każdą przyszłą zmianę kroku", () => {
    const { protocol } = intervals();
    const warm = protocol.steps[0].target.value!;
    const cues = planLockScreenCues(protocol, 10, T0);
    expect(cues).toHaveLength(protocol.steps.length);
    expect(cues[0].at).toBe(T0 + (warm - 10) * 1000);
    expect(cues[0].title).toBe(stageLabel(protocol.steps[1]));
    expect(cues.at(-1)?.title).toBe("Koniec biegu");
    expect(cues.every((c) => isRunCueId(c.id))).toBe(true);
    expect(new Set(cues.map((c) => c.id)).size).toBe(cues.length);
  });

  it("nie przekracza limitu iOS i pomija kroki już za nami", () => {
    const rsa = selectRunningRecipe(
      ctx({ age: 24, level: "advanced", phase: "in_season", goal: "speed", progressionLevel: 3 }),
    ).recipe;
    const protocol = recipeToProtocol(rsa);
    const cues = planLockScreenCues(protocol, 0, T0);
    expect(cues.length).toBeLessThanOrEqual(48);
    const half = protocol.steps.slice(0, 3).reduce((s, x) => s + (x.target.value ?? 0), 0);
    expect(planLockScreenCues(protocol, half, T0).every((c) => c.at > T0)).toBe(true);
  });

  it("komunikat głosowy mówi etap, numer odcinka i cel", () => {
    const { protocol } = intervals();
    const work = protocol.steps[1];
    expect(stepAnnouncement(work)).toMatch(/^(Bieg|Sprint), Odcinek 1 z /);
    expect(stepAnnouncement(null)).toBe("Koniec. Dobra robota.");
  });
});
