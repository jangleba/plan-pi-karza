import { describe, expect, it } from "vitest";
import {
  buildRecoveryProtocol,
  buildWarmupProtocol,
  expandPreparationSteps,
  protocolDuration,
  RECOVERY_FOCI,
  recoveryContextForSession,
  canGuideRecoverySession,
  cooldownFromExercises,
} from "./protocols";
import { runningCooldown } from "../recoveryContent";
import { flatToStructured } from "../sessionStructure";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { TrainingExercise } from "../types";

describe("dobór rozgrzewki i regeneracji", () => {
  it("nie generuje ruchu dla zerowej sesji ostrożnościowej ani dnia wstrzymanego", () => {
    const base = {
      ...sessionFixture(),
      dayType: "recovery" as const,
      sessionType: "Regeneracja",
      durationMin: 20,
    };
    expect(canGuideRecoverySession(base)).toBe(true);
    expect(
      canGuideRecoverySession({ ...base, durationMin: 0, title: "Regeneracja — tryb ostrożny" }),
    ).toBe(false);
    expect(canGuideRecoverySession({ ...base, loadLabelOverride: "Wstrzymaj trening" })).toBe(
      false,
    );
    expect(canGuideRecoverySession({ ...base, isUnavailable: true })).toBe(false);
    expect(canGuideRecoverySession({ ...base, dayType: "match" })).toBe(false);
  });
  it("każdy obszar ma konkretne różniące się ruchy, ilustracje, anatomię i źródła", () => {
    const programs = RECOVERY_FOCI.map((f) => buildRecoveryProtocol(f.id));
    expect(new Set(programs.map((p) => p.exercises.map((e) => e.id).join("|"))).size).toBe(7);
    for (const p of programs)
      for (const e of p.exercises) {
        expect(e.cues).toHaveLength(2);
        expect(e.visual).toBeTruthy();
        expect(e.anatomy.length).toBeGreaterThan(10);
        expect(e.mechanism.length).toBeGreaterThan(10);
        expect(e.sources.length).toBeGreaterThan(0);
        expect(Boolean(e.seconds) !== Boolean(e.reps)).toBe(true);
      }
  });
  it("duże obciążenie zmniejsza dawkę bez dokładania ćwiczeń siłowych", () => {
    const standard = buildRecoveryProtocol("calves");
    const light = buildRecoveryProtocol("calves", { highLoad: true });
    expect(protocolDuration(light).seconds).toBeLessThan(protocolDuration(standard).seconds);
    expect(light.exercises.find((e) => e.id === "calf")?.seconds).toBe(20);
    expect(standard.exercises.find((e) => e.id === "calf")?.seconds).toBe(30);
    expect(light.exercises.some((e) => /nordic|copenhagen|przysiad/i.test(e.name))).toBe(false);
  });
  it("przed łatwym biegiem nie daje przebieżek ani rozciągania statycznego", () => {
    const p = buildWarmupProtocol("easy");
    expect(p.exercises.map((e) => e.id)).toEqual(["walk"]);
    expect(p.exercises[0].seconds).toBe(180);
  });
  it("po lewej stronie daje zmianę, prawą stronę i dopiero potem odpoczynek — w każdej z dwóch serii", () => {
    const p = buildRecoveryProtocol("calves");
    const steps = expandPreparationSteps(p).filter((s) => s.exerciseIndex === 1);
    expect(steps.map((s) => [s.type, s.side, s.seconds, s.set])).toEqual([
      ["work", "left", 30, 1],
      ["switch", "right", 10, 1],
      ["work", "right", 30, 1],
      ["rest", null, 15, 1],
      ["work", "left", 30, 2],
      ["switch", "right", 10, 2],
      ["work", "right", 30, 2],
      ["rest", null, 15, 2],
    ]);
  });
  it("każde ćwiczenie podaje dokładne ustawienie, anatomię i powód dawki", () => {
    for (const focus of RECOVERY_FOCI)
      for (const e of buildRecoveryProtocol(focus.id).exercises) {
        expect(e.setup.length, e.name).toBeGreaterThan(40);
        expect(e.doseReason.length, e.name).toBeGreaterThan(40);
        if (e.seconds && e.sides && e.id !== "walk") {
          expect(e.sets, e.name).toBe(2);
          expect(e.doseReason).toMatch(/60 s na mięsień/);
          expect(e.sources).toContain("acsm");
        }
      }
    for (const focus of RECOVERY_FOCI)
      expect(buildRecoveryProtocol(focus.id).exercises.some((e) => e.id === "walk")).toBe(false);
    expect(buildRecoveryProtocol("whole").exercises.map((e) => e.id)).toEqual([
      "cat",
      "rotation",
      "ankle",
      "adductor",
      "hip",
      "hamstring",
      "quad",
      "calf",
    ]);
  });
  it("prowadzi zaplanowane wyciszenie z tymi samymi seriami, czasem i stronami", () => {
    const sections = flatToStructured({
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: runningCooldown(),
    });
    const protocol = cooldownFromExercises(sections[0].blocks.flatMap((b) => b.exercises));
    expect(protocol?.exercises.map((e) => [e.id, e.sets, e.seconds, e.sides])).toEqual([
      ["walk", 1, 180, false],
      ["calf", 2, 30, true],
      ["hip", 2, 30, true],
      ["hamstring", 2, 30, true],
    ]);
  });
  it("nie prowadzi minutnikiem wyciszenia z ćwiczeniem bez odpowiednika", () => {
    expect(
      cooldownFromExercises([
        {
          id: "x",
          name: "Oddech przeponowy",
          exerciseId: "diaphragmatic_breathing",
          duration: "2 min",
        },
      ] as TrainingExercise[]),
    ).toBeUndefined();
  });
  it("nie kończy automatycznie powtórzeń, a ostatnie ćwiczenie nie ma pustej końcowej przerwy", () => {
    const steps = expandPreparationSteps(buildRecoveryProtocol("back"));
    expect(steps.some((s) => s.reps === 6 && s.seconds == null)).toBe(true);
    expect(steps.at(-1)?.type).toBe("work");
  });
  it("bierze minuty wyłącznie z ukończonego meczu i nie zgaduje ich przy braku danych", () => {
    const session = sessionFixture({ date: "2026-10-15", dayType: "recovery" });
    const match = sessionFixture({ dbId: "match", date: "2026-10-14", dayType: "match" });
    expect(recoveryContextForSession(session, [match, session], {})).toMatchObject({
      afterMatch: false,
      highLoad: false,
    });
    expect(
      recoveryContextForSession(session, [match, session], {
        match: { completed: true, durationMin: 80, rpe: 8, notes: "" },
      }),
    ).toMatchObject({ afterMatch: true, highLoad: true });
  });
});
