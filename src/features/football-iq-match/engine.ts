import type {
  Evaluation,
  EvaluationLevel,
  EvaluationMetric,
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
  actions.filter((action): action is Extract<PlannedAction, { type: "run" }> => action.type === "run");

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
  moves: PlannedMove[],
  passes: PlannedPassAction[],
  opponents: MatchPlayer[],
  actionCount: number,
) => {
  const laneSafety = passes.length
    ? average(passes.map((pass) => Math.min(100, corridorClearance(pass, opponents) * 10)))
    : 78;
  const moveSafety = moves.length
    ? average(moves.map((move) => Math.min(100, opponentClearance(move.to, opponents) * 7.5)))
    : 62;
  const excessiveComplexity = Math.max(0, actionCount - 3) * 10;
  return score(laneSafety * 0.55 + moveSafety * 0.45 - excessiveComplexity);
};

const measureStructure = (scenario: Scenario, moves: PlannedMove[], home: MatchPlayer[]) => {
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
  const coordination = distinctMoves.length > 1 ? 82 : 52;
  const defensiveCoordination = ["counterpress", "defensive-cover"].includes(scenario.id) && distinctMoves.length > 1 ? 6 : 0;
  return score(spacing * 0.34 + support * 0.36 + coordination * 0.3 + defensiveCoordination);
};

type SignalKey = keyof EvaluationMetrics;
type SignalValues = Record<SignalKey, number>;

const recommendationFor = (metric: SignalKey, scenario: Scenario) => {
  const recommendations: Record<SignalKey, string> = {
    timing: "Ułóż wyraźną kolejność: ruch otwierający, reakcja rywala, a dopiero potem zagranie.",
    spatialDecision: "Najpierw znajdź strefę poza cieniem krycia, a potem otwórz ją ruchem swoim lub partnera.",
    consequence: "Skoryguj kierunek lub moment ostatniej akcji tak, aby rywal nie mógł zamknąć jej jednym ruchem.",
  };
  return `${recommendations[metric]} Zasada: ${scenario.coachPrinciple}`;
};

const levelFor = (value: number, strongAt = 72, conditionalAt = 48): EvaluationLevel =>
  value >= strongAt ? "strong" : value >= conditionalAt ? "conditional" : "risky";

const makeMetric = (level: EvaluationLevel, labels: Record<EvaluationLevel, string>, detail: string): EvaluationMetric => ({
  level,
  label: labels[level],
  detail,
});

const weakestSignal = (values: SignalValues) =>
  (Object.entries(values) as Array<[SignalKey, number]>).sort((left, right) => left[1] - right[1])[0][0];

export const evaluatePlan = (scenario: Scenario, plan: UserPlan): Evaluation => {
  const actions = orderedActions(plan.actions);
  const moveActions = movementActions(actions);
  const moves = moveActions.flatMap((action) => action.moves);
  const passes = passActions(actions);
  const home = scenario.players.filter((player) => player.team === "home");
  const opponents = scenario.players.filter((player) => player.team === "away");
  const interceptedPass = passes.some((pass) => analyzePassLane(pass, opponents).clearance < 3.4);
  const spaceSignal = measureSpace(scenario, moves, passes, opponents);
  const timingSignal = measureTiming(scenario, actions, passes);
  const passingSignal = measurePassing(scenario, passes, opponents);
  const riskSignal = measureRisk(moves, passes, opponents, actions.length);
  const structureSignal = measureStructure(scenario, moves, home);
  const hasControlledMove = moves.some((move) => move.playerId === scenario.controlledPlayerId);
  const involvement = hasControlledMove || passes.some((pass) => pass.passerId === scenario.controlledPlayerId) ? 100 : 44;
  const signalValues: SignalValues = {
    timing: timingSignal,
    spatialDecision: score(spaceSignal * 0.68 + structureSignal * 0.32),
    consequence: interceptedPass ? 0 : score(passingSignal * 0.45 + riskSignal * 0.4 + involvement * 0.15),
  };

  const timingLevel = actions.length ? levelFor(signalValues.timing) : "risky";
  const spatialLevel = actions.length ? levelFor(signalValues.spatialDecision, 70, 46) : "risky";
  const consequenceLevel = actions.length && !interceptedPass
    ? levelFor(signalValues.consequence, 70, 48)
    : "risky";

  const consequenceLabels: Record<EvaluationLevel, string> = {
    strong: ["counterpress", "defensive-cover"].includes(scenario.id)
      ? "ogranicza zagrożenie"
      : passes.length ? "utrzymuje przewagę" : "zmusza rywala do reakcji",
    conditional: "rywal ma jeszcze odpowiedź",
    risky: interceptedPass ? "strata po przechwycie" : "brak przewagi po akcji",
  };

  const metrics: EvaluationMetrics = {
    timing: makeMetric(timingLevel, {
      strong: "dobry moment",
      conditional: "kolejność do dopracowania",
      risky: "brak czytelnej sekwencji",
    }, timingLevel === "strong"
      ? "Ruch i zagranie pojawiają się w logicznej kolejności."
      : "Moment kolejnej akcji nie wykorzystuje jeszcze pełnej reakcji rywala."),
    spatialDecision: makeMetric(spatialLevel, {
      strong: "tworzy przewagę",
      conditional: "otwiera część przestrzeni",
      risky: "rywal kontroluje strefę",
    }, spatialLevel === "strong"
      ? "Plan kieruje akcję poza bezpośrednią kontrolę bloku."
      : "Końcowa strefa pozostaje w zasięgu przesunięcia rywala."),
    consequence: makeMetric(consequenceLevel, consequenceLabels, interceptedPass
      ? "Najbliższy rywal przecina tor piłki i przejmuje posiadanie."
      : consequenceLevel === "strong"
        ? "Po ostatniej akcji zespół zachowuje inicjatywę."
        : "Rywal może zamknąć akcję bez utraty ustawienia."),
  };

  const levels = Object.values(metrics).map((metric) => metric.level);
  const strongCount = levels.filter((level) => level === "strong").length;
  const riskyCount = levels.filter((level) => level === "risky").length;
  const verdict: EvaluationLevel = !actions.length || interceptedPass || riskyCount >= 2
    ? "risky"
    : strongCount >= 2 && riskyCount === 0
      ? "strong"
      : "conditional";

  const strengths: string[] = [];
  const issues: string[] = [];
  if (spatialLevel === "strong") strengths.push("Plan wykorzystuje przestrzeń, której rywal nie kontroluje.");
  else if (spatialLevel === "risky") issues.push("Końcowa strefa ruchu pozostaje w zasięgu bloku rywala.");
  if (timingLevel === "strong") strengths.push("Kolejność działań tworzy właściwy moment zagrania.");
  else if (timingLevel === "risky") issues.push("Ruch i podanie nie mają jeszcze logicznej kolejności.");
  if (passingSignal >= 72 && passes.length) strengths.push("Linia podania omija bezpośredni zasięg przechwytu.");
  else if (passingSignal < 48 && scenario.preferredPassZones.length) issues.push("Linia lub cel podania ułatwia rywalowi zamknięcie akcji.");
  if (interceptedPass) issues.push("Rywal znajduje się w torze piłki i przechwytuje zaplanowane podanie.");
  if (riskSignal >= 70) strengths.push("Po decyzji pozostaje kontrola nad możliwą stratą.");
  else if (riskSignal < 48) issues.push("Plan nie daje wystarczającego zabezpieczenia po możliwej stracie.");
  if (structureSignal >= 70) strengths.push("Ruchy partnerów zachowują odległości i wspierają posiadacza piłki.");
  else if (structureSignal < 48) issues.push("Zespół potrzebuje ruchu wspierającego lub lepszych odległości.");
  if (!actions.length) issues.push("Nie zaplanowano jeszcze żadnego działania.");

  const weakest = weakestSignal(signalValues);
  const title = verdict === "strong" ? "Decyzja tworzy przewagę" : verdict === "conditional" ? "Dobry kierunek — dopracuj moment" : "Zatrzymaj i przeczytaj sytuację ponownie";
  const summary = verdict === "strong"
    ? scenario.goodFeedback
    : verdict === "conditional"
      ? `Plan ma sens taktyczny, ale rywal nadal może go ograniczyć. ${scenario.improveFeedback}`
      : scenario.improveFeedback;

  const reactionDetail = interceptedPass
    ? "Najbliższy rywal przecina tor piłki i kończy akcję przechwytem."
    : passes.length && passingSignal < 50
      ? "Najbliższy rywal skraca linię podania i może wejść w tor piłki."
    : moves.length > 1
        ? "Drugi ruch zmusza obrońcę do wyboru pomiędzy piłką a zabezpieczeniem partnera."
        : "Rywal może skoncentrować się na jednym bodźcu, ponieważ nie musi jeszcze wybierać pomiędzy dwiema opcjami.";

  const tags = [
    `${moves.length} ${moves.length === 1 ? "ruch" : "ruchy"}`,
    `${passes.length} ${passes.length === 1 ? "podanie" : "podania"}`,
    hasControlledMove ? "własny ruch" : "ruch partnera",
  ];

  return {
    verdict,
    verdictLabel: verdict === "strong" ? "MOCNY WARIANT" : verdict === "conditional" ? "WARUNKOWY WARIANT" : "RYZYKOWNY WARIANT",
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
  if (!controlled) return { actions: [] };

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

  return { actions: ordered };
};

export const emptyPlan = (): UserPlan => ({ actions: [] });
