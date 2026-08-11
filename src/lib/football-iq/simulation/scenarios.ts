import { ADVANCED_SCENARIOS } from "./library";
import type { SimScenario } from "./types";

/**
 * Scenariusz wzorcowy: stoper prowadzi piłkę, zawodnik stoi w cieniu podania
 * szóstki rywala, która kontroluje przestrzeń między liniami.
 */
export const shadowReceiveScenario: SimScenario = {
  id: "shadow-receive-6",
  title: "Wyjście z cienia podania",
  topic: "between_lines",
  positions: ["midfielder"],
  status: "sourced",
  sourceReference: {
    label: "UEFA Coaching Convention — materiały metodyczne dla trenerów A/Pro",
    url: "https://uefatechnicalreports.com/",
  },
  brief:
    "Stoper prowadzi piłkę do przodu. Stoisz w cieniu podania szóstki rywala, która kontroluje przestrzeń.",

  context: {
    minute: 63,
    scoreline: "1:1",
    phase: "Budowanie akcji",
    positionLabel: "Pomocnik",
    weights: {
      timing: 1.2,
      body: 1.1,
      progression: 1.3,
      advantage: 1,
      risk: 1.4,
    },
    weightsNote:
      "63. minuta przy 1:1 — progresja i kontrola ryzyka ważą więcej niż efektowność.",
  },
  observationMs: 6500,
  decisionMs: 2000,

  actors: [
    {
      id: "ball",
      kind: "ball",
      path: [
        { t: 0, x: 31, y: 119 },
        { t: 1, x: 39, y: 113 },
      ],
    },
    {
      id: "cb",
      kind: "mate",
      label: "Stoper",
      path: [
        { t: 0, x: 29, y: 121 },
        { t: 1, x: 37, y: 115 },
      ],
    },
    {
      id: "lb",
      kind: "mate",
      label: "Boczny",
      path: [
        { t: 0, x: 11, y: 104 },
        { t: 1, x: 10, y: 96 },
      ],
    },
    {
      id: "st",
      kind: "mate",
      label: "Napastnik",
      path: [
        { t: 0, x: 58, y: 42 },
        { t: 1, x: 54, y: 36 },
      ],
    },
    {
      id: "rw",
      kind: "mate",
      label: "Skrzydłowy",
      path: [
        { t: 0, x: 88, y: 72 },
        { t: 1, x: 87, y: 62 },
      ],
    },
    {
      id: "self",
      kind: "self",
      path: [
        { t: 0, x: 58, y: 97 },
        { t: 1, x: 56, y: 94 },
      ],
    },
    {
      id: "opp6",
      kind: "opponent",
      label: "Szóstka",
      path: [
        { t: 0, x: 50, y: 86 },
        { t: 0.6, x: 48, y: 88 },
        { t: 1, x: 46, y: 90 },
      ],
    },
    {
      id: "oppst",
      kind: "opponent",
      path: [
        { t: 0, x: 34, y: 111 },
        { t: 1, x: 40, y: 107 },
      ],
    },
    {
      id: "opp8",
      kind: "opponent",
      path: [
        { t: 0, x: 72, y: 80 },
        { t: 1, x: 67, y: 83 },
      ],
    },
  ],
  timingWindows: [
    {
      id: "early",
      fromMs: 0,
      toMs: 2600,
      label: "Za wcześnie",
      quality: 0.45,
      note: "Ruszyłeś, zanim stoper wziął piłkę pod kontrolę — szóstka zdążyła skorygować pozycję.",
    },
    {
      id: "prime",
      fromMs: 2601,
      toMs: 4900,
      label: "Właściwy moment",
      quality: 0.95,
      note: "Ruszyłeś w chwili, gdy szóstka obracała biodra do piłki — straciła Cię z pola widzenia.",
    },
    {
      id: "late",
      fromMs: 4901,
      toMs: 6500,
      label: "Późno",
      quality: 0.6,
      note: "Ruch był czytelny — rywal zdążył ustawić się między Tobą a piłką.",
    },
  ],

  timingMissNote:
    "Nie ruszyłeś w oknie podania — stoper musiał grać wstecz i akcja się zatrzymała.",
  zones: [
    {
      id: "half-space",
      x: 68,
      y: 84,
      radius: 15,
      label: "Wyjście w półprzestrzeń",
      quality: 0.9,
      note: "Wyszedłeś z cienia bokiem — masz piłkę i rywala w jednym polu widzenia.",
      reaction: "stays",
    },
    {
      id: "between-lines",
      x: 45,
      y: 76,
      radius: 13,
      label: "Między liniami",
      quality: 0.78,
      note: "Zająłeś przestrzeń między liniami, ale wszedłeś w strefę kontrolowaną przez szóstkę.",
      reaction: "closes_center",
    },
    {
      id: "drop",
      x: 55,
      y: 109,
      radius: 14,
      label: "Cofnięcie do piłki",
      quality: 0.52,
      note: "Cofnięcie ułatwia podanie, ale oddaje metry i zaprasza rywala do doskoku.",
      reaction: "jumps",
    },
  ],
  zoneMissNote:
    "Zostałeś w cieniu podania — stoper nie miał do Ciebie linii podania.",
  defaultReaction: "stays",
  bodyAngles: [
    {
      id: "half-open",
      centerDeg: 45,
      toleranceDeg: 35,
      label: "Półotwarte ustawienie",
      quality: 0.95,
      note: "Półotwarte biodra: widzisz piłkę i przód boiska jednocześnie.",
    },
    {
      id: "front",
      centerDeg: 0,
      toleranceDeg: 25,
      label: "Ustawienie w przód",
      quality: 0.7,
      note: "Ustawienie w przód daje progresję, ale tracisz z oczu rywala za plecami.",
    },
    {
      id: "to-ball",
      centerDeg: 180,
      toleranceDeg: 45,
      label: "Twarzą do piłki",
      quality: 0.4,
      note: "Twarzą do piłki: bezpiecznie, ale każde przyjęcie kończy się grą wstecz.",
    },
  ],
  bodyMissNote: "Ustawienie bokiem do gry utrudnia zarówno przyjęcie, jak i obrót.",
  feet: [
    {
      foot: "right",
      quality: 0.9,
      note: "Przyjęcie dalszą nogą chroni piłkę przed rywalem.",
    },
    {
      foot: "left",
      quality: 0.5,
      note: "Przyjęcie bliższą nogą wystawia piłkę na wystawioną nogę rywala.",
    },
  ],
  reactions: [
    {
      id: "closes_center",
      label: "Rywal zamyka środek",
      description: "Szóstka cofa się i domyka linię podania do środka.",
      moves: [
        { actorId: "opp6", x: 48, y: 74 },
        { actorId: "opp8", x: 62, y: 86 },
      ],
    },
    {
      id: "jumps",
      label: "Rywal doskakuje",
      description: "Szóstka wypada z linii i atakuje Cię w momencie przyjęcia.",
      moves: [
        { actorId: "opp6", x: 55, y: 101 },
        { actorId: "opp8", x: 70, y: 86 },
      ],
    },
    {
      id: "stays",
      label: "Rywal zostaje w strefie",
      description: "Szóstka nie wychodzi — trzyma pozycję i pilnuje środka.",
      moves: [
        { actorId: "opp6", x: 47, y: 88 },
        { actorId: "opp8", x: 72, y: 82 },
      ],
    },
  ],
  actions: [
    {
      id: "receive_forward",
      label: "Przyjęcie w przód",
      outcomes: {
        stays: {
          progression: 0.92,
          advantage: 0.88,
          risk: 0.8,
          consequence:
            "Pierwszy kontakt w wolną przestrzeń — wchodzisz z piłką za linię pomocy rywala.",
          path: [
            { x: 68, y: 84 },
            { x: 70, y: 66 },
          ],
        },
        closes_center: {
          progression: 0.55,
          advantage: 0.45,
          risk: 0.35,
          consequence:
            "Przyjęcie w przód wchodzi wprost w domknięty środek — rywal odbiera piłkę w strefie odbudowy.",
        },
        jumps: {
          progression: 0.62,
          advantage: 0.6,
          risk: 0.4,
          consequence:
            "Przyjęcie w przód przy doskoku rywala kończy się kontaktem i utratą kontroli.",
        },
      },
    },
    {
      id: "back_pass",
      label: "Podanie zwrotne",
      outcomes: {
        stays: {
          progression: 0.35,
          advantage: 0.3,
          risk: 0.95,
          consequence:
            "Bezpieczny zwrot, ale rywal odzyskuje ustawienie i akcja zaczyna się od nowa.",
          path: [
            { x: 68, y: 84 },
            { x: 37, y: 115 },
          ],
        },
        closes_center: {
          progression: 0.45,
          advantage: 0.42,
          risk: 0.92,
          consequence:
            "Zwrot pod domkniętym środkiem utrzymuje piłkę i pozwala przenieść grę na drugą stronę.",
        },
        jumps: {
          progression: 0.5,
          advantage: 0.55,
          risk: 0.9,
          consequence:
            "Rywal wypadł z linii — zwrot zostawia za nim otwartą przestrzeń dla stopera.",
        },
      },
    },
    {
      id: "turn",
      label: "Obrót",
      outcomes: {
        stays: {
          progression: 0.75,
          advantage: 0.7,
          risk: 0.6,
          consequence:
            "Obrót udaje się, ale rywal trzyma dystans i możesz iść tylko w bok.",
        },
        closes_center: {
          progression: 0.4,
          advantage: 0.35,
          risk: 0.3,
          consequence:
            "Obrót w domknięty środek to strata w najgorszej strefie boiska.",
        },
        jumps: {
          progression: 0.9,
          advantage: 0.92,
          risk: 0.62,
          consequence:
            "Obrót mija doskakującego rywala — wychodzisz z piłką na wolne pole między liniami.",
          path: [
            { x: 55, y: 109 },
            { x: 58, y: 88 },
          ],
        },
      },
    },
    {
      id: "third_man",
      label: "Gra na trzeciego",
      outcomes: {
        stays: {
          progression: 0.82,
          advantage: 0.85,
          risk: 0.78,
          consequence:
            "Odegranie i natychmiastowy start — piłka trafia do skrzydłowego za linię pomocy.",
          path: [
            { x: 68, y: 84 },
            { x: 37, y: 115 },
            { x: 87, y: 62 },
          ],
        },
        closes_center: {
          progression: 0.88,
          advantage: 0.9,
          risk: 0.75,
          consequence:
            "Domknięty środek zostawia bok — gra na trzeciego omija całą linię pomocy rywala.",
          path: [
            { x: 45, y: 76 },
            { x: 37, y: 115 },
            { x: 87, y: 62 },
          ],
        },
        jumps: {
          progression: 0.7,
          advantage: 0.72,
          risk: 0.55,
          consequence:
            "Trzeci zawodnik jest wolny, ale doskok rywala skraca czas na dokładne odegranie.",
        },
      },
    },
  ],
  alternatives: {
    stays: {
      actionId: "receive_forward",
      changed:
        "Rywal nie wyszedł ze strefy, więc pierwszy kontakt w przód zabierał Cię za jego linię bez oddawania piłki.",
    },
    closes_center: {
      actionId: "third_man",
      changed:
        "Skoro środek był domknięty, odegranie i gra na trzeciego przenosiła akcję poza całą linię pomocy.",
    },
    jumps: {
      actionId: "turn",
      changed:
        "Doskok rywala zostawił za nim przestrzeń — obrót mijał go i otwierał grę do przodu.",
    },
  },
  fallbackOutcome: {
    progression: 0.1,
    advantage: 0.1,
    risk: 0.45,
    consequence:
      "Brak decyzji w oknie czasowym — piłka doszła, gdy rywal był już przy Tobie.",
  },
};

export const SIM_SCENARIOS: SimScenario[] = [
  shadowReceiveScenario,
  ...ADVANCED_SCENARIOS,
];

/** Scenariusze trafne dla danej grupy pozycyjnej (fallback: cała biblioteka). */
export function scenariosForPosition(
  group: "defender" | "midfielder" | "forward",
): SimScenario[] {
  const list = SIM_SCENARIOS.filter((s) => s.positions.includes(group));
  return list.length > 0 ? list : SIM_SCENARIOS;
}

