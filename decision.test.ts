import { describe, expect, it } from "vitest";

import type { SimPitchActor } from "@/components/football-iq/SimPitch";
import { applyPlanToActors } from "./planner";
import { evaluate } from "./simulation/engine";
import { ADVANCED_SCENARIOS } from "./simulation/library";
import { SIM_SCENARIOS } from "./simulation/scenarios";
import {
  ADVANCED_SEQUENCE_MS,
  advancedSequenceFor,
  buildChoice,
  canPlayDecision,
  compareSolutions,
  decisionAnalysis,
  decisionAnchorMs,
  decisionLessons,
  freezeTiming,
  replayView,
  toolsForScenario,
  userDecisionPoint,
} from "./decision";

describe("Football IQ — decyzja użytkownika", () => {
  it("bierze punkt z ostatniego ruchu self w planie", () => {
    const p = userDecisionPoint({
      plan: [
        {
          id: "1",
          tool: "run",
          actorId: "self",
          from: { x: 1, y: 1 },
          to: { x: 10, y: 20 },
        },
        {
          id: "2",
          tool: "position",
          actorId: "self",
          from: { x: 10, y: 20 },
          to: { x: 30, y: 40 },
        },
        {
          id: "3",
          tool: "pass",
          actorId: "self",
          from: { x: 0, y: 0 },
          to: { x: 90, y: 90 },
        },
      ],
      selfId: "self",
      goalkeeperPoint: null,
      freezeSelf: { x: 5, y: 5 },
    });
    expect(p).toEqual({ x: 30, y: 40 });
  });

  it("GK: punkt dotknięcia, inaczej realna klatka zatrzymania", () => {
    expect(
      userDecisionPoint({
        plan: [],
        selfId: "self",
        goalkeeperPoint: { x: 7, y: 8 },
        freezeSelf: { x: 1, y: 1 },
      }),
    ).toEqual({ x: 7, y: 8 });
    expect(
      userDecisionPoint({
        plan: [],
        selfId: "self",
        goalkeeperPoint: null,
        freezeSelf: { x: 1, y: 2 },
      }),
    ).toEqual({ x: 1, y: 2 });
  });

  it("zapisuje realny timing zatrzymania", () => {
    expect(freezeTiming(0.4321, 7000)).toEqual({ t: 0.4321, timingMs: 3025 });
    expect(freezeTiming(1, 6500).timingMs).toBe(6500);
  });

  it("przekazuje dokładne actionId bez heurystyki (także nie-pierwszą akcję)", () => {
    const s = ADVANCED_SCENARIOS[0];
    const last = s.actions.at(-1)!;
    const choice = buildChoice({
      timingMs: 1000,
      point: { x: 50, y: 50 },
      actionId: last.id,
    });
    expect(choice.actionId).toBe(last.id);
    expect(choice).not.toHaveProperty("angleDeg");
    expect(choice).not.toHaveProperty("foot");
    expect(evaluate(s, choice).action?.id).toBe(last.id);
  });

  it("wymaga jawnej akcji oraz zmiany struktury albo punktu GK", () => {
    expect(
      canPlayDecision({
        group: "midfielder",
        selectedActionId: null,
        goalkeeperPoint: null,
        timingMs: 100,
        planLength: 1,
      }),
    ).toBe(false);
    expect(
      canPlayDecision({
        group: "midfielder",
        selectedActionId: "a",
        goalkeeperPoint: null,
        timingMs: 100,
        planLength: 0,
      }),
    ).toBe(false);
    expect(
      canPlayDecision({
        group: "midfielder",
        selectedActionId: "a",
        goalkeeperPoint: null,
        timingMs: 100,
        planLength: 1,
      }),
    ).toBe(true);
    expect(
      canPlayDecision({
        group: "goalkeeper",
        selectedActionId: "a",
        goalkeeperPoint: null,
        timingMs: 100,
      }),
    ).toBe(false);
  });

  it("filtruje narzędzia kontekstowo", () => {
    expect(toolsForScenario("transition", "goalkeeper")).toEqual([]);
    for (const topic of [
      "press_trap",
      "third_man",
      "rest_defence",
      "overload_isolate",
    ] as const) {
      const tools = toolsForScenario(topic, "midfielder");
      expect(tools.length).toBeGreaterThanOrEqual(5);
      expect(tools.length).toBeLessThanOrEqual(8);
      expect(tools).toContain("position");
      expect(tools).not.toContain("scan");
    }
    expect(toolsForScenario("press_trap", "defender")).toContain(
      "offside_line",
    );
    expect(toolsForScenario("press_trap", "defender")).not.toContain("cross");
    expect(toolsForScenario("third_man", "midfielder")).toContain("third_man");
  });

  it("nie przesuwa rywali planem", () => {
    const actors: SimPitchActor[] = [
      { id: "o", kind: "opponent", x: 50, y: 50 },
    ];
    const moved = applyPlanToActors(
      actors,
      [
        {
          id: "x",
          tool: "press",
          actorId: "o",
          from: { x: 50, y: 50 },
          to: { x: 0, y: 0 },
        },
      ],
      1,
    );
    expect(moved[0]).toMatchObject({ x: 50, y: 50 });
  });

  it("replay alternatywy pokazuje jej tor, zmianę i skutek", () => {
    const s = ADVANCED_SCENARIOS.find((sc) =>
      sc.actions.some((a) => {
        const r = evaluate(
          sc,
          buildChoice({ timingMs: 0, point: { x: 0, y: 0 }, actionId: a.id }),
        );
        return r.alternative;
      }),
    )!;
    const action = s.actions.find(
      (a) =>
        evaluate(
          s,
          buildChoice({ timingMs: 0, point: { x: 0, y: 0 }, actionId: a.id }),
        ).alternative,
    )!;
    const r = evaluate(
      s,
      buildChoice({ timingMs: 0, point: { x: 0, y: 0 }, actionId: action.id }),
    );
    const alt = replayView(r, "alt");
    expect(alt.variant).toBe("alt");
    expect(alt.path).toBe(r.alternative!.outcome.path);
    expect(alt.changed).toBe(r.alternative!.changed);
    expect(alt.outcome.consequence).toBe(r.alternative!.outcome.consequence);
    const user = replayView(r, "user");
    expect(user.outcome).toBe(r.outcome);
    expect(user.changed).toBeUndefined();
  });

  it("buduje trzy scenariuszowe lekcje bez pustych, generycznych wierszy", () => {
    const scenario = ADVANCED_SCENARIOS[0];
    const zone = scenario.zones[0];
    const timing = scenario.timingWindows[0];
    const action = scenario.actions[0];
    const choice = buildChoice({
      timingMs: timing.fromMs,
      point: { x: zone.x, y: zone.y },
      actionId: action.id,
    });
    const lessons = decisionLessons(
      scenario,
      evaluate(scenario, choice),
      choice,
    );

    expect(lessons.map((lesson) => lesson.label)).toEqual([
      "Ustawienie",
      "Konsekwencja",
      "Inny wariant",
    ]);
    expect(lessons.every((lesson) => lesson.text.trim().length > 0)).toBe(true);
    expect(
      lessons.find((lesson) => lesson.key === "consequence")?.text,
    ).toContain(action.label);
  });

  it("każdy temat ma tę samą pięciofazową strukturę zaawansowaną", () => {
    expect(ADVANCED_SEQUENCE_MS).toBeGreaterThanOrEqual(8_000);
    for (const scenario of SIM_SCENARIOS) {
      expect(advancedSequenceFor(scenario.topic).phases).toHaveLength(5);
      expect(decisionAnchorMs(scenario)).toBeGreaterThan(0);
    }
  });

  it("porównuje kilka realnych rozwiązań, a nie jedną rzekomo poprawną odpowiedź", () => {
    const scenario = ADVANCED_SCENARIOS[0];
    const zone = scenario.zones[0];
    const action = scenario.actions[0];
    const choice = buildChoice({
      timingMs: decisionAnchorMs(scenario),
      point: { x: zone.x, y: zone.y },
      actionId: action.id,
    });
    const result = evaluate(scenario, choice);
    const comparisons = compareSolutions(scenario, result);

    expect(comparisons.length).toBeGreaterThanOrEqual(3);
    expect(comparisons[0].selected).toBe(true);
    expect(
      new Set(comparisons.map((item) => item.status)).size,
    ).toBeGreaterThanOrEqual(1);
    expect(comparisons.every((item) => item.consequence.length > 0)).toBe(true);
  });

  it("buduje analizę i wskazówkę transferową z wyniku oraz tematu sceny", () => {
    const scenario = ADVANCED_SCENARIOS[0];
    const zone = scenario.zones[0];
    const result = evaluate(
      scenario,
      buildChoice({
        timingMs: decisionAnchorMs(scenario),
        point: zone,
        actionId: scenario.actions[0].id,
      }),
    );
    const analysis = decisionAnalysis(scenario, result);

    expect(analysis.headline.length).toBeGreaterThan(20);
    expect(analysis.explanation).toBeTruthy();
    expect(analysis.strength).not.toBe(analysis.risk);
    expect(analysis.transfer.length).toBeGreaterThan(20);
  });
});
