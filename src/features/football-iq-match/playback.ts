import { createPlayback as createAnimation, samplePlayback as sampleAnimation } from "./animation";
import { simulate, sampleSimulation } from "./simulation";
import type { PlannedAction, Scenario } from "./types";
import type { Simulation } from "./simulation";
export * from "./animation";
export function createPlayback(scenario: Scenario, actions: PlannedAction[]) {
  const plan = createAnimation(scenario, actions);
  const simulation: Simulation | undefined = scenario.simulation
    ? simulate(scenario, actions)
    : undefined;
  return { ...plan, duration: simulation?.duration ?? plan.duration, simulation };
}
export type Playback = ReturnType<typeof createPlayback>;
export function samplePlayback(plan: Playback, progress: number) {
  return plan.simulation
    ? sampleSimulation(plan.simulation, progress)
    : sampleAnimation(plan, progress);
}
export function playbackDuration(scenario: Scenario, actions: PlannedAction[]) {
  return createPlayback(scenario, actions).duration;
}
export function playbackFrame(scenario: Scenario, actions: PlannedAction[], progress: number) {
  return samplePlayback(createPlayback(scenario, actions), progress);
}
