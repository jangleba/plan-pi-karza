import type {
  Evaluation,
  MatchPlayer,
  PlannedAction,
  Point,
  Scenario,
} from "./types";

export type ResolvedState = {
  positions: Map<string, Point>;
  ballCarrierId: string;
  ball: Point;
};

export const positionAfterActions = (
  players: MatchPlayer[],
  actions: PlannedAction[],
  initialBallCarrierId: string,
): ResolvedState => {
  const positions = new Map(
    players.map((player) => [player.id, { x: player.x, y: player.y }]),
  );
  let ballCarrierId = initialBallCarrierId;

  actions.forEach((action) => {
    if (action.type === "pass") {
      ballCarrierId = action.targetId;
      return;
    }
    positions.set(action.playerId, action.to);
  });

  const ball = positions.get(ballCarrierId) ?? { x: 50, y: 70 };
  return { positions, ballCarrierId, ball };
};

export const currentPlayerPoint = (
  playerId: string,
  players: MatchPlayer[],
  actions: PlannedAction[],
) => {
  const player = players.find((item) => item.id === playerId);
  if (!player) return null;
  const movement = [...actions]
    .reverse()
    .find((action) => action.type !== "pass" && action.playerId === playerId);
  return movement?.to ?? { x: player.x, y: player.y };
};

export const currentBallCarrier = (initial: string, actions: PlannedAction[]) =>
  actions.reduce(
    (carrier, action) => (action.type === "pass" ? action.targetId : carrier),
    initial,
  );

export const evaluateDecision = (
  scenario: Scenario,
  actions: PlannedAction[],
): Evaluation => {
  const state = positionAfterActions(
    scenario.players,
    actions,
    scenario.ballCarrierId,
  );
  const usedFarSide = actions.some(
    (action) => action.to.x >= 76 && action.to.y <= 85,
  );
  const progressedWide = actions.some(
    (action) => action.to.x >= 82 && action.to.y <= 54,
  );
  const switchedPlay = actions.some(
    (action) =>
      action.type === "pass" && action.from.x < 65 && action.to.x >= 76,
  );
  const keptStructure = actions.some(
    (action) =>
      action.type === "shift" && action.playerId !== state.ballCarrierId,
  );

  if (switchedPlay && progressedWide) {
    return {
      level: "strong",
      label: "Dobra decyzja",
      summary:
        "Przeniosłeś akcję poza przesunięty blok i wykorzystałeś wolny korytarz.",
      timing:
        "Zmiana strony nastąpiła, zanim rywal zdążył odbudować ustawienie.",
      space: "Piłka i bieg weszły w strefę poza cieniem krycia.",
      consequence: keptStructure
        ? "Zespół zachował zabezpieczenie i szerokość po podaniu."
        : "Powstała przewaga, ale zabezpieczenie drugiej piłki może być lepsze.",
      recommendation:
        "Utrzymuj zawodnika pod piłką, gdy skrzydłowy atakuje przestrzeń za linią.",
    };
  }

  if (usedFarSide || switchedPlay) {
    return {
      level: "conditional",
      label: "Dobry kierunek",
      summary:
        "Rozpoznałeś wolną stronę, ale akcja nie stworzyła jeszcze pełnej przewagi.",
      timing: "Decyzja pojawiła się we właściwym momencie.",
      space: "Wykorzystałeś szerokość, lecz zabrakło ruchu za linię obrony.",
      consequence: "Rywal może przesunąć blok, zanim zagrozisz bramce.",
      recommendation:
        "Po zmianie strony dodaj natychmiastowy bieg w wolny korytarz.",
    };
  }

  return {
    level: "risky",
    label: "Ryzykowny wariant",
    summary:
      "Akcja pozostała po stronie przeciążenia, gdzie rywal miał przewagę liczebną.",
    timing: "Moment na zmianę strony nie został wykorzystany.",
    space: "Ruch nie wyszedł poza kontrolowaną przez rywala strefę.",
    consequence: "Rywal może zamknąć akcję bez utraty ustawienia.",
    recommendation:
      "Najpierw przenieś piłkę na dalszą stronę, potem zaatakuj przestrzeń biegiem.",
  };
};
