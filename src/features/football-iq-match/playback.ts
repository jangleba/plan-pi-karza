import { analyzePassLane } from "./engine";
import type { BallState, MatchPlayer, PlannedAction, Point } from "./types";

export const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export const interpolate = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const actionWeight = (action: PlannedAction) => {
  if (action.type === "pass") {
    return Math.max(
      0.32,
      Math.hypot(action.to.x - action.from.x, action.to.y - action.from.y) / 52,
    );
  }
  const longestMove = action.moves.reduce(
    (maximum, move) =>
      Math.max(maximum, Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y)),
    0,
  );
  return Math.max(0.52, longestMove / 22);
};

const actionActors = (action: PlannedAction) => {
  const actors = new Set<string>();
  if (action.type === "pass") {
    actors.add("ball");
    if (action.passerId) actors.add(`player:${action.passerId}`);
    if (action.receiverId) actors.add(`player:${action.receiverId}`);
  } else {
    action.moves.forEach((move) => actors.add(`player:${move.playerId}`));
  }
  return actors;
};

export const actionSchedule = (actions: PlannedAction[]) => {
  const weights = actions.map(actionWeight);
  const actors = actions.map(actionActors);
  const starts: number[] = [];
  actions.forEach((_, index) => {
    if (index === 0) {
      starts.push(0);
      return;
    }
    let start = starts[index - 1] + weights[index - 1] * 0.78;
    for (let prior = 0; prior < index; prior += 1) {
      const dependent = [...actors[index]].some((actor) => actors[prior].has(actor));
      if (dependent) start = Math.max(start, starts[prior] + weights[prior]);
    }
    starts.push(start);
  });
  const total = Math.max(0.001, (starts.at(-1) ?? 0) + (weights.at(-1) ?? 0));
  return { starts, weights, total };
};

export const actionProgress = (
  globalProgress: number,
  index: number,
  schedule: ReturnType<typeof actionSchedule>,
) => {
  if (!schedule.weights.length || globalProgress <= 0) return 0;
  if (globalProgress >= 1) return 1;
  const { starts, weights, total } = schedule;
  const start = starts[index] / total;
  const duration = weights[index] / total;
  return smooth((globalProgress - start) / Math.max(0.001, duration));
};

export const getLine = (role: string) => {
  const normalized = role.toUpperCase();
  if (normalized === "BR") return "goalkeeper";
  if (["LO", "PO", "ŚO", "SO"].includes(normalized)) return "defence";
  if (["DP", "ŚP", "SP", "ŚPO", "SPO"].includes(normalized)) return "midfield";
  return "attack";
};

export const applyActions = (
  positions: Map<string, Point>,
  initialBall: BallState,
  actions: PlannedAction[],
  globalProgress: number,
  players: MatchPlayer[],
  resolveConsequences: boolean,
) => {
  const ball: BallState = { x: initialBall.x, y: initialBall.y, carrierId: initialBall.carrierId };
  const initialCarrier = ball.carrierId ? positions.get(ball.carrierId) : undefined;
  if (initialCarrier) Object.assign(ball, initialCarrier);
  const schedule = actionSchedule(actions);
  let timelineProgress = globalProgress;

  actions.forEach((action, actionIndex) => {
    const progress = actionProgress(timelineProgress, actionIndex, schedule);
    if (progress <= 0) return;
    if (action.type === "pass") {
      const passerId = action.passerId ?? ball.carrierId;
      const passerTeam = players.find((player) => player.id === passerId)?.team ?? "home";
      const defenders = players
        .filter((player) => player.team !== passerTeam)
        .map((player) => ({ ...player, ...(positions.get(player.id) ?? player) }));
      const lane = analyzePassLane(action, defenders);
      const intercepted = resolveConsequences && lane.clearance < 3.4;
      const target = intercepted ? lane.point : action.to;
      Object.assign(ball, interpolate(action.from, target, progress));
      ball.carrierId =
        progress >= 1 ? (intercepted ? lane.interceptorId : action.receiverId) : undefined;
      if (intercepted && progress >= 1) {
        const interceptionEnd =
          (schedule.starts[actionIndex] + schedule.weights[actionIndex]) / schedule.total;
        timelineProgress = Math.min(timelineProgress, interceptionEnd);
      }
      return;
    }
    action.moves.forEach((move) => {
      const point = interpolate(move.from, move.to, progress);
      positions.set(move.playerId, point);
      if (ball.carrierId === move.playerId) Object.assign(ball, point);
    });
  });

  const finalCarrier = ball.carrierId ? positions.get(ball.carrierId) : undefined;
  if (finalCarrier) Object.assign(ball, finalCarrier);
  return ball;
};
