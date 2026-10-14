import type { Evaluation, MatchPlayer, PlannedAction, Point, Scenario } from "./types";
import { simulate, distance } from "./simulation";
export type ResolvedState = { positions: Map<string, Point>; ballCarrierId: string; ball: Point };
export const positionAfterActions = (
  players: MatchPlayer[],
  actions: PlannedAction[],
  initialBallCarrierId: string,
): ResolvedState => {
  const positions = new Map(players.map((p) => [p.id, { x: p.x, y: p.y }]));
  let ballCarrierId = initialBallCarrierId;
  for (const a of actions) {
    if (a.type === "pass") ballCarrierId = a.targetId;
    else if (a.type !== "shot") positions.set(a.playerId, a.to);
  }
  return { positions, ballCarrierId, ball: positions.get(ballCarrierId) ?? { x: 50, y: 70 } };
};
export const currentPlayerPoint = (id: string, players: MatchPlayer[], actions: PlannedAction[]) =>
  positionAfterActions(players, actions, players[0]?.id ?? "").positions.get(id) ?? null;
export const currentBallCarrier = (initial: string, actions: PlannedAction[]) =>
  actions.reduce((c, a) => (a.type === "pass" ? a.targetId : c), initial);
export function evaluateDecision(
  s: Scenario,
  actions: PlannedAction[],
  decisionSeconds?: number,
): Evaluation {
  const sim = simulate(
    { ...s, simulation: s.simulation ?? { reaction: 1.35, defenderSpeed: 1.8 } },
    actions,
  );
  const completed = new Map<string, number>();
  const moves = sim.events.filter((e) => e.kind === "move");
  for (const e of sim.events) {
    if (e.kind !== "pass" && e.kind !== "move" && e.kind !== "shot") continue;
    for (const goal of s.goals ?? []) {
      const a = actions[e.actionIndex];
      const compatible = goal.type === a.type;
      if (
        compatible &&
        (!goal.playerIds || goal.playerIds.includes(a.playerId)) &&
        (!goal.targetIds || (a.type === "pass" && goal.targetIds.includes(a.targetId))) &&
        (!goal.requiresBall || e.hadBall) &&
        (!goal.afterGoalId ||
          (completed.has(goal.afterGoalId) && completed.get(goal.afterGoalId)! < e.actionIndex)) &&
        (!goal.zone ||
          (e.point.x >= goal.zone.xMin &&
            e.point.x <= goal.zone.xMax &&
            e.point.y >= goal.zone.yMin &&
            e.point.y <= goal.zone.yMax))
      )
        completed.set(goal.id, e.actionIndex);
    }
  }
  const initialBall = sim.initial.ball,
    finalBall = sim.final.ball;
  const progress = initialBall.y - finalBall.y;
  const successShot = sim.events.some((e) => e.kind === "shot");
  const passes = sim.events.filter((e) => e.kind === "pass");
  const legitimateCarry = moves.some((e) => e.hadBall && e.from && e.from.y - e.point.y >= 12);
  const homePossession = s.players.find((p) => p.id === sim.final.ballCarrierId)?.team === "home";
  const nearestDefender = Math.min(
    ...s.players
      .filter((p) => p.team === "away" && !p.goalkeeper)
      .map((p) => distance(sim.final.positions.get(p.id)!, finalBall)),
  );
  const tacticalProgress =
    legitimateCarry && progress >= 12 && homePossession && nearestDefender > 3.5;
  const outcomeGoals = s.goals?.filter((g) => g.requiresBall && g.zone) ?? [];
  const alternative =
    outcomeGoals.some(
      (g) =>
        finalBall.x >= g.zone!.xMin &&
        finalBall.x <= g.zone!.xMax &&
        finalBall.y >= g.zone!.yMin &&
        finalBall.y <= g.zone!.yMax,
    ) &&
    tacticalProgress &&
    passes.length > 0;
  let strong =
    !sim.lost &&
    sim.valid &&
    actions.length > 0 &&
    (s.goals?.length ? completed.size === s.goals.length || alternative : tacticalProgress);
  let partial = sim.valid && !sim.lost && (completed.size > 0 || passes.length > 0 || progress > 4);
  if (s.defensive) {
    const actor = sim.final.positions.get(s.controlledPlayerId)!;
    const pressed = moves.some((e) => e.actionType === "press");
    const covered = moves.some(
      (e) =>
        e.actionType === "cover" && e.point.y > finalBall.y && distance(e.point, finalBall) < 20,
    );
    const marked = moves.some((e) => {
      const a = actions[e.actionIndex];
      if (a.type !== "mark" || !a.opponentId) return false;
      const opponent = sim.final.positions.get(a.opponentId);
      return !!opponent && distance(e.point, opponent) < 6;
    });
    strong =
      sim.valid &&
      !sim.lost &&
      (homePossession || covered || marked || (pressed && distance(actor, finalBall) < 5));
    partial = sim.valid && !sim.lost && moves.length > 0;
  }
  const failure = sim.events.find(
    (e) =>
      ["invalid", "interception", "tackle", "blocked", "saved"].includes(e.kind) &&
      !(e.kind === "tackle" && homePossession),
  );
  const level = strong ? "strong" : partial ? "conditional" : "risky";
  const c = s.coaching;
  const last = sim.events.at(-1);
  const elapsedText =
    typeof decisionSeconds === "number"
      ? `Plan zatwierdzony po ${decisionSeconds.toFixed(1)} s. `
      : "";
  return {
    level,
    label: strong ? "Skuteczny wariant" : partial ? "Dobry początek" : "Zmień rozwiązanie",
    summary:
      failure?.text ??
      (successShot && !strong
        ? "Strzał zakończył plan, ale cel taktyczny nie został jeszcze osiągnięty."
        : alternative && completed.size !== s.goals?.length
          ? "Inna sekwencja doprowadziła piłkę w dostępny korytarz i pozwoliła kontynuować atak."
          : strong
            ? (c?.success ?? "Działanie stworzyło przewagę w tej sytuacji.")
            : partial
              ? (c?.partial ??
                "Akcja jest poprawna, ale nie wykorzystuje jeszcze całej przestrzeni.")
              : (c?.risk ?? "Ustawienie nie dało przewagi.")),
    timing:
      elapsedText +
      (failure
        ? `Problem pojawił się w akcji ${failure.actionIndex + 1}, po ${failure.time.toFixed(1)} s odtwarzania.`
        : "Kolejność i skutek działań widać na powtórce."),
    space: failure
      ? "Sprawdź zaznaczony tor piłki i pozycję najbliższego rywala."
      : s.defensive
        ? "Porównaj pozycję obrońcy, piłki i partnera wymagającego asekuracji."
        : `Piłka zakończyła akcję ${Math.max(0, progress * 0.68).toFixed(0)} m bliżej bramki.`,
    consequence: failure
      ? "Sekwencja została zatrzymana w miejscu utraty lub zablokowania piłki."
      : strong
        ? (c?.consequence ?? "Zespół zachował możliwość kontynuowania akcji.")
        : "Kolejny ruch lub podanie powinno wykorzystać stworzoną przestrzeń.",
    recommendation: strong
      ? successShot
        ? "Porównaj wcześniejsze ruchy i opcje podania. Zakończenie strzałem było opcjonalne."
        : s.defensive
          ? homePossession
            ? "Po odbiorze poszukaj pierwszego podania do wolnego partnera."
            : "Utrzymaj asekurację i reaguj na dalszy ruch piłki."
          : finalBall.x < 20 || finalBall.x > 80
            ? "Po wejściu skrzydłem poszukaj partnera w polu karnym."
            : finalBall.y < 35
              ? "Sprawdź ustawienie partnerów i dostępne miejsce do kolejnego podania."
              : "Zachowaj opcję podania za piłką, aby móc kontynuować akcję."
      : failure?.kind === "invalid"
        ? "Wybierz działanie dostępne dla aktualnego posiadacza piłki."
        : failure?.kind === "interception"
          ? "Zmień kąt podania, znajdź wsparcie lub zagraj w przestrzeń przed partnerem."
          : failure?.kind === "tackle"
            ? "Zagraj wcześniej lub poprowadź piłkę poza kierunek doskoku."
            : failure?.kind === "blocked" || failure?.kind === "saved"
              ? "Poszukaj innego kierunku strzału albo partnera w lepszej pozycji."
              : (c?.recommendation ??
                (s.defensive
                  ? "Ustaw się po stronie bramki i ogranicz najgroźniejszy kierunek gry."
                  : "Po podaniu wykorzystaj przewagę prowadzeniem albo ruchem partnera.")),
    highlights: [failure?.point ?? last?.point ?? finalBall],
    events: sim.events.map((e) => ({ text: e.text, time: e.time, actionIndex: e.actionIndex })),
    decisionSeconds,
  };
}
