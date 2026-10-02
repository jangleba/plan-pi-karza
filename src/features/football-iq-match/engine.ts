import type {
  Evaluation,
  EvaluationMetrics,
  MatchPlayer,
  PlannedAction,
  PlannedMove,
  PlannedPassAction,
  Point,
  Scenario,
  UserPlan,
} from "./types";

export const clampPoint = (point: Point): Point => ({
  x: Math.max(3, Math.min(97, point.x)),
  y: Math.max(4, Math.min(146, point.y)),
});

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const score = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

const average = (values: number[], fallback = 0) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;

const closestDistance = (point: Point, targets: Point[]) =>
  targets.length ? Math.min(...targets.map((target) => distance(point, target))) : 100;

const pointToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return { distance: distance(point, start), progress: 0, projection: { ...start } };
  const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = { x: start.x + progress * dx, y: start.y + progress * dy };
  return { distance: distance(point, projection), progress, projection };
};

const movementActions = (actions: PlannedAction[]) =>
  actions.filter((action): action is Extract<PlannedAction, { type: "run" | "group" }> => action.type !== "pass");

const passActions = (actions: PlannedAction[]) =>
  actions.filter((action): action is PlannedPassAction => action.type === "pass");

const orderedActions = (actions: PlannedAction[]) =>
  [...actions].sort((left, right) => left.order - right.order);

const opponentClearance = (point: Point, opponents: MatchPlayer[]) =>
  opponents.length ? Math.min(...opponents.map((opponent) => distance(point, opponent))) : 18;

export const analyzePassLane = (pass: PlannedPassAction, opponents: MatchPlayer[]) => {
  const candidates = opponents
    .map((opponent) => ({ opponent, ...pointToSegment(opponent, pass.from, pass.to) }))
    .filter(({ progress }) => progress > 0.08 && progress < 0.94)
    .sort((left, right) => left.distance - right.distance);
  const closest = candidates[0];
  return closest
    ? {
        clearance: closest.distance,
        progress: closest.progress,
        point: closest.projection,
        interceptorId: closest.opponent.id,
      }
    : { clearance: 15, progress: 1, point: pass.to, interceptorId: undefined };
};

const corridorClearance = (pass: PlannedPassAction, opponents: MatchPlayer[]) =>
  analyzePassLane(pass, opponents).clearance;

const endpointFor = (player: MatchPlayer, moves: PlannedMove[]) => {
  const lastMove = [...moves].reverse().find((move) => move.playerId === player.id);
  return lastMove?.to ?? { x: player.x, y: player.y };
};

const uniqueMoves = (moves: PlannedMove[]) => {
  const seen = new Set<string>();
  return moves.filter((move) => {
    if (seen.has(move.playerId)) return false;
    seen.add(move.playerId);
    return true;
  });
};

const measureSpace = (scenario: Scenario, moves: PlannedMove[], passes: PlannedPassAction[], opponents: MatchPlayer[]) => {
  const controlledMoves = moves.filter((move) => move.playerId === scenario.controlledPlayerId);
  const relevantMoves = controlledMoves.length ? controlledMoves : moves;
  const zoneFit = relevantMoves.length && scenario.preferredRunZones.length
    ? Math.max(...relevantMoves.map((move) => 100 - closestDistance(move.to, scenario.preferredRunZones) * 4.4))
    : scenario.preferredRunZones.length ? 12 : 74;
  const destinations = [...relevantMoves.map((move) => move.to), ...passes.map((pass) => pass.to)];
  const clearance = destinations.length
    ? average(destinations.map((point) => Math.min(100, opponentClearance(point, opponents) * 7.5)))
    : 18;
  const lateralGain = passes.length
    ? Math.max(...passes.map((pass) => Math.min(100, Math.abs(pass.to.x - pass.from.x) * 2.1)))
    : relevantMoves.length
      ? Math.max(...relevantMoves.map((move) => Math.min(100, Math.abs(move.to.x - move.from.x) * 3)))
      : 0;
  const switchBonus = scenario.acceptedIntents.includes("switch") ? lateralGain : 60;
  return score(zoneFit * 0.55 + clearance * 0.28 + switchBonus * 0.17);
};

const measurePassing = (scenario: Scenario, passes: PlannedPassAction[], opponents: MatchPlayer[]) => {
  if (!passes.length) return scenario.preferredPassZones.length ? 12 : 84;

  const passScores = passes.map((pass) => {
    const targetFit = scenario.preferredPassZones.length
      ? 100 - closestDistance(pass.to, scenario.preferredPassZones) * 4
      : 58;
    const laneClearance = corridorClearance(pass, opponents);
    const lane = Math.min(100, laneClearance * 10);
    const direction = Math.min(100, Math.max(0, (pass.from.y - pass.to.y + 12) * 2.25));
    const lateral = Math.min(100, Math.abs(pass.to.x - pass.from.x) * 2.2);
    const tacticalDirection = scenario.acceptedIntents.includes("switch")
      ? Math.max(direction, lateral)
      : scenario.acceptedIntents.includes("progress")
        ? direction
        : Math.max(55, direction);
    const identity = pass.passerId || pass.receiverId ? 100 : 70;
    const result = score(targetFit * 0.38 + lane * 0.32 + tacticalDirection * 0.22 + identity * 0.08);
    return laneClearance < 3.4 ? Math.min(result, 38) : result;
  });

  return score(average(passScores));
};

const measureTiming = (scenario: Scenario, actions: PlannedAction[], passes: PlannedPassAction[]) => {
  if (!actions.length) return 0;
  const orders = orderedActions(actions).map((action) => action.order);
  const uniqueOrders = new Set(orders).size;
  const duplicatePenalty = (orders.length - uniqueOrders) * 13;
  const first = orders[0] ?? 1;
  const normalized = orders.map((order) => order - first + 1);
  const gaps = normalized.slice(1).reduce((sum, order, index) => sum + Math.max(0, order - normalized[index] - 1), 0);
  const sequenceDepth = Math.min(100, 50 + Math.max(0, actions.length - 1) * 18);
  const runBeforePass = passes.length
    ? passes.some((pass) => actions.some((action) => action.type !== "pass" && action.order < pass.order))
    : actions.some((action) => action.type !== "pass");
  const transitionFirstPass = scenario.id === "transition" && passes.some((pass) => pass.order === Math.min(...orders));
  const coherentTrigger = runBeforePass || transitionFirstPass || !passes.length ? 92 : 52;
  return score(sequenceDepth * 0.45 + coherentTrigger * 0.55 - duplicatePenalty - gaps * 7);
};

const measureRisk = (
  scenario: Scenario,
  moves: PlannedMove[],
  passes: PlannedPassAction[],
  opponents: MatchPlayer[],
  actionCount: number,
  intent: UserPlan["intent"],
) => {
  const laneSafety = passes.length
    ? average(passes.map((pass) => Math.min(100, corridorClearance(pass, opponents) * 10)))
    : 78;
  const moveSafety = moves.length
    ? average(moves.map((move) => Math.min(100, opponentClearance(move.to, opponents) * 7.5)))
    : 62;
  const excessiveComplexity = Math.max(0, actionCount - 5) * 7;
  const secureIntentBonus = intent === "secure" && scenario.acceptedIntents.includes("secure") ? 7 : 0;
  return score(laneSafety * 0.55 + moveSafety * 0.45 + secureIntentBonus - excessiveComplexity);
};

const measureStructure = (scenario: Scenario, moves: PlannedMove[], actions: PlannedAction[], home: MatchPlayer[]) => {
  if (!moves.length) return scenario.preferredRunZones.length ? 14 : 45;
  const distinctMoves = uniqueMoves(moves);
  const endpoints = home.map((player) => endpointFor(player, moves));
  const spacing = endpoints.length > 1
    ? average(endpoints.map((point, index) => {
        const others = endpoints.filter((_, otherIndex) => otherIndex !== index);
        return Math.min(100, closestDistance(point, others) * 10);
      }))
    : 50;
  const support = Math.min(100, 44 + Math.max(0, distinctMoves.length - 1) * 24);
  const groupAction = actions.some((action) => action.type === "group");
  const coordination = groupAction ? 96 : distinctMoves.length > 1 ? 78 : 48;
  const defensiveCoordination = ["counterpress", "defensive-cover"].includes(scenario.id) && groupAction ? 8 : 0;
  return score(spacing * 0.34 + support * 0.36 + coordination * 0.3 + defensiveCoordination);
};

const lowestMetric = (metrics: EvaluationMetrics) =>
  (Object.entries(metrics) as Array<[keyof EvaluationMetrics, number]>).sort((left, right) => left[1] - right[1])[0][0];

const recommendationFor = (metric: keyof EvaluationMetrics, scenario: Scenario) => {
  const recommendations: Record<keyof EvaluationMetrics, string> = {
    space: "Zanim ustawisz kierunek, znajdź strefę poza cieniem krycia i zakończ ruch w wolnej przestrzeni.",
    timing: "Ułóż wyraźną kolejność: ruch otwierający, reakcja rywala, a dopiero potem zagranie.",
    passing: "Skoryguj cel lub moment podania tak, aby linia nie przechodziła przez zasięg najbliższego rywala.",
    risk: "Zachowaj rozwiązanie awaryjne i zabezpieczenie za piłką na wypadek przechwytu.",
    structure: "Dodaj ruch partnera, ale utrzymaj odległości — dwóch zawodników nie powinno atakować tej samej strefy.",
  };
  return `${recommendations[metric]} Zasada: ${scenario.coachPrinciple}`;
};

export const evaluatePlan = (scenario: Scenario, plan: UserPlan): Evaluation => {
  const actions = orderedActions(plan.actions);
  const moveActions = movementActions(actions);
  const moves = moveActions.flatMap((action) => action.moves);
  const passes = passActions(actions);
  const home = scenario.players.filter((player) => player.team === "home");
  const opponents = scenario.players.filter((player) => player.team === "away");
  const interceptedPass = passes.some((pass) => analyzePassLane(pass, opponents).clearance < 3.4);

  const metrics: EvaluationMetrics = {
    space: measureSpace(scenario, moves, passes, opponents),
    timing: measureTiming(scenario, actions, passes),
    passing: measurePassing(scenario, passes, opponents),
    risk: measureRisk(scenario, moves, passes, opponents, actions.length, plan.intent),
    structure: measureStructure(scenario, moves, actions, home),
  };

  const intentFit = plan.intent
    ? scenario.acceptedIntents.includes(plan.intent) ? 100 : 42
    : 55;
  const hasControlledMove = moves.some((move) => move.playerId === scenario.controlledPlayerId);
  const involvement = hasControlledMove || passes.some((pass) => pass.passerId === scenario.controlledPlayerId) ? 100 : 44;
  const finalScore = score(
    metrics.space * 0.24 +
    metrics.timing * 0.19 +
    metrics.passing * 0.2 +
    metrics.risk * 0.17 +
    metrics.structure * 0.14 +
    intentFit * 0.04 +
    involvement * 0.02,
  );

  const strengths: string[] = [];
  const issues: string[] = [];
  if (metrics.space >= 70) strengths.push("Plan wykorzystuje przestrzeń, której rywal nie kontroluje.");
  else if (metrics.space < 48) issues.push("Końcowa strefa ruchu pozostaje w zasięgu bloku rywala.");
  if (metrics.timing >= 72) strengths.push("Kolejność działań tworzy czytelny bodziec i właściwy moment zagrania.");
  else if (metrics.timing < 48) issues.push("Ruch i podanie nie mają jeszcze logicznej kolejności.");
  if (metrics.passing >= 72) strengths.push("Linia podania omija bezpośredni zasięg przechwytu.");
  else if (metrics.passing < 48 && scenario.preferredPassZones.length) issues.push("Linia lub cel podania ułatwia rywalowi zamknięcie akcji.");
  if (interceptedPass) issues.push("Rywal znajduje się w torze piłki i przechwytuje zaplanowane podanie.");
  if (metrics.risk >= 70) strengths.push("Po decyzji pozostaje kontrola nad możliwą stratą.");
  else if (metrics.risk < 48) issues.push("Plan nie daje wystarczającego zabezpieczenia po możliwej stracie.");
  if (metrics.structure >= 70) strengths.push("Ruchy partnerów zachowują odległości i wspierają posiadacza piłki.");
  else if (metrics.structure < 48) issues.push("Zespół potrzebuje ruchu wspierającego lub lepszych odległości.");
  if (plan.intent && !scenario.acceptedIntents.includes(plan.intent)) {
    issues.push("Wybrana intencja nie odpowiada największej przewadze w tej sytuacji.");
  }
  if (!actions.length) issues.push("Nie zaplanowano jeszcze żadnego działania.");

  const weakest = lowestMetric(metrics);
  const strong = finalScore >= 76;
  const promising = finalScore >= 52;
  const title = strong ? "Decyzja tworzy przewagę" : promising ? "Dobry kierunek — dopracuj moment" : "Zatrzymaj i przeczytaj sytuację ponownie";
  const summary = strong
    ? scenario.goodFeedback
    : promising
      ? `Plan ma sens taktyczny, ale rywal nadal może go ograniczyć. ${scenario.improveFeedback}`
      : scenario.improveFeedback;

  const reactionDetail = interceptedPass
    ? "Najbliższy rywal przecina tor piłki i kończy akcję przechwytem."
    : passes.length && metrics.passing < 50
      ? "Najbliższy rywal skraca linię podania i może wejść w tor piłki."
    : moveActions.some((action) => action.type === "group")
      ? "Blok reaguje na ruch całej grupy, więc po przeciwnej stronie otwiera się kolejne okno."
      : moves.length > 1
        ? "Drugi ruch zmusza obrońcę do wyboru pomiędzy piłką a zabezpieczeniem partnera."
        : "Rywal może skoncentrować się na jednym bodźcu, ponieważ nie musi jeszcze wybierać pomiędzy dwiema opcjami.";

  const tags = [
    plan.intent ? `intencja: ${plan.intent}` : "intencja niewybrana",
    `${moves.length} ${moves.length === 1 ? "ruch" : "ruchy"}`,
    `${passes.length} ${passes.length === 1 ? "podanie" : "podania"}`,
    moveActions.some((action) => action.type === "group") ? "koordynacja grupy" : "plan indywidualny",
  ];

  return {
    score: finalScore,
    title,
    summary,
    strengths: strengths.slice(0, 3),
    issues: issues.slice(0, 3),
    recommendation: recommendationFor(weakest, scenario),
    metrics,
    reaction: `${scenario.reactionSummary} ${reactionDetail}`,
    tags,
  };
};

export const buildReferencePlan = (scenario: Scenario): UserPlan => {
  const controlled = scenario.players.find((player) => player.id === scenario.controlledPlayerId);
  if (!controlled) return { actions: [], intent: scenario.acceptedIntents[0] };

  const runTarget = scenario.preferredRunZones[0];
  const runAction: PlannedAction | undefined = runTarget
    ? {
        id: `${scenario.id}-reference-run`,
        type: "run",
        order: 1,
        moves: [{
          playerId: controlled.id,
          from: { x: controlled.x, y: controlled.y },
          to: { ...runTarget },
        }],
      }
    : undefined;

  const passFirst = scenario.id === "transition";
  const passOrigin = !passFirst && runAction && scenario.ball.carrierId === controlled.id
    ? runTarget
    : { x: scenario.ball.x, y: scenario.ball.y };
  const opponents = scenario.players.filter((player) => player.team === "away");
  const passTarget = [...scenario.preferredPassZones]
    .sort((left, right) => {
      const clearanceFor = (target: Point) => analyzePassLane({
        id: `${scenario.id}-reference-candidate`,
        type: "pass",
        order: 1,
        from: passOrigin,
        to: target,
        passerId: scenario.ball.carrierId,
      }, opponents).clearance;
      return clearanceFor(right) - clearanceFor(left);
    })[0];
  const receiver = passTarget
    ? scenario.players
        .filter((player) => player.team === "home" && player.id !== scenario.ball.carrierId)
        .sort((left, right) => distance(left, passTarget) - distance(right, passTarget))[0]
    : undefined;
  const passAction: PlannedAction | undefined = passTarget
    ? {
        id: `${scenario.id}-reference-pass`,
        type: "pass",
        order: 2,
        from: { ...passOrigin },
        to: { ...passTarget },
        passerId: scenario.ball.carrierId,
        receiverId: receiver && distance(receiver, passTarget) < 9 ? receiver.id : undefined,
      }
    : undefined;

  const actions = [runAction, passAction].filter((action): action is PlannedAction => Boolean(action));
  const ordered = passFirst && passAction
    ? [passAction, ...actions.filter((action) => action !== passAction)]
    : actions;
  ordered.forEach((action, index) => {
    action.order = index + 1;
  });

  return { actions: ordered, intent: scenario.acceptedIntents[0] };
};

export const emptyPlan = (): UserPlan => ({ actions: [] });
