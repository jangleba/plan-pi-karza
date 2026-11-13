import { describe, expect, it } from "vitest";
import type { TrainingExercise, TrainingSection } from "../types";
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";
import { buildRunnerSteps, firstOpenStepIndex, occurrenceLogKey, runnerProgress } from "./steps";
import {
  doseLine,
  effortLine,
  isUnilateral,
  restSecondsAfter,
  restText,
  setRange,
  taskKind,
  workSeconds,
} from "./presentation";
import {
  extendCountdown,
  formatClock,
  parseCountdown,
  pauseCountdown,
  remainingSeconds,
  resumeCountdown,
  startCountdown,
} from "./countdown";
import { boutAt, boutTargets, canFinishEarly, isComplete, parseBoutProgress } from "./boutProgress";
import { sessionHeading, slotLabels } from "./heading";
import { resolveHowTo } from "./howTo";

const ex = (over: Partial<TrainingExercise>): TrainingExercise => ({
  id: "x",
  name: "Ćwiczenie",
  ...over,
});

describe("kroki sesji", () => {
  const sections: TrainingSection[] = [
    sectionFixture("warmup", [ex({ id: "w1", exerciseId: "a_skip", name: "Skip A" })]),
    sectionFixture("main", [
      ex({ id: "m1", exerciseId: "a_skip", name: "Skip A — runda 2" }),
      ex({ id: "m2", exerciseId: "goblet_squat", name: "Przysiad" }),
    ]),
  ];

  it("każde wystąpienie ma własny klucz i własny klucz zapisu", () => {
    const steps = buildRunnerSteps(sections);
    const rows = steps.flatMap((s) => s.rows);
    expect(rows.map((r) => r.key)).toEqual([
      "warmup/warmup-block/w1",
      "main/main-block/m1",
      "main/main-block/m2",
    ]);
    expect(rows.map((r) => r.occurrence)).toEqual([1, 2, 1]);
    expect(occurrenceLogKey(rows[1])).toBe(`${occurrenceLogKey(rows[0])}#2`);
  });

  it("powtórzone id instancji ze starego planu nie skleja wystąpień", () => {
    const dup = [sectionFixture("main", [ex({ id: "same" }), ex({ id: "same" })])];
    const keys = buildRunnerSteps(dup).map((s) => s.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("start prowadzi do pierwszego niewykonanego zadania, łącznie z rozgrzewką", () => {
    const steps = buildRunnerSteps(sections);
    expect(firstOpenStepIndex(steps, () => false)).toBe(0);
    expect(firstOpenStepIndex(steps, (row) => row.section.type === "warmup")).toBe(1);
    expect(firstOpenStepIndex(steps, () => true)).toBe(steps.length - 1);
  });

  it("licznik i pasek liczą tylko faktyczne oznaczenia; pominięcie jest osobne", () => {
    const steps = buildRunnerSteps(sections);
    const progress = runnerProgress(steps, (row) =>
      row.exercise.id === "w1" ? "done" : row.exercise.id === "m1" ? "skipped" : "open",
    );
    expect(progress).toEqual({ done: 1, skipped: 1, total: 3 });
  });

  it("para to tylko jawna para; skopiowana przerwa serii nie tworzy pary", () => {
    const legacy: TrainingSection = {
      ...sectionFixture("main", [
        ex({ id: "a", restAfterPair: "Przerwa 30 s" }),
        ex({ id: "b", restAfterPair: "Przerwa 30 s" }),
      ]),
    };
    expect(buildRunnerSteps([legacy]).map((s) => s.kind)).toEqual(["single", "single"]);
    const pair: TrainingSection = {
      ...legacy,
      blocks: [{ ...legacy.blocks[0], blockType: "superset" }],
    };
    expect(buildRunnerSteps([pair]).map((s) => s.kind)).toEqual(["linked"]);
  });
});

describe("prezentacja dawki", () => {
  it("RIR pojawia się raz, poza linią dawki", () => {
    const squat = ex({ exerciseId: "goblet_squat", sets: "3", reps: "5", rir: "3–4 RIR" });
    expect(doseLine(squat)).not.toMatch(/RIR/);
    expect(effortLine(squat, "load")).toBe("Zapas 3–4 powt.");
  });

  it("moc i lądowania mają kryterium jakości zamiast RIR, także w starszym planie", () => {
    const jump = ex({ exerciseId: "snap_down", name: "Lądowanie snap-down", rir: "2 RIR" });
    expect(effortLine(jump, "power")).toBe("Jakość: ciche, stabilne lądowanie");
    expect(effortLine(ex({ loadTarget: "Maksymalna wysokość" }), "power")).toBe(
      "Jakość: maksymalna wysokość",
    );
    expect(effortLine(ex({ rir: "2" }), "sprint")).toBeNull();
  });

  it("odpoczynek formatowany w jednym miejscu, bez „Przerwa Przerwa”", () => {
    expect(restText("Przerwa 30 s")).toBe("Przerwa 30 s");
    expect(restText("30 s")).toBe("Przerwa 30 s");
    expect(restText("bez przerw — płynnie")).toBe("Bez przerw — płynnie");
    expect(restText("—")).toBeNull();
    expect(restText("")).toBeNull();
  });

  it("odpoczynek w parze: najpierw do partnera, potem po parze", () => {
    const block = sectionFixture("main", []).blocks[0];
    const a1 = ex({ restAfterExercise: "60 s do A2", restAfterPair: "2 min po parze" });
    expect(restSecondsAfter(block, a1, true, true)).toBe(60);
    expect(restSecondsAfter(block, a1, true, false)).toBe(120);
    expect(
      restSecondsAfter(block, ex({ restAfterExercise: "Bez przerw" }), false, false),
    ).toBeNull();
  });

  it("jednostronność rozpoznawana z dawki", () => {
    expect(isUnilateral(ex({ reps: "8 / stronę" }))).toBe(true);
    expect(isUnilateral(ex({ reps: "30 s na każdą nogę" }))).toBe(true);
    expect(isUnilateral(ex({ reps: "10" }))).toBe(false);
  });

  it("zakres serii zostaje zakresem", () => {
    expect(setRange(ex({ sets: "2–3" }))).toEqual({ min: 2, max: 3 });
    expect(setRange(ex({ sets: "4" }))).toEqual({ min: 4, max: 4 });
  });

  it("czas pracy tylko z jednoznacznej dawki", () => {
    expect(workSeconds(ex({ duration: "3 min" }))).toBe(180);
    expect(workSeconds(ex({ reps: "30 s" }))).toBe(30);
    expect(workSeconds(ex({ displayPrescription: "6 × 45 s" }))).toBe(45);
    expect(workSeconds(ex({ reps: "10" }))).toBeNull();
  });

  it("ćwiczenie z masą ciała nie dostaje pola na ciężar", () => {
    const main = sectionFixture("main", []);
    expect(taskKind(ex({ name: "Pompki", sets: "3", reps: "10" }), main, "strength")).not.toBe(
      "load",
    );
  });
});

describe("odliczanie względem czasu zakończenia", () => {
  it("po powrocie z tła pokazuje prawdziwy pozostały czas", () => {
    const c = startCountdown(90, "Przerwa", 1_000_000);
    expect(remainingSeconds(c, 1_000_000)).toBe(90);
    // Telefon zablokowany na 60 s: żaden interwał nie tykał.
    expect(remainingSeconds(c, 1_060_000)).toBe(30);
    expect(remainingSeconds(c, 2_000_000)).toBe(0);
  });

  it("pauza zamraża czas, wznowienie liczy od nowa od teraz", () => {
    const c = startCountdown(60, "Praca", 0);
    const paused = pauseCountdown(c, 20_000);
    expect(remainingSeconds(paused, 500_000)).toBe(40);
    const resumed = resumeCountdown(paused, 500_000);
    expect(remainingSeconds(resumed, 510_000)).toBe(30);
    expect(remainingSeconds(extendCountdown(resumed, 30, 510_000), 510_000)).toBe(60);
  });

  it("skrócenie przerwy nie schodzi poniżej zera, a zapisany stan pozostaje poprawny", () => {
    const rest = startCountdown(20, "Następnie: seria 2 z 3", 1000, 1000, {
      detail: "60 kg × 8",
      stepKey: "m1",
    });
    const shorter = extendCountdown(rest, -15, 1000);
    expect(remainingSeconds(shorter, 1000)).toBe(5);
    const gone = extendCountdown(shorter, -15, 1000);
    expect(remainingSeconds(gone, 1000)).toBe(0);
    expect(parseCountdown(JSON.parse(JSON.stringify(gone)))).toMatchObject({
      detail: "60 kg × 8",
      stepKey: "m1",
    });
    expect(parseCountdown({ ...rest, detail: 5 })).toBeUndefined();
  });

  it("format i walidacja zapisanego stanu", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(parseCountdown(startCountdown(30, "x", 5))).toBeDefined();
    expect(parseCountdown({ endsAt: "x" })).toBeUndefined();
    expect(parseCountdown(null)).toBeUndefined();
  });
});

describe("odcinki i strony", () => {
  it("jednostronne: lewa, prawa, potem kolejna seria", () => {
    expect([0, 1, 2, 3].map((i) => boutAt(i, true))).toEqual([
      { set: 1, side: "Lewa" },
      { set: 1, side: "Prawa" },
      { set: 2, side: "Lewa" },
      { set: 2, side: "Prawa" },
    ]);
    expect(boutTargets({ min: 2, max: 3 }, true)).toEqual({ min: 4, max: 6 });
  });

  it("zakres serii pozwala zakończyć po minimum, nie wcześniej", () => {
    const sets = { min: 2, max: 3 };
    expect(canFinishEarly({ done: 1 }, sets, false)).toBe(false);
    expect(canFinishEarly({ done: 2 }, sets, false)).toBe(true);
    expect(canFinishEarly({ done: 3 }, sets, false)).toBe(false);
    expect(isComplete({ done: 3 }, sets, false)).toBe(true);
    expect(parseBoutProgress({ done: -1 })).toBeUndefined();
    expect(parseBoutProgress({ done: 2 })).toEqual({ done: 2 });
  });
});

describe("nagłówek sesji", () => {
  it("kategoria trafia do linii pod tytułem, tytuł się nie powtarza", () => {
    const heading = sessionHeading(
      sessionFixture({ title: "Siła: całe ciało B", durationMin: 40, intensity: "umiarkowana" }),
    );
    expect(heading.title).toBe("Całe ciało B");
    expect(heading.meta).toEqual(["Siłownia", "40 min", "Umiarkowanie"]);
  });

  it("dwie sesje dnia mają różne, krótkie etykiety", () => {
    const [a, b] = slotLabels(
      sessionFixture({ title: "Siła: całe ciało B" }),
      sessionFixture({ title: "Regeneracja" }),
    );
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(12);
  });
});

describe("Jak wykonać", () => {
  it("niejednoznaczny rytm skipu: brak animacji i jawna informacja", () => {
    const howTo = resolveHowTo(ex({ exerciseId: "a_skip", name: "Skip A" }));
    if (!howTo.animation) expect(howTo.animationGap).toBeTruthy();
    expect(howTo.steps.length).toBeGreaterThan(0);
    expect(howTo.steps.length).toBeLessThanOrEqual(4);
  });

  it("bez bezwzględnych zakazów i bez prefiksów „Krok N”", () => {
    for (const id of ["goblet_squat", "ankling", "snap_down", "glute_bridge"]) {
      const howTo = resolveHowTo(ex({ exerciseId: id, name: id }));
      const text = [...howTo.steps, ...howTo.watch].join(" ");
      expect(text).not.toMatch(/\bnigdy\b|absolutnie|zakazan/i);
      expect(text).not.toMatch(/Krok \d/);
      expect(howTo.watch.length).toBeLessThanOrEqual(2);
    }
  });
});
