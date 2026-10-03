import type { PlannedAction, Scenario } from "./types";

const referenceActions: PlannedAction[] = [
  {
    id: "reference-pass",
    type: "pass",
    playerId: "home-8",
    targetId: "home-7",
    from: { x: 51, y: 108 },
    to: { x: 84, y: 79 },
  },
  {
    id: "reference-run",
    type: "run",
    playerId: "home-7",
    from: { x: 84, y: 79 },
    to: { x: 91, y: 37 },
  },
  {
    id: "reference-shift",
    type: "shift",
    playerId: "home-10",
    from: { x: 18, y: 72 },
    to: { x: 39, y: 62 },
  },
];

export const scenarios: Scenario[] = [
  {
    id: "overload-switch-01",
    title: "Przeciążenie i wolna strona",
    question: "Jak wykorzystasz wolną stronę?",
    focus:
      "Blok rywala przesunął się do piłki. Znajdź przewagę po dalszej stronie.",
    seconds: 8,
    controlledPlayerId: "home-8",
    ballCarrierId: "home-8",
    players: [
      {
        id: "gk-away",
        team: "away",
        number: 1,
        role: "BR",
        goalkeeper: true,
        x: 50,
        y: 12,
      },
      { id: "away-4", team: "away", number: 4, role: "ŚO", x: 36, y: 40 },
      { id: "away-5", team: "away", number: 5, role: "ŚO", x: 59, y: 51 },
      { id: "away-7", team: "away", number: 7, role: "SP", x: 29, y: 70 },
      { id: "away-3", team: "away", number: 3, role: "LO", x: 79, y: 82 },
      { id: "away-6", team: "away", number: 6, role: "DP", x: 17, y: 92 },
      { id: "home-10", team: "home", number: 10, role: "LS", x: 18, y: 66 },
      { id: "home-7", team: "home", number: 7, role: "PS", x: 84, y: 79 },
      {
        id: "home-8",
        team: "home",
        number: 8,
        role: "ŚP",
        controlled: true,
        x: 51,
        y: 108,
      },
      { id: "home-11", team: "home", number: 11, role: "N", x: 26, y: 116 },
    ],
    referenceActions,
  },
];
