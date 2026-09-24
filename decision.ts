// Czyste funkcje decyzji Football IQ — bez UI, bez heurystyk tekstowych.
// Wynik zależy wyłącznie od momentu zatrzymania, punktu i jawnie wybranej akcji.

import { findZone } from "./simulation/engine";
import type {
  SimActionOutcome,
  SimChoice,
  SimResult,
  SimScenario,
  SimTopic,
} from "./simulation/types";
import type { IQPositionGroup } from "./types";
import {
  toolMovesActor,
  type IQPlanAction,
  type IQPlannerPoint,
  type IQPlannerTool,
} from "./planner";

/** Narzędzia planera dopasowane do tematu sceny. Bramkarz nie dostaje palety. */
const TOPIC_TOOLS: Record<SimTopic, IQPlannerTool[]> = {
  press_manipulation: [
    "position",
    "pass",
    "lofted_pass",
    "switch_play",
    "run",
    "decoy_run",
  ],
  third_man: [
    "position",
    "pass",
    "one_two",
    "third_man",
    "run",
    "diagonal_run",
  ],
  overload_isolate: [
    "position",
    "pass",
    "switch_play",
    "overlap",
    "underlap",
    "hold_width",
    "overload",
    "isolate",
  ],
  positional_rotation: [
    "position",
    "pass",
    "run",
    "decoy_run",
    "underlap",
    "hold_width",
  ],
  between_lines: [
    "position",
    "pass",
    "through_ball",
    "third_man",
    "run",
    "diagonal_run",
  ],
  weak_side_exit: [
    "position",
    "pass",
    "switch_play",
    "lofted_pass",
    "hold_width",
    "run",
  ],
  press_trap: [
    "position",
    "press",
    "cover",
    "block_lane",
    "press_trap",
    "offside_line",
  ],
  rest_defence: [
    "position",
    "cover",
    "block_lane",
    "offside_line",
    "counterpress",
  ],
  counterpress: [
    "position",
    "counterpress",
    "press",
    "cover",
    "block_lane",
    "press_trap",
  ],
  transition: [
    "position",
    "pass",
    "through_ball",
    "cross",
    "cutback",
    "run",
    "diagonal_run",
    "counterpress",
  ],
};

/**
 * Pełna akcja jest wystarczająco długa, żeby odczytać strukturę, ale nie porusza
 * się w tempie prezentacji slajdów. Pięć zmian mieści się w jednym, meczowym rytmie.
 */
export const ADVANCED_SEQUENCE_MS = 8_400;

export type AdvancedSequence = {
  phases: readonly [string, string, string, string, string];
  question: string;
};

/**
 * Każdy temat ma pięć taktycznych faz. Złożoność wynika z kolejnych zależności,
 * nie z testowania refleksu albo zatrzymania animacji w konkretnej milisekundzie.
 */
const ADVANCED_SEQUENCES: Record<SimTopic, AdvancedSequence> = {
  press_manipulation: {
    phases: ["Prowokacja", "Doskok", "Rotacja", "Wolny gracz", "Progresja"],
    question: "Rywal zmienił kierunek pressingu. Jak zachowasz przewagę?",
  },
  third_man: {
    phases: ["Przyciągnięcie", "Odegranie", "Ruch", "Trzeci", "Przewaga"],
    question:
      "Pierwsza linia została związana. Jak uruchomisz trzeciego zawodnika?",
  },
  overload_isolate: {
    phases: ["Przeciążenie", "Reakcja", "Utrzymanie", "Zmiana", "Izolacja"],
    question:
      "Blok rywala przesunął się do piłki. Jak wykorzystasz dalszą stronę?",
  },
  positional_rotation: {
    phases: ["Struktura", "Rotacja", "Reakcja", "Nowa linia", "Progresja"],
    question: "Rotacja zmieniła krycie. Który ruch utrzyma strukturę?",
  },
  between_lines: {
    phases: ["Budowanie", "Cień", "Wyjście", "Reakcja", "Gra dalej"],
    question: "Środek został domknięty. Jak utrzymasz kolejną linię podania?",
  },
  weak_side_exit: {
    phases: ["Skupienie", "Zamknięcie", "Utrzymanie", "Zmiana", "Wyjście"],
    question: "Rywal skupił blok przy piłce. Jak wyjdziesz słabą stroną?",
  },
  press_trap: {
    phases: ["Kierunek", "Zamknięcie", "Doskok", "Asekuracja", "Odbiór"],
    question: "Rywal wszedł w przygotowaną strefę. Jak domkniesz pułapkę?",
  },
  rest_defence: {
    phases: ["Atak", "Strata", "Reakcja", "Asekuracja", "Kontrola"],
    question:
      "Struktura ataku została naruszona. Jak zabezpieczysz kolejną akcję?",
  },
  counterpress: {
    phases: ["Strata", "Doskok", "Zamknięcie", "Asekuracja", "Odbiór"],
    question: "Pierwszy doskok zmienił opcje rywala. Jak utrzymasz zamknięcie?",
  },
  transition: {
    phases: [
      "Odbiór",
      "Pierwszy ruch",
      "Reakcja",
      "Druga decyzja",
      "Progresja",
    ],
    question: "Pierwsza przewaga się zmieniła. Jak rozegrasz drugą decyzję?",
  },
};

export function advancedSequenceFor(topic: SimTopic): AdvancedSequence {
  return ADVANCED_SEQUENCES[topic];
}

export function sequencePhaseOf(progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  if (p < 0.18) return 0;
  if (p < 0.38) return 1;
  if (p < 0.6) return 2;
  if (p < 0.82) return 3;
  return 4;
}

/** Stały punkt obliczeniowy silnika — użytkownik nie jest oceniany za timing. */
export function decisionAnchorMs(scenario: SimScenario) {
  const prime = scenario.timingWindows.find((window) => window.id === "prime");
  if (prime) return Math.round((prime.fromMs + prime.toMs) / 2);
  return Math.round(scenario.observationMs * 0.58);
}

export function toolsForScenario(
  topic: SimTopic,
  group: IQPositionGroup,
): IQPlannerTool[] {
  if (group === "goalkeeper") return [];
  return [...TOPIC_TOOLS[topic]];
}

/** Moment decyzji z realnego zatrzymania (t = 0..1). */
export function freezeTiming(t: number, observationMs: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return { t: clamped, timingMs: Math.round(clamped * observationMs) };
}

/**
 * Punkt użytkownika: a) ostatni ruch „self” z planu, b) dotknięcie boiska przez GK,
 * c) realna pozycja „self” w klatce zatrzymania.
 */
export function userDecisionPoint(input: {
  plan: IQPlanAction[];
  selfId: string | undefined;
  goalkeeperPoint: IQPlannerPoint | null;
  freezeSelf: IQPlannerPoint;
}): IQPlannerPoint {
  const { plan, selfId, goalkeeperPoint, freezeSelf } = input;
  if (selfId) {
    const lastSelfMove = [...plan]
      .reverse()
      .find(
        (action) => action.actorId === selfId && toolMovesActor(action.tool),
      );
    if (lastSelfMove) return { ...lastSelfMove.to };
  }
  if (goalkeeperPoint) return { ...goalkeeperPoint };
  return { ...freezeSelf };
}

/** Wybór do silnika: dokładne actionId, bez kąta ciała i nogi, jeśli ich nie wybrano. */
export function buildChoice(input: {
  timingMs: number;
  point: IQPlannerPoint;
  actionId: string;
}): SimChoice {
  return {
    timingMs: input.timingMs,
    x: input.point.x,
    y: input.point.y,
    actionId: input.actionId,
  };
}

export function canPlayDecision(input: {
  group: IQPositionGroup;
  selectedActionId: string | null;
  goalkeeperPoint: IQPlannerPoint | null;
  timingMs: number | null;
  planLength?: number;
}) {
  if (!input.selectedActionId || input.timingMs == null) return false;
  if (input.group === "goalkeeper") return Boolean(input.goalkeeperPoint);
  return (input.planLength ?? 0) > 0;
}

function firstSentence(text: string | undefined) {
  if (!text) return "";
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

export type DecisionLesson = {
  key: "structure" | "consequence" | "alternative";
  label: string;
  text: string;
};

/** Trzy krótkie wnioski wyłącznie z danych sceny i wyniku. */
export function decisionLessons(
  scenario: SimScenario,
  result: SimResult,
  choice: SimChoice,
): DecisionLesson[] {
  const zone = findZone(scenario, choice.x, choice.y);
  const actionLabel = result.action?.label ?? "Brak akcji";
  const zoneNote = firstSentence(zone?.note ?? scenario.zoneMissNote);
  const consequence = firstSentence(result.outcome.consequence);
  const lessons: DecisionLesson[] = [
    {
      key: "structure",
      label: "Ustawienie",
      text: zoneNote || firstSentence(result.reaction.description),
    },
    {
      key: "consequence",
      label: "Konsekwencja",
      text: `${actionLabel}: ${consequence}`,
    },
    {
      key: "alternative",
      label: "Inny wariant",
      text: firstSentence(
        result.alternative?.changed ?? result.reaction.description,
      ),
    },
  ];
  return lessons.filter((lesson) => lesson.text.length > 0);
}

export type ReplayVariant = "user" | "alt";

export type ReplayView = {
  variant: ReplayVariant;
  label: string;
  outcome: SimActionOutcome;
  path?: { x: number; y: number }[];
  changed?: string;
};

export type SolutionComparison = {
  actionId: string;
  label: string;
  consequence: string;
  status: "strong" | "conditional" | "risky";
  statusLabel: string;
  selected: boolean;
  recommended: boolean;
  score: number;
};

export type DecisionAnalysis = {
  eyebrow: string;
  headline: string;
  explanation: string;
  strength: string;
  risk: string;
  transfer: string;
};

const TOPIC_HEADLINES: Record<
  SimTopic,
  { strong: string; mixed: string; risky: string; transfer: string }
> = {
  press_manipulation: {
    strong: "Wciągnąłeś pressing i otworzyłeś gracza za pierwszą linią.",
    mixed: "Prowokacja pressingu zadziałała, ale następne podanie ma warunek.",
    risky: "Pressing przejął kierunek akcji i zamknął bezpieczne wyjście.",
    transfer:
      "Rozpoznaj, kto wyszedł do piłki i kto został uwolniony za jego plecami.",
  },
  third_man: {
    strong: "Uruchomiłeś trzeciego zawodnika poza cieniem krycia.",
    mixed:
      "Kombinacja otworzyła linię, lecz tempo kolejnego ruchu jest kluczowe.",
    risky:
      "Odegranie nie zmieniło krycia i trzeci zawodnik pozostał zamknięty.",
    transfer:
      "Szukaj trzeciego gracza, którego obrońca nie może jednocześnie widzieć i kontrolować.",
  },
  overload_isolate: {
    strong: "Przeciągnąłeś blok i stworzyłeś izolację po przeciwnej stronie.",
    mixed: "Otworzyłeś dalszą stronę, ale struktura po stracie jest niepełna.",
    risky: "Zmiana strony przyszła bez przygotowanej izolacji i asekuracji.",
    transfer:
      "Nie zmieniaj strony dla samej zmiany — najpierw przyciągnij ostatniego pomocnika rywala.",
  },
  positional_rotation: {
    strong: "Rotacja zmieniła odpowiedzialność w kryciu bez utraty struktury.",
    mixed:
      "Ruch otworzył nową linię, ale dwóch zawodników zajęło podobną przestrzeń.",
    risky: "Rotacja zabrała wsparcie piłce i odsłoniła środek po stracie.",
    transfer:
      "Każda rotacja ma zwolnić inną strefę, nie tylko zamienić zawodników miejscami.",
  },
  between_lines: {
    strong: "Znalazłeś odbiorcę między liniami z możliwością gry do przodu.",
    mixed:
      "Podanie łamie linię, lecz ustawienie odbiorcy ogranicza kolejną decyzję.",
    risky: "Wszedłeś w zamknięty cień krycia bez wyjścia na trzeci kontakt.",
    transfer:
      "Oceniaj nie tylko możliwość podania, ale też pole widzenia odbiorcy po przyjęciu.",
  },
  weak_side_exit: {
    strong: "Wyszedłeś słabą stroną, zanim blok zdążył odbudować szerokość.",
    mixed:
      "Dalsza strona jest wolna, ale podanie wymaga wcześniejszego zabezpieczenia.",
    risky: "Piłka została przeniesiona w tempo odbudowanego już bloku.",
    transfer:
      "Czytaj ruch ostatniego rywala w środku — to on otwiera albo zamyka zmianę strony.",
  },
  press_trap: {
    strong: "Skierowałeś grę do pułapki i zamknąłeś następne podanie.",
    mixed: "Pierwszy doskok zadziałał, ale asekuracja nie domknęła wyjścia.",
    risky: "Doskok otworzył rywalowi linię, którą pułapka miała odebrać.",
    transfer:
      "Pressuj po to, by wymusić następne podanie — nie tylko po to, by zbliżyć się do piłki.",
  },
  rest_defence: {
    strong:
      "Utrzymałeś przewagę w ataku i kontrolę przestrzeni po ewentualnej stracie.",
    mixed: "Akcja ma progresję, ale jeden z kanałów kontry pozostaje odkryty.",
    risky: "Ruch do przodu zabrał ostatnie zabezpieczenie przed kontrą.",
    transfer:
      "Przed progresją sprawdź, kto kontroluje piłkę, środek i pierwsze podanie po stracie.",
  },
  counterpress: {
    strong: "Pierwszy doskok odebrał czas, a kolejne ruchy zamknęły wyjścia.",
    mixed:
      "Presja spowolniła rywala, ale jedna linia podania pozostała otwarta.",
    risky:
      "Doskok był samotny i powiększył przestrzeń za pierwszym zawodnikiem.",
    transfer:
      "Najbliższy atakuje piłkę, pozostali odbierają rywalowi kierunek i kolejne podanie.",
  },
  transition: {
    strong:
      "Wykorzystałeś pierwszą przewagę i zachowałeś opcję drugiej decyzji.",
    mixed:
      "Pierwszy ruch przyspieszył akcję, ale ograniczył następną możliwość.",
    risky:
      "Tempo akcji było wysokie, lecz przewaga zniknęła przed kolejnym zagraniem.",
    transfer:
      "Po odzyskaniu oceń nie tylko wolną przestrzeń, ale też liczbę opcji po pierwszym podaniu.",
  },
};

function outcomeScore(scenario: SimScenario, outcome: SimActionOutcome) {
  const weights = scenario.context.weights;
  const progressionWeight = weights.progression || 1;
  const advantageWeight = weights.advantage || 1;
  const riskWeight = weights.risk || 1;
  const total = progressionWeight + advantageWeight + riskWeight;
  return (
    (outcome.progression * progressionWeight +
      outcome.advantage * advantageWeight +
      outcome.risk * riskWeight) /
    total
  );
}

/**
 * Porównuje wszystkie realne akcje zapisane w scenariuszu dla reakcji, którą
 * faktycznie wywołał użytkownik. Dzięki temu UI nie udaje jednej poprawnej odpowiedzi.
 */
export function compareSolutions(
  scenario: SimScenario,
  result: SimResult,
): SolutionComparison[] {
  const comparisons = scenario.actions.map((action) => {
    const outcome =
      action.outcomes[result.reaction.id] ?? scenario.fallbackOutcome;
    const score = outcomeScore(scenario, outcome);
    const status =
      score >= 0.72 ? "strong" : score >= 0.5 ? "conditional" : "risky";
    return {
      actionId: action.id,
      label: action.label,
      consequence: outcome.consequence,
      status,
      statusLabel:
        status === "strong"
          ? "Mocny wariant"
          : status === "conditional"
            ? "Warunkowy"
            : "Ryzykowny",
      selected: action.id === result.action?.id,
      recommended: action.id === result.alternative?.action.id,
      score,
    } satisfies SolutionComparison;
  });

  return comparisons
    .sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 4);
}

export function decisionAnalysis(
  scenario: SimScenario,
  result: SimResult,
): DecisionAnalysis {
  const quality = outcomeScore(scenario, result.outcome);
  const verdict =
    quality >= 0.72 ? "strong" : quality >= 0.5 ? "mixed" : "risky";
  const language = TOPIC_HEADLINES[scenario.topic];
  const dimensions = [
    { label: "Progresja z piłką", value: result.outcome.progression },
    { label: "Utworzona przewaga", value: result.outcome.advantage },
    { label: "Ochrona po stracie", value: result.outcome.risk },
  ].sort((a, b) => b.value - a.value);

  return {
    eyebrow: "Co zmienił Twój ruch?",
    headline: language[verdict],
    explanation: firstSentence(result.outcome.consequence),
    strength: dimensions[0].label,
    risk: dimensions[dimensions.length - 1].label,
    transfer: language.transfer,
  };
}

/** Widok replayu dla przełącznika „Twój wybór” / „Lepsza odpowiedź”. */
export function replayView(
  result: SimResult,
  variant: ReplayVariant,
): ReplayView {
  if (variant === "alt" && result.alternative) {
    return {
      variant: "alt",
      label: result.alternative.action.label,
      outcome: result.alternative.outcome,
      path: result.alternative.outcome.path,
      changed: result.alternative.changed,
    };
  }
  return {
    variant: "user",
    label: result.action?.label ?? "Brak akcji",
    outcome: result.outcome,
    path: result.outcome.path,
  };
}

/** Punkt na łamanej przy postępie 0..1 (do animacji piłki w replayu). */
export function pointAlongPath(
  points: { x: number; y: number }[],
  progress: number,
) {
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const p = Math.min(1, Math.max(0, progress));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    lengths.push(d);
    total += d;
  }
  let target = p * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] ? Math.min(1, target / lengths[i]) : 1;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * k,
        y: points[i].y + (points[i + 1].y - points[i].y) * k,
      };
    }
    target -= lengths[i];
  }
  return points[points.length - 1];
}
