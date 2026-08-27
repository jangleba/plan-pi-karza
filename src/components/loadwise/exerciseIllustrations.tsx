import type { TrainingExercise } from "@/lib/loadwise/types";

/** Punkt w układzie ilustracji (0–100 w obu osiach). */
type Point = [number, number];

/** Pozycja sylwetki w jednej klatce ruchu. */
export interface FigurePose {
  head: Point;
  shoulder: Point;
  hip: Point;
  knee: Point;
  ankle: Point;
  elbow: Point;
  hand: Point;
  /** Wysokość podłoża; brak = zawodnik w powietrzu. */
  ground?: boolean;
}

export interface IllustrationFrame {
  caption: string;
  pose: FigurePose;
}

export interface ExerciseIllustration {
  key: string;
  title: string;
  frames: IllustrationFrame[];
}

/**
 * Rejestr ilustracji ruchu. Jeden styl: cienka niebieska linia na jasnoniebieskim tle.
 * Ruchy proste: 2–3 klatki, złożone: 4–6 klatek. Każdy klucz to inny ruch —
 * nigdy nie używamy jednej generycznej grafiki dla różnych ćwiczeń.
 */
const ILLUSTRATIONS: Record<string, ExerciseIllustration> = {
  cmj: {
    key: "cmj",
    title: "Wyskok pionowy (CMJ)",
    frames: [
      {
        caption: "Postawa startowa",
        pose: {
          head: [50, 22],
          shoulder: [50, 32],
          hip: [50, 52],
          knee: [50, 70],
          ankle: [50, 88],
          elbow: [44, 44],
          hand: [44, 56],
          ground: true,
        },
      },
      {
        caption: "Szybkie zejście w dół",
        pose: {
          head: [50, 34],
          shoulder: [51, 44],
          hip: [56, 60],
          knee: [48, 74],
          ankle: [52, 88],
          elbow: [42, 52],
          hand: [64, 62],
          ground: true,
        },
      },
      {
        caption: "Wybicie i wymach ramion",
        pose: {
          head: [50, 20],
          shoulder: [50, 30],
          hip: [50, 50],
          knee: [50, 68],
          ankle: [50, 86],
          elbow: [48, 20],
          hand: [46, 10],
          ground: true,
        },
      },
      {
        caption: "Lot — ciało wyprostowane",
        pose: {
          head: [50, 10],
          shoulder: [50, 20],
          hip: [50, 40],
          knee: [50, 58],
          ankle: [50, 74],
          elbow: [48, 12],
          hand: [46, 4],
        },
      },
      {
        caption: "Miękkie lądowanie",
        pose: {
          head: [50, 30],
          shoulder: [50, 40],
          hip: [53, 58],
          knee: [49, 73],
          ankle: [51, 88],
          elbow: [43, 48],
          hand: [40, 58],
          ground: true,
        },
      },
    ],
  },
  broad_jump: {
    key: "broad_jump",
    title: "Skok w dal z miejsca",
    frames: [
      {
        caption: "Postawa startowa za linią",
        pose: {
          head: [30, 22],
          shoulder: [30, 32],
          hip: [30, 52],
          knee: [30, 70],
          ankle: [30, 88],
          elbow: [25, 44],
          hand: [25, 56],
          ground: true,
        },
      },
      {
        caption: "Zamach ramion w tył",
        pose: {
          head: [31, 34],
          shoulder: [32, 44],
          hip: [38, 60],
          knee: [31, 74],
          ankle: [34, 88],
          elbow: [26, 50],
          hand: [20, 58],
          ground: true,
        },
      },
      {
        caption: "Wybicie w przód",
        pose: {
          head: [45, 24],
          shoulder: [42, 34],
          hip: [36, 50],
          knee: [40, 66],
          ankle: [32, 84],
          elbow: [52, 28],
          hand: [58, 22],
          ground: true,
        },
      },
      {
        caption: "Lot — kolana w górę",
        pose: {
          head: [60, 20],
          shoulder: [58, 30],
          hip: [54, 46],
          knee: [64, 46],
          ankle: [70, 56],
          elbow: [66, 26],
          hand: [72, 24],
        },
      },
      {
        caption: "Lądowanie na obie stopy",
        pose: {
          head: [72, 34],
          shoulder: [72, 44],
          hip: [70, 60],
          knee: [76, 72],
          ankle: [78, 88],
          elbow: [80, 46],
          hand: [86, 50],
          ground: true,
        },
      },
    ],
  },
  squat: {
    key: "squat",
    title: "Przysiad",
    frames: [
      {
        caption: "Stabilna postawa, klatka wysoko",
        pose: {
          head: [50, 20],
          shoulder: [50, 30],
          hip: [50, 52],
          knee: [50, 70],
          ankle: [50, 88],
          elbow: [44, 32],
          hand: [40, 30],
          ground: true,
        },
      },
      {
        caption: "Zejście — biodra w tył",
        pose: {
          head: [48, 34],
          shoulder: [49, 44],
          hip: [56, 62],
          knee: [46, 74],
          ankle: [50, 88],
          elbow: [43, 46],
          hand: [39, 44],
          ground: true,
        },
      },
      {
        caption: "Wyjście z napięciem tułowia",
        pose: {
          head: [50, 24],
          shoulder: [50, 34],
          hip: [52, 54],
          knee: [49, 71],
          ankle: [50, 88],
          elbow: [44, 36],
          hand: [40, 34],
          ground: true,
        },
      },
    ],
  },
  hinge: {
    key: "hinge",
    title: "Hinge biodrowy",
    frames: [
      {
        caption: "Postawa, sztanga przy udach",
        pose: {
          head: [50, 20],
          shoulder: [50, 30],
          hip: [50, 52],
          knee: [50, 70],
          ankle: [50, 88],
          elbow: [50, 42],
          hand: [50, 54],
          ground: true,
        },
      },
      {
        caption: "Biodra w tył, plecy proste",
        pose: {
          head: [34, 34],
          shoulder: [40, 38],
          hip: [58, 52],
          knee: [54, 70],
          ankle: [52, 88],
          elbow: [40, 52],
          hand: [40, 66],
          ground: true,
        },
      },
      {
        caption: "Domknięcie bioder",
        pose: {
          head: [50, 20],
          shoulder: [50, 30],
          hip: [50, 52],
          knee: [50, 70],
          ankle: [50, 88],
          elbow: [50, 42],
          hand: [50, 54],
          ground: true,
        },
      },
    ],
  },
};

const NAME_MATCHERS: { test: RegExp; key: string }[] = [
  { test: /cmj|wyskok pionowy|skok pionowy/i, key: "cmj" },
  { test: /skok w dal|broad jump/i, key: "broad_jump" },
  { test: /przysiad|squat/i, key: "squat" },
  { test: /martwy ci|rdl|hinge|hip thrust/i, key: "hinge" },
];

/** Deterministyczny klucz ilustracji dla ćwiczenia. */
export function illustrationKeyForExercise(
  exercise: Pick<TrainingExercise, "visualId" | "exerciseId" | "name">,
): string | null {
  const direct = exercise.visualId?.trim();
  if (direct && ILLUSTRATIONS[direct]) return direct;
  const id = exercise.exerciseId?.trim();
  if (id && ILLUSTRATIONS[id]) return id;
  const match = NAME_MATCHERS.find((entry) => entry.test.test(exercise.name));
  return match?.key ?? null;
}

export function getIllustration(key: string | null): ExerciseIllustration | null {
  return key ? (ILLUSTRATIONS[key] ?? null) : null;
}

function line(a: Point, b: Point, extra?: string) {
  return (
    <line
      x1={a[0]}
      y1={a[1]}
      x2={b[0]}
      y2={b[1]}
      className={extra}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

/** Sylwetka rysowana z danych pozycji — bez kodu per ćwiczenie. */
export function PoseFigure({ pose }: { pose: FigurePose }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full text-primary">
      <rect x="0" y="0" width="100" height="100" rx="8" className="fill-primary/5" />
      <line
        x1="8"
        y1="90"
        x2="92"
        y2="90"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        opacity={pose.ground ? 0.5 : 0.25}
      />
      <circle
        cx={pose.head[0]}
        cy={pose.head[1] - 4}
        r={5}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      {line(pose.head, pose.shoulder)}
      {line(pose.shoulder, pose.hip)}
      {line(pose.hip, pose.knee)}
      {line(pose.knee, pose.ankle)}
      {line(pose.shoulder, pose.elbow)}
      {line(pose.elbow, pose.hand)}
    </svg>
  );
}
