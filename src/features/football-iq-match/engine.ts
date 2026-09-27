import type { Evaluation, Point, Scenario, UserPlan } from "./types";

export const clampPoint = (point: Point): Point => ({
  x: Math.max(3, Math.min(97, point.x)),
  y: Math.max(4, Math.min(146, point.y)),
});

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const closestDistance = (point: Point, targets: Point[]) =>
  targets.length ? Math.min(...targets.map((target) => distance(point, target))) : 100;

export const evaluatePlan = (scenario: Scenario, plan: UserPlan): Evaluation => {
  const controlledRun = plan.runs.find((run) => run.playerId === scenario.controlledPlayerId);
  const runDistance = controlledRun ? closestDistance(controlledRun.to, scenario.preferredRunZones) : 100;
  const passDistance = plan.pass ? closestDistance(plan.pass.to, scenario.preferredPassZones) : 100;
  const runPoints = controlledRun ? 24 + Math.max(0, 36 - runDistance * 1.25) : 0;
  const passPoints = plan.pass && scenario.preferredPassZones.length ? 10 + Math.max(0, 25 - passDistance * 1.25) : 0;
  const supportPoints = Math.min(10, Math.max(0, plan.runs.length - 1) * 5);
  const noPassScenarioBoost = scenario.preferredPassZones.length === 0 && controlledRun ? 20 : 0;
  const score = Math.round(Math.min(100, runPoints + passPoints + supportPoints + noPassScenarioBoost));
  const good = score >= 65;
  const partial = score >= 35;

  return {
    score,
    title: good ? "Mocna decyzja" : partial ? "Dobra intencja — popraw detal" : "Sprawdź alternatywę",
    message: good ? scenario.goodFeedback : scenario.improveFeedback,
    tags: [
      controlledRun ? "ruch zapisany" : "brak ruchu TY",
      plan.pass ? "podanie zaplanowane" : "bez podania",
      plan.runs.length > 1 ? "wsparcie zespołu" : "decyzja indywidualna",
    ],
  };
};

export const emptyPlan = (): UserPlan => ({ runs: [] });
