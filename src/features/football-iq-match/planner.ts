import { simulate, insidePitch } from "./simulation";
import { currentBallCarrier, currentPlayerPoint } from "./engine";
import type { ActionMode, PlannedAction, Point, Scenario } from "./types";

export const actionGroups = [
  { id: "ball", label: "Z piłką", modes: ["pass", "through", "cross", "carry", "shot", "hold"] },
  { id: "move", label: "Bez piłki", modes: ["run", "shift"] },
  { id: "defence", label: "Obrona", modes: ["press", "cover", "mark"] },
] as const;
export const modeLabels: Record<ActionMode, string> = {
  pass: "Podanie",
  through: "W przestrzeń",
  cross: "Dośrodkuj",
  carry: "Prowadzenie",
  shot: "Strzał",
  hold: "Utrzymaj",
  run: "Wybiegnięcie",
  shift: "Wsparcie",
  press: "Pressing",
  cover: "Asekuracja",
  mark: "Krycie",
};
export const modeHints: Record<ActionMode, string> = {
  pass: "Dotknij partnera. Podaje zawodnik z piłką.",
  through: "Dotknij partnera. Zagra piłkę przed niego, a on ruszy w przestrzeń.",
  cross: "Dotknij partnera. Piłka poleci górą do jego strefy.",
  carry: "Wskaż miejsce, do którego poprowadzisz piłkę.",
  shot: "Opcjonalne zakończenie planu strzałem. Bez wskazywania bramki.",
  hold: "Dotknij posiadacza, aby zatrzymać piłkę na moment.",
  run: "Wybierz zawodnika bez piłki i miejsce wybiegnięcia.",
  shift: "Wybierz zawodnika i miejsce wsparcia.",
  press: "Wybierz swojego zawodnika, następnie rywala z piłką.",
  cover: "Wybierz swojego zawodnika i miejsce asekuracji.",
  mark: "Wybierz swojego zawodnika, następnie rywala do krycia.",
};
export function plannedState(s: Scenario, actions: PlannedAction[]) {
  if (s.simulation) return simulate(s, actions).final;
  return {
    ballCarrierId: currentBallCarrier(s.ballCarrierId, actions),
    positions: new Map(s.players.map((p) => [p.id, currentPlayerPoint(p.id, s.players, actions)!])),
  };
}
export function planPass(
  s: Scenario,
  actions: PlannedAction[],
  targetId: string,
  id: string,
  mode: "pass" | "through" | "cross" = "pass",
): PlannedAction | null {
  const state = plannedState(s, actions),
    carrier = s.players.find((p) => p.id === state.ballCarrierId);
  const target = s.players.find((p) => p.id === targetId);
  if (
    !carrier ||
    carrier.team !== "home" ||
    !target ||
    target.team !== "home" ||
    target.id === carrier.id
  )
    return null;
  const from = state.positions.get(carrier.id)!,
    point = state.positions.get(target.id)!;
  const to = mode === "through" ? { x: point.x, y: Math.max(5, point.y - 9) } : { ...point };
  return {
    id,
    type: "pass",
    playerId: carrier.id,
    targetId,
    from: { ...from },
    to,
    delivery: mode === "through" ? "through" : mode === "cross" ? "cross" : "ground",
  };
}
export function planMovement(
  s: Scenario,
  actions: PlannedAction[],
  playerId: string,
  mode: ActionMode,
  point: Point,
  id: string,
  opponentId?: string,
): PlannedAction | null {
  const state = plannedState(s, actions),
    player = s.players.find((p) => p.id === playerId),
    from = state.positions.get(playerId);
  if (!player || player.team !== "home" || !from || !insidePitch(point)) return null;
  if (["pass", "through", "cross"].includes(mode)) return null;
  if (["carry", "shot", "hold"].includes(mode) && state.ballCarrierId !== playerId) return null;
  if (mode === "run" && state.ballCarrierId === playerId) return null;
  if (mode === "shot" && Math.hypot(from.x - 50, from.y - 3) > 50) return null;
  if (mode === "shot")
    return {
      id,
      type: "shot",
      playerId,
      from: { ...from },
      to: { x: Math.max(43, Math.min(57, point.x)), y: 3 },
    };
  if (mode === "hold") return { id, type: "hold", playerId, from: { ...from }, to: { ...from } };
  if (mode === "pass" || mode === "through" || mode === "cross") return null;
  if (distanceSquared(from, point) < 1) return null;
  return { id, type: mode, playerId, from: { ...from }, to: { ...point }, opponentId };
}
const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
