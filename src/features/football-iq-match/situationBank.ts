/** Additional match situations for the continuous attack (rules v9).
 * Each one is a hand-placed starting picture of a typical game moment, taken from
 * the four moments of the game used by federation coaching material. The engine
 * then plays everything live; nothing after the start is scripted.
 *
 * Coordinates: x 4–96 across, y 6 (rival goal) → 134 (own goal), half-way at 70.
 */
import type { IQRole, JourneyDefinition } from "./journeyTypes";
import type { Point } from "./types";
import { advancedSituations } from "./advancedSituations";
import { GENERATOR_VERSION, generateVariant } from "./variantGenerator";
import { RETIRED_SITUATION_IDS, VARIANT_SEEDS } from "./situationVariants";

export type GameMoment = "attack" | "build" | "transition" | "defend";
export const gameMomentLabels: Record<GameMoment, string> = {
  build: "Wyjście spod pressingu",
  attack: "Atak",
  transition: "Przejście",
  defend: "Obrona",
};

export type SourceId =
  "pzpn-nmg" | "uefa-ucl-2324" | "fifa-tc" | "fa-dna" | "wein" | "jordet" | "ifab";
/** Public, professional sources the situations are built on. */
export const iqSources: Record<SourceId, { label: string; url: string }> = {
  "pzpn-nmg": {
    label: "PZPN – Narodowy Model Gry (gry zadaniowe, trening formacyjny)",
    url: "https://www.pzpn.pl/public/system/files/articles/6451/2222-NMG%20PZPN,%20GRY%20ZADANIOWE.pdf",
  },
  "uefa-ucl-2324": {
    label: "UEFA – Champions League Technical Report 2023/24",
    url: "https://www.uefa.com/news-media/news/0290-1bb67e814cd7-efcec6f408f4-1000--expert-analysis-in-2023-24-uefa-technical-reports/",
  },
  "fifa-tc": {
    label: "FIFA Training Centre – analiza turniejowa (kontrataki)",
    url: "https://fifatrainingcentre.com/en/game/tournaments/fu17wc/2023/post-tournament-analysis/using-defensive-structures-to-counter-attack-and-score.php",
  },
  "fa-dna": {
    label: "The FA – England DNA: cztery momenty gry",
    url: "https://www.thefa.com/learning/england-dna",
  },
  wein: {
    label: "H. Wein – Developing Game Intelligence in Soccer (2007)",
    url: "https://search.worldcat.org/search?q=Developing+Game+Intelligence+in+Soccer+Wein",
  },
  jordet: {
    label:
      "Jordet, Bloomfield, Heijmerikx – skanowanie pola u zawodników Premier League (MIT Sloan, 2013)",
    url: "https://www.sloansportsconference.com/research-papers/the-hidden-foundation-of-field-vision-in-english-premier-league-epl-soccer-players",
  },
  ifab: {
    label: "IFAB / PZPN – Przepisy Gry, przepis 11 (spalony)",
    url: "https://www.theifab.com/laws/latest/offside/",
  },
};

type Layout = {
  carrier: string;
  positions: Record<string, Point>;
  numbers: Record<string, number>;
};
export type Situation = {
  key: string;
  title: string;
  moment: GameMoment;
  role: IQRole;
  /** One line on screen: the task, no explanation. */
  goal: string;
  sources: SourceId[];
  layout: Layout;
};

const KEEPERS = {
  keeper: { x: 50, y: 7 },
  "home-keeper": { x: 50, y: 131 },
};

export const situations: Situation[] = [
  {
    key: "counter",
    title: "Kontra 3 na 2 po odbiorze",
    moment: "transition",
    role: "wing",
    goal: "Odebraliśmy piłkę, rywale wracają. Zamień to w okazję.",
    sources: ["fifa-tc", "uefa-ucl-2324", "fa-dna"],
    layout: {
      carrier: "support",
      positions: {
        ...KEEPERS,
        you: { x: 80, y: 66 },
        support: { x: 50, y: 72 },
        forward: { x: 44, y: 60 },
        third: { x: 22, y: 76 },
        wide: { x: 86, y: 96 },
        anchor: { x: 50, y: 98 },
        r0: { x: 56, y: 80 },
        r1: { x: 40, y: 46 },
        r2: { x: 62, y: 44 },
        r3: { x: 16, y: 42 },
        r4: { x: 74, y: 86 },
      },
      numbers: {
        you: 11,
        support: 8,
        forward: 9,
        third: 7,
        wide: 2,
        anchor: 6,
        r0: 8,
        r1: 4,
        r2: 5,
        r3: 2,
        r4: 6,
      },
    },
  },
  {
    key: "gk-build",
    title: "Rozegranie od bramkarza pod pressingiem",
    moment: "build",
    role: "cb",
    goal: "Wyprowadź piłkę za pierwszą linię pressingu.",
    sources: ["pzpn-nmg", "uefa-ucl-2324", "wein"],
    layout: {
      carrier: "home-keeper",
      positions: {
        ...KEEPERS,
        "home-keeper": { x: 50, y: 128 },
        you: { x: 30, y: 120 },
        anchor: { x: 70, y: 120 },
        support: { x: 50, y: 106 },
        wide: { x: 90, y: 104 },
        third: { x: 10, y: 104 },
        forward: { x: 40, y: 86 },
        r0: { x: 42, y: 112 },
        r1: { x: 60, y: 110 },
        r2: { x: 20, y: 102 },
        r3: { x: 80, y: 100 },
        r4: { x: 52, y: 96 },
      },
      numbers: {
        you: 4,
        anchor: 5,
        support: 6,
        wide: 2,
        third: 3,
        forward: 8,
        r0: 9,
        r1: 10,
        r2: 7,
        r3: 11,
        r4: 8,
      },
    },
  },
  {
    key: "cross",
    title: "Pole karne przed dośrodkowaniem",
    moment: "attack",
    role: "nine",
    goal: "Partner zaraz dośrodkuje. Stwórz zagrożenie w polu karnym.",
    sources: ["uefa-ucl-2324", "pzpn-nmg"],
    layout: {
      carrier: "wide",
      positions: {
        ...KEEPERS,
        wide: { x: 88, y: 24 },
        you: { x: 52, y: 36 },
        support: { x: 40, y: 42 },
        third: { x: 28, y: 32 },
        forward: { x: 62, y: 48 },
        anchor: { x: 55, y: 64 },
        r0: { x: 82, y: 30 },
        r1: { x: 56, y: 18 },
        r2: { x: 42, y: 17 },
        r3: { x: 28, y: 22 },
        r4: { x: 50, y: 34 },
      },
      numbers: {
        you: 9,
        wide: 7,
        support: 10,
        third: 11,
        forward: 8,
        anchor: 6,
        r0: 3,
        r1: 5,
        r2: 4,
        r3: 2,
        r4: 6,
      },
    },
  },
  {
    key: "counter-press",
    title: "Reakcja zaraz po stracie",
    moment: "transition",
    role: "eight",
    goal: "Odzyskaj piłkę albo zatrzymaj kontrę rywala.",
    sources: ["uefa-ucl-2324", "fa-dna", "pzpn-nmg"],
    layout: {
      carrier: "r0",
      positions: {
        ...KEEPERS,
        r0: { x: 48, y: 58 },
        you: { x: 54, y: 63 },
        support: { x: 40, y: 74 },
        third: { x: 62, y: 50 },
        forward: { x: 50, y: 40 },
        wide: { x: 84, y: 52 },
        anchor: { x: 50, y: 94 },
        r1: { x: 30, y: 66 },
        r2: { x: 68, y: 72 },
        r3: { x: 50, y: 90 },
        r4: { x: 45, y: 40 },
      },
      numbers: {
        you: 8,
        support: 6,
        third: 10,
        forward: 9,
        wide: 7,
        anchor: 4,
        r0: 8,
        r1: 7,
        r2: 11,
        r3: 9,
        r4: 6,
      },
    },
  },
  {
    key: "low-block",
    title: "Atak na rywala w niskiej obronie",
    moment: "attack",
    role: "ten",
    goal: "Rywal broni nisko i ciasno. Pomóż drużynie dojść bliżej bramki.",
    sources: ["uefa-ucl-2324", "pzpn-nmg", "jordet"],
    layout: {
      carrier: "support",
      positions: {
        ...KEEPERS,
        support: { x: 50, y: 54 },
        you: { x: 56, y: 38 },
        wide: { x: 90, y: 36 },
        third: { x: 12, y: 36 },
        forward: { x: 48, y: 24 },
        anchor: { x: 40, y: 72 },
        r0: { x: 45, y: 36 },
        r1: { x: 62, y: 32 },
        r2: { x: 54, y: 21 },
        r3: { x: 36, y: 25 },
        r4: { x: 72, y: 24 },
      },
      numbers: {
        you: 10,
        support: 6,
        wide: 7,
        third: 11,
        forward: 9,
        anchor: 4,
        r0: 6,
        r1: 8,
        r2: 5,
        r3: 4,
        r4: 3,
      },
    },
  },
  {
    key: "wide-1v1",
    title: "Pojedynek 1 na 1 przy linii",
    moment: "attack",
    role: "wing",
    goal: "Masz piłkę przy linii naprzeciw obrońcy. Stwórz przewagę.",
    sources: ["wein", "pzpn-nmg"],
    layout: {
      carrier: "you",
      positions: {
        ...KEEPERS,
        you: { x: 86, y: 42 },
        support: { x: 80, y: 62 },
        forward: { x: 52, y: 24 },
        third: { x: 56, y: 42 },
        anchor: { x: 55, y: 64 },
        wide: { x: 14, y: 34 },
        r0: { x: 82, y: 33 },
        r1: { x: 56, y: 17 },
        r2: { x: 42, y: 19 },
        r3: { x: 26, y: 26 },
        r4: { x: 66, y: 44 },
      },
      numbers: {
        you: 7,
        support: 2,
        forward: 9,
        third: 10,
        anchor: 6,
        wide: 11,
        r0: 3,
        r1: 5,
        r2: 4,
        r3: 2,
        r4: 8,
      },
    },
  },
  {
    key: "defend-centre",
    title: "Obrona środka przed polem karnym",
    moment: "defend",
    role: "cb",
    goal: "Nie pozwól na podanie za linię obrony.",
    sources: ["pzpn-nmg", "uefa-ucl-2324", "ifab"],
    layout: {
      carrier: "r0",
      positions: {
        ...KEEPERS,
        r0: { x: 50, y: 90 },
        r1: { x: 55, y: 110 },
        r2: { x: 20, y: 100 },
        r3: { x: 82, y: 98 },
        r4: { x: 40, y: 80 },
        you: { x: 48, y: 108 },
        anchor: { x: 66, y: 110 },
        support: { x: 52, y: 97 },
        wide: { x: 85, y: 108 },
        third: { x: 15, y: 110 },
        forward: { x: 35, y: 86 },
      },
      numbers: {
        you: 4,
        anchor: 5,
        support: 6,
        wide: 2,
        third: 3,
        forward: 8,
        r0: 10,
        r1: 9,
        r2: 11,
        r3: 7,
        r4: 8,
      },
    },
  },
  {
    key: "hold-up",
    title: "Dziewiątka tyłem do bramki",
    moment: "attack",
    role: "nine",
    goal: "Jesteś tyłem do bramki, obrońca jest blisko. Pomóż drużynie iść do przodu.",
    sources: ["pzpn-nmg", "wein", "jordet"],
    layout: {
      carrier: "you",
      positions: {
        ...KEEPERS,
        you: { x: 50, y: 46 },
        third: { x: 43, y: 58 },
        support: { x: 61, y: 62 },
        wide: { x: 86, y: 40 },
        forward: { x: 14, y: 40 },
        anchor: { x: 50, y: 78 },
        r0: { x: 51, y: 42 },
        r1: { x: 36, y: 36 },
        r2: { x: 64, y: 52 },
        r3: { x: 80, y: 34 },
        r4: { x: 20, y: 34 },
      },
      numbers: {
        you: 9,
        third: 10,
        support: 8,
        wide: 7,
        forward: 11,
        anchor: 6,
        r0: 4,
        r1: 5,
        r2: 6,
        r3: 3,
        r4: 2,
      },
    },
  },
  {
    key: "fullback-overlap",
    title: "Boczny obrońca za skrzydłowym",
    moment: "attack",
    role: "fb",
    goal: "Skrzydłowy ma piłkę przy linii. Pomóż mu stworzyć przewagę.",
    sources: ["pzpn-nmg", "uefa-ucl-2324"],
    layout: {
      carrier: "wide",
      positions: {
        ...KEEPERS,
        wide: { x: 84, y: 46 },
        you: { x: 82, y: 66 },
        forward: { x: 50, y: 26 },
        third: { x: 60, y: 44 },
        support: { x: 55, y: 64 },
        anchor: { x: 45, y: 92 },
        r0: { x: 80, y: 38 },
        r1: { x: 58, y: 20 },
        r2: { x: 42, y: 21 },
        r3: { x: 70, y: 48 },
        r4: { x: 26, y: 30 },
      },
      numbers: {
        you: 2,
        wide: 7,
        forward: 9,
        third: 10,
        support: 8,
        anchor: 4,
        r0: 3,
        r1: 5,
        r2: 4,
        r3: 8,
        r4: 2,
      },
    },
  },
  ...advancedSituations,
];

const contexts = ["Prowadzisz 1:0", "Remis 0:0", "Przegrywasz 0:1"] as const;
export const SITUATION_CONCEPT = "situation" as const;

/** Small, deterministic change per context so the three variants differ on the pitch. */
export function situationLayout(def: JourneyDefinition): Layout | undefined {
  const s = situations.find((x) => `iqs-${x.key}` === def.topicId);
  if (!s) return undefined;
  if (def.variantSeed !== undefined) return generateVariant(s.layout, def.variantSeed).layout;
  const positions = { ...s.layout.positions };
  const shift = def.context;
  if (shift) {
    const ball = positions[s.layout.carrier];
    const r0 = positions.r0;
    positions.r0 = {
      x: r0.x + Math.sign(ball.x - r0.x) * shift * 2,
      y: r0.y + Math.sign(ball.y - r0.y) * shift * 2,
    };
    positions.r1 = { ...positions.r1, x: positions.r1.x - shift * 4 };
  }
  return { ...s.layout, positions };
}

const authored = (s: Situation, i: number, context: 0 | 1 | 2): JourneyDefinition => ({
  id: `iqs-${s.key}-${context}`,
  topicId: `iqs-${s.key}`,
  title: s.title,
  role: s.role,
  pattern: "third-air" as const,
  focus: s.goal,
  context,
  contextLabel: contexts[context],
  ordinal: 1000 + i * 3 + context,
  revision: 3 as const,
  concept: SITUATION_CONCEPT,
  delivery: "chip" as const,
  steps: ["pass", "move", "pass", "move", "carry", "pass"],
});

/** The original three pictures per situation; ids and layouts never change (saved replays). */
export const authoredSituationBank: JourneyDefinition[] = situations.flatMap((s, i) =>
  ([0, 1, 2] as const).map((context) => authored(s, i, context)),
);

/** The definition of one seeded variant of situation number `i` (also used by the search). */
export function variantDefinition(s: Situation, i: number, seed: number): JourneyDefinition {
  const context = (seed % 3) as 0 | 1 | 2;
  return {
    ...authored(s, i, context),
    id: `iqs-${s.key}-g${GENERATOR_VERSION}-${seed}`,
    // From the seed, not the list position, so adding seeds never renumbers older ones.
    ordinal: 2000 + i * 1000 + seed,
    variantSeed: seed,
  };
}

/** Seeded variants that passed the playability check (situationVariants.ts). */
export const generatedSituationBank: JourneyDefinition[] = situations.flatMap((s, i) =>
  (VARIANT_SEEDS[s.key] ?? []).map((seed) => variantDefinition(s, i, seed)),
);

/** Every situation definition, also the retired ones, so old attempts still replay. */
export const situationBank: JourneyDefinition[] = [
  ...authoredSituationBank,
  ...generatedSituationBank,
];

/** What the player is offered: retired pictures (no real decision in them) are left out. */
export const playableSituationBank: JourneyDefinition[] = situationBank.filter(
  (d) => !RETIRED_SITUATION_IDS.has(d.id),
);

export const situationFor = (def: JourneyDefinition) =>
  situations.find((s) => `iqs-${s.key}` === def.topicId);
