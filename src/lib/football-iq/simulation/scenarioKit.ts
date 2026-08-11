// Fabryka scenariuszy mikrosymulacji.
// Scenariusze są danymi — kit uzupełnia wyłącznie powtarzalne, techniczne domyślne
// wartości (okna czasowe, kąty ciała, noga, etykiety reakcji), żeby jeden silnik
// obsługiwał całą bibliotekę bez osobnych ekranów.

import type {
  SimAction,
  SimActor,
  SimAlternative,
  SimCriterion,
  SimReaction,
  SimScenario,
  SimScenarioContext,
  SimSourceReference,
  SimTopic,
  SimZone,
} from "./types";

export const DEFAULT_REACTION_IDS = ["stays", "closes_center", "jumps"] as const;
export type DefaultReactionId = (typeof DEFAULT_REACTION_IDS)[number];

const REACTION_META: Record<DefaultReactionId, { label: string; description: string }> = {
  stays: {
    label: "Rywal trzyma strefę",
    description: "Przeciwnik nie wychodzi z pozycji — pilnuje przestrzeni i linii podania.",
  },
  closes_center: {
    label: "Rywal domyka środek",
    description: "Przeciwnik cofa się i zamyka centralną linię podania.",
  },
  jumps: {
    label: "Rywal doskakuje",
    description: "Przeciwnik wypada z linii i atakuje moment przyjęcia.",
  },
};

const DEFAULT_WEIGHTS: Record<SimCriterion, number> = {
  timing: 1.1,
  body: 1,
  progression: 1.2,
  advantage: 1,
  risk: 1.2,
};

const DEFAULT_BODY_ANGLES = [
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
    note: "Ustawienie w przód daje progresję, ale tracisz kontrolę nad plecami.",
  },
  {
    id: "to-ball",
    centerDeg: 180,
    toleranceDeg: 45,
    label: "Twarzą do piłki",
    quality: 0.4,
    note: "Twarzą do piłki jest bezpiecznie, ale każde przyjęcie kończy się grą wstecz.",
  },
];

const DEFAULT_FEET = [
  {
    foot: "right" as const,
    quality: 0.9,
    note: "Przyjęcie dalszą nogą chroni piłkę przed rywalem.",
  },
  {
    foot: "left" as const,
    quality: 0.5,
    note: "Przyjęcie bliższą nogą wystawia piłkę na wystawioną nogę rywala.",
  },
];

export interface ScenarioInput {
  id: string;
  title: string;
  brief: string;
  topic: SimTopic;
  positions: SimScenario["positions"];
  status: SimScenario["status"];
  sourceReference?: SimSourceReference;
  context: Omit<SimScenarioContext, "weights"> & {
    weights?: Partial<Record<SimCriterion, number>>;
  };
  observationMs?: number;
  decisionMs?: number;
  actors: SimActor[];
  zones: SimZone[];
  /** Skrót: id reakcji -> docelowe pozycje rywali. */
  reactions: Partial<Record<DefaultReactionId, SimReaction["moves"]>>;
  actions: SimAction[];
  alternatives: Partial<Record<DefaultReactionId, SimAlternative>>;
  defaultReaction?: DefaultReactionId;
  timingMissNote?: string;
  zoneMissNote?: string;
  bodyMissNote?: string;
  fallbackConsequence?: string;
}

export function defineScenario(input: ScenarioInput): SimScenario {
  const observationMs = input.observationMs ?? 7000;
  const decisionMs = input.decisionMs ?? 2000;

  const timingWindows = [
    {
      id: "early",
      fromMs: 0,
      toMs: Math.round(observationMs * 0.4),
      label: "Za wcześnie",
      quality: 0.45,
      note: "Ruszyłeś, zanim obraz gry się otworzył — rywal zdążył skorygować pozycję.",
    },
    {
      id: "prime",
      fromMs: Math.round(observationMs * 0.4) + 1,
      toMs: Math.round(observationMs * 0.75),
      label: "Właściwy moment",
      quality: 0.95,
      note: "Ruszyłeś w chwili, gdy rywal obracał biodra do piłki — straciłeś się z jego pola widzenia.",
    },
    {
      id: "late",
      fromMs: Math.round(observationMs * 0.75) + 1,
      toMs: observationMs,
      label: "Późno",
      quality: 0.6,
      note: "Ruch był czytelny — rywal zdążył ustawić się między Tobą a piłką.",
    },
  ];

  const reactions: SimReaction[] = DEFAULT_REACTION_IDS.filter(
    (id) => input.reactions[id],
  ).map((id) => ({
    id,
    label: REACTION_META[id].label,
    description: REACTION_META[id].description,
    moves: input.reactions[id]!,
  }));

  return {
    id: input.id,
    title: input.title,
    brief: input.brief,
    topic: input.topic,
    positions: input.positions,
    status: input.status,
    sourceReference: input.sourceReference,
    context: {
      ...input.context,
      weights: { ...DEFAULT_WEIGHTS, ...(input.context.weights ?? {}) },
    },
    observationMs,
    decisionMs,
    actors: input.actors,
    timingWindows,
    timingMissNote:
      input.timingMissNote ??
      "Nie ruszyłeś w oknie podania — akcja przeszła obok Ciebie.",
    zones: input.zones,
    zoneMissNote:
      input.zoneMissNote ??
      "Zostałeś w miejscu, które nie zmieniało obrazu gry — nie było linii podania.",
    defaultReaction: input.defaultReaction ?? reactions[0]?.id ?? "stays",
    bodyAngles: DEFAULT_BODY_ANGLES,
    bodyMissNote: input.bodyMissNote ?? "Ustawienie bokiem do gry utrudnia przyjęcie i obrót.",
    feet: DEFAULT_FEET,
    reactions,
    actions: input.actions,
    alternatives: input.alternatives as Record<string, SimAlternative>,
    fallbackOutcome: {
      progression: 0.1,
      advantage: 0.1,
      risk: 0.45,
      consequence:
        input.fallbackConsequence ??
        "Brak decyzji w oknie czasowym — rywal dopadł Cię razem z piłką.",
    },
  };
}

export const TOPIC_LABELS: Record<SimTopic, string> = {
  press_manipulation: "Manipulowanie pressingiem",
  third_man: "Trzeci zawodnik",
  overload_isolate: "Przeciążenie i izolacja",
  positional_rotation: "Rotacje pozycyjne",
  between_lines: "Gra między liniami",
  weak_side_exit: "Wyjście słabą stroną",
  press_trap: "Pressing trap",
  rest_defence: "Zabezpieczenie ataku",
  counterpress: "Kontrpressing",
  transition: "Decyzje w przejściach",
};
