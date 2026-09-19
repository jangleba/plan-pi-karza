import type { SimPitchActor, SimPitchPath } from "@/components/football-iq/SimPitch";

export type IQPlannerCategory = "ball" | "movement" | "defending" | "reading";

export type IQPlannerTool =
  | "pass"
  | "through_ball"
  | "lofted_pass"
  | "cross"
  | "switch_play"
  | "one_two"
  | "cutback"
  | "run"
  | "diagonal_run"
  | "overlap"
  | "underlap"
  | "decoy_run"
  | "third_man"
  | "hold_width"
  | "press"
  | "counterpress"
  | "cover"
  | "block_lane"
  | "offside_line"
  | "press_trap"
  | "scan"
  | "focus_zone"
  | "overload"
  | "isolate";

export type IQPlannerPoint = { x: number; y: number };

export type IQPlanAction = {
  id: string;
  tool: IQPlannerTool;
  actorId?: string;
  from: IQPlannerPoint;
  to: IQPlannerPoint;
};

export type PlannerToolDefinition = {
  id: IQPlannerTool;
  category: IQPlannerCategory;
  label: string;
  shortLabel: string;
  hint: string;
};

export const PLANNER_CATEGORIES: {
  id: IQPlannerCategory;
  label: string;
}[] = [
  { id: "ball", label: "Piłka" },
  { id: "movement", label: "Ruch" },
  { id: "defending", label: "Obrona" },
  { id: "reading", label: "Czytanie" },
];

export const PLANNER_TOOLS: PlannerToolDefinition[] = [
  {
    id: "pass",
    category: "ball",
    label: "Podanie",
    shortLabel: "Podanie",
    hint: "Zagraj po ziemi do zawodnika lub w przestrzeń.",
  },
  {
    id: "through_ball",
    category: "ball",
    label: "Prostopadłe",
    shortLabel: "Prostopadłe",
    hint: "Zagraj za linię obrony w tempo biegu.",
  },
  {
    id: "lofted_pass",
    category: "ball",
    label: "Górne podanie",
    shortLabel: "Górą",
    hint: "Przenieś piłkę nad linią pressingu.",
  },
  {
    id: "cross",
    category: "ball",
    label: "Wrzutka",
    shortLabel: "Wrzutka",
    hint: "Wybierz strefę dośrodkowania w polu karnym.",
  },
  {
    id: "switch_play",
    category: "ball",
    label: "Przerzut",
    shortLabel: "Przerzut",
    hint: "Szybko zmień stronę ataku.",
  },
  {
    id: "one_two",
    category: "ball",
    label: "Klepka",
    shortLabel: "Klepka",
    hint: "Połącz podanie ze startem za rywala.",
  },
  {
    id: "cutback",
    category: "ball",
    label: "Wycofanie",
    shortLabel: "Wycofanie",
    hint: "Zagraj z końcowej linii do zawodnika wbiegającego z drugiej linii.",
  },

  {
    id: "run",
    category: "movement",
    label: "Bieg",
    shortLabel: "Bieg",
    hint: "Zaplanuj prosty ruch bez piłki.",
  },
  {
    id: "diagonal_run",
    category: "movement",
    label: "Bieg diagonalny",
    shortLabel: "Diagonalny",
    hint: "Przetnij linię obrony pod kątem.",
  },
  {
    id: "overlap",
    category: "movement",
    label: "Obiegnięcie",
    shortLabel: "Obiegnięcie",
    hint: "Zawodnik przechodzi zewnętrzną stroną partnera.",
  },
  {
    id: "underlap",
    category: "movement",
    label: "Obiegnięcie wewnętrzne",
    shortLabel: "Wewnętrzne",
    hint: "Zawodnik atakuje wewnętrzny kanał za plecami partnera.",
  },
  {
    id: "decoy_run",
    category: "movement",
    label: "Ruch pozorny",
    shortLabel: "Pozorny",
    hint: "Odciągnij rywala, aby otworzyć przestrzeń partnerowi.",
  },
  {
    id: "third_man",
    category: "movement",
    label: "Trzeci zawodnik",
    shortLabel: "Trzeci",
    hint: "Uruchom zawodnika, który nie uczestniczył w pierwszym podaniu.",
  },
  {
    id: "hold_width",
    category: "movement",
    label: "Utrzymaj szerokość",
    shortLabel: "Szerokość",
    hint: "Rozciągnij linię przeciwnika przy linii bocznej.",
  },

  {
    id: "press",
    category: "defending",
    label: "Pressing",
    shortLabel: "Pressing",
    hint: "Wyślij zawodnika do bezpośredniego nacisku.",
  },
  {
    id: "counterpress",
    category: "defending",
    label: "Kontrpressing",
    shortLabel: "Kontrpressing",
    hint: "Zamknij najbliższą opcję natychmiast po stracie.",
  },
  {
    id: "cover",
    category: "defending",
    label: "Asekuracja",
    shortLabel: "Asekuracja",
    hint: "Ustaw zabezpieczenie za zawodnikiem pressującym.",
  },
  {
    id: "block_lane",
    category: "defending",
    label: "Zamknij linię",
    shortLabel: "Linia podania",
    hint: "Ustaw zawodnika w torze podania przeciwnika.",
  },
  {
    id: "offside_line",
    category: "defending",
    label: "Linia spalonego",
    shortLabel: "Spalony",
    hint: "Ustaw wysokość wspólnego wyjścia linii obrony.",
  },
  {
    id: "press_trap",
    category: "defending",
    label: "Pułapka pressingowa",
    shortLabel: "Pułapka",
    hint: "Wskaż strefę, do której zespół chce skierować grę rywala.",
  },

  {
    id: "scan",
    category: "reading",
    label: "Skan",
    shortLabel: "Skan",
    hint: "Zaznacz zawodnika lub przestrzeń, którą trzeba sprawdzić przed kontaktem.",
  },
  {
    id: "focus_zone",
    category: "reading",
    label: "Kluczowa strefa",
    shortLabel: "Strefa",
    hint: "Zaznacz obszar decydujący o akcji.",
  },
  {
    id: "overload",
    category: "reading",
    label: "Przewaga liczebna",
    shortLabel: "Przewaga",
    hint: "Wskaż sektor, w którym chcesz stworzyć przewagę.",
  },
  {
    id: "isolate",
    category: "reading",
    label: "Izolacja 1 na 1",
    shortLabel: "Izolacja",
    hint: "Wskaż sektor, w którym chcesz zostawić zawodnika jeden na jednego.",
  },
];

const BALL_TOOLS = new Set<IQPlannerTool>([
  "pass",
  "through_ball",
  "lofted_pass",
  "cross",
  "switch_play",
  "one_two",
  "cutback",
]);

const MOVING_TOOLS = new Set<IQPlannerTool>([
  "run",
  "diagonal_run",
  "overlap",
  "underlap",
  "decoy_run",
  "third_man",
  "hold_width",
  "press",
  "counterpress",
  "cover",
  "block_lane",
]);

const ZONE_TOOLS = new Set<IQPlannerTool>([
  "press_trap",
  "scan",
  "focus_zone",
  "overload",
  "isolate",
]);

export function toolDefinition(tool: IQPlannerTool) {
  return PLANNER_TOOLS.find((item) => item.id === tool)!;
}

export function toolNeedsActor(tool: IQPlannerTool) {
  return BALL_TOOLS.has(tool) || MOVING_TOOLS.has(tool);
}

export function toolMovesActor(tool: IQPlannerTool) {
  return MOVING_TOOLS.has(tool);
}

export function toolMovesBall(tool: IQPlannerTool) {
  return BALL_TOOLS.has(tool);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function circlePoints(center: IQPlannerPoint, radius: number, steps = 20) {
  const points: IQPlannerPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({
      x: clamp(center.x + Math.cos(angle) * radius, 3, 97),
      y: clamp(center.y + Math.sin(angle) * radius, 3, 137),
    });
  }
  return points;
}

function curved(from: IQPlannerPoint, to: IQPlannerPoint, bend: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  return [
    from,
    {
      x: clamp((from.x + to.x) / 2 + normal.x * bend, 3, 97),
      y: clamp((from.y + to.y) / 2 + normal.y * bend, 3, 137),
    },
    to,
  ];
}

export function planActionPath(action: IQPlanAction, order?: number): SimPitchPath {
  const definition = toolDefinition(action.tool);
  if (action.tool === "offside_line") {
    return {
      points: [
        { x: 3, y: action.to.y },
        { x: 97, y: action.to.y },
      ],
      variant: "offside",
      label: definition.shortLabel,
      order,
    };
  }

  if (action.tool === "press_trap") {
    const { x, y } = action.to;
    return {
      points: [
        { x: clamp(x - 11, 3, 97), y: clamp(y + 9, 3, 137) },
        { x: clamp(x + 11, 3, 97), y: clamp(y + 9, 3, 137) },
        { x, y: clamp(y - 12, 3, 137) },
        { x: clamp(x - 11, 3, 97), y: clamp(y + 9, 3, 137) },
      ],
      variant: "trap",
      label: definition.shortLabel,
      order,
    };
  }

  if (ZONE_TOOLS.has(action.tool)) {
    return {
      points: circlePoints(action.to, action.tool === "scan" ? 7 : 11),
      variant: "zone",
      label: definition.shortLabel,
      order,
    };
  }

  let points = [action.from, action.to];
  if (action.tool === "cross" || action.tool === "lofted_pass") {
    points = curved(action.from, action.to, 9);
  } else if (action.tool === "switch_play") {
    points = curved(action.from, action.to, 13);
  } else if (
    action.tool === "overlap" ||
    action.tool === "underlap" ||
    action.tool === "decoy_run"
  ) {
    points = curved(action.from, action.to, action.tool === "underlap" ? -6 : 6);
  }

  const variant: SimPitchPath["variant"] = BALL_TOOLS.has(action.tool)
    ? action.tool === "cross"
      ? "cross"
      : action.tool === "lofted_pass" || action.tool === "switch_play"
        ? "lofted"
        : "pass"
    : action.tool === "press" || action.tool === "counterpress"
      ? "press"
      : action.tool === "cover" || action.tool === "block_lane"
        ? "cover"
        : action.tool === "overlap" || action.tool === "underlap"
          ? "overlap"
          : "run";

  return { points, variant, label: definition.shortLabel, order };
}

export function applyPlanToActors(
  actors: SimPitchActor[],
  actions: IQPlanAction[],
  progress: number,
) {
  const p = clamp(progress, 0, 1);
  const movementByActor = new Map<string, IQPlanAction>();
  const ballActions: IQPlanAction[] = [];

  for (const action of actions) {
    if (action.actorId && toolMovesActor(action.tool)) {
      movementByActor.set(action.actorId, action);
    }
    if (toolMovesBall(action.tool)) ballActions.push(action);
  }

  const ballSegment = ballActions.length
    ? Math.min(ballActions.length - 1, Math.floor(p * ballActions.length))
    : 0;
  const ballProgress = ballActions.length ? Math.min(1, p * ballActions.length - ballSegment) : 0;

  return actors.map((actor) => {
    if (actor.kind === "opponent") return actor;
    const action = actor.kind === "ball" ? ballActions[ballSegment] : movementByActor.get(actor.id);
    if (!action) return actor;
    const actorProgress = actor.kind === "ball" ? ballProgress : p;
    return {
      ...actor,
      x: action.from.x + (action.to.x - action.from.x) * actorProgress,
      y: action.from.y + (action.to.y - action.from.y) * actorProgress,
      facingDeg:
        actor.kind === "ball"
          ? actor.facingDeg
          : (Math.atan2(action.to.x - action.from.x, -(action.to.y - action.from.y)) * 180) /
            Math.PI,
    };
  });
}

export function planSummary(actions: IQPlanAction[]) {
  const ball = actions.find((action) => toolMovesBall(action.tool));
  const runs = actions.filter((action) => toolMovesActor(action.tool));
  const hasTrap = actions.some((action) => action.tool === "press_trap");
  const hasOffside = actions.some((action) => action.tool === "offside_line");
  const hasReading = actions.some((action) => ZONE_TOOLS.has(action.tool));

  if (hasOffside) {
    return {
      title: "Wyjście linią w odpowiednim momencie",
      signal: "Podający podnosi głowę, a napastnik startuje za wcześnie.",
      decision: "Cała linia wychodzi razem — nie pojedynczy obrońca.",
      effect: "Skracasz pole gry i uruchamiasz pułapkę ofsajdową.",
    };
  }
  if (hasTrap) {
    return {
      title: "Skieruj rywala do zaplanowanej pułapki",
      signal: "Rywal przyjmuje piłkę zamkniętą stroną ciała.",
      decision: "Pierwszy naciska, pozostali zamykają wyjścia.",
      effect: "Odbiór następuje w wybranym sektorze, a nie przypadkowo.",
    };
  }
  if (ball && runs.length >= 2) {
    return {
      title: "Połącz podanie z ruchem kilku zawodników",
      signal: "Linia rywala skupia się na posiadaczu piłki.",
      decision: `${toolDefinition(ball.tool).label} oraz ${runs.length} skoordynowane biegi.`,
      effect: "Jeden ruch otwiera kanał, drugi wykorzystuje powstałą przewagę.",
    };
  }
  if (ball) {
    return {
      title: toolDefinition(ball.tool).label,
      signal: "Okno podania jest krótkie i zależy od ustawienia ciała rywala.",
      decision: "Zagraj w przestrzeń, zanim obrońca zdąży ją zamknąć.",
      effect: "Przyspieszasz atak bez dokładania zbędnego kontaktu.",
    };
  }
  if (runs.length) {
    return {
      title: "Ruch bez piłki zmienia sytuację",
      signal: "Obrońcy kontrolują piłkę i tracą kontakt z zawodnikiem za plecami.",
      decision: `${runs.length} ${runs.length === 1 ? "ruch" : "skoordynowane ruchy"} bez piłki.`,
      effect: "Tworzysz nowy kąt podania i przesuwasz linię obrony.",
    };
  }
  if (hasReading) {
    return {
      title: "Najpierw zauważ, potem zdecyduj",
      signal: "Wolna przestrzeń pojawia się przed kontaktem z piłką.",
      decision: "Skanuj zawodnika, najbliższego rywala i dalszy sektor.",
      effect: "Decyzja jest wcześniejsza, spokojniejsza i trudniejsza do zatrzymania.",
    };
  }
  return {
    title: "Zbuduj własne rozwiązanie",
    signal: "Najpierw odczytaj ustawienie przeciwnika.",
    decision: "Połącz ruch, podanie i właściwy moment.",
    effect: "Zobaczysz konsekwencję po odtworzeniu akcji.",
  };
}

export function closestScenarioActionId(
  actions: IQPlanAction[],
  scenarioActions: { id: string; label: string }[],
) {
  if (!scenarioActions.length) return null;
  const planned = actions.find((action) => toolMovesBall(action.tool));
  if (!planned) return scenarioActions[0].id;
  const keywords: Record<IQPlannerTool, string[]> = {
    pass: ["podaj", "podanie", "graj"],
    through_ball: ["prostop", "za lini", "kanał"],
    lofted_pass: ["gór", "lob"],
    cross: ["wrzut", "dośrodk"],
    switch_play: ["przerzut", "zmień", "druga strona"],
    one_two: ["klep", "ściana"],
    cutback: ["wycof", "wstecz"],
    run: [],
    diagonal_run: [],
    overlap: [],
    underlap: [],
    decoy_run: [],
    third_man: [],
    hold_width: [],
    press: [],
    counterpress: [],
    cover: [],
    block_lane: [],
    offside_line: [],
    press_trap: [],
    scan: [],
    focus_zone: [],
    overload: [],
    isolate: [],
  };
  const match = scenarioActions.find((action) => {
    const label = action.label.toLocaleLowerCase("pl");
    return keywords[planned.tool].some((keyword) => label.includes(keyword));
  });
  return match?.id ?? scenarioActions[0].id;
}
