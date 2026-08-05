import type { ExerciseItem, SessionDay } from "./types";

/**
 * Jedno źródło prawdy dla rzeczywistego obciążenia szybkościowego.
 *
 * none       — brak bodźca szybkościowego,
 * technique  — technika biegu bez realnego sprintu,
 * microdose  — krótka, kontrolowana ekspozycja,
 * full       — pełny sprint, max velocity, mocny COD albo RSA.
 */
export type SpeedExposure =
  | "none"
  | "technique"
  | "microdose"
  | "full";

export interface SpeedLoadAssessment {
  exposure: SpeedExposure;
  estimatedSprintMeters: number;
  reasons: string[];

  /** Microdose albo full. */
  countsAsSpeedExposure: boolean;

  /** Nie wolno umieścić innej ekspozycji szybkościowej następnego dnia. */
  blocksAdjacentSpeedDay: boolean;

  /** Pełny sprint wymaga pełnego odstępu regeneracyjnego. */
  requiresFullRecoveryGap: boolean;
}

export interface DaySpeedLoadAssessment {
  exposure: SpeedExposure;
  realExposureCount: number;
  fullExposureCount: number;
  hasDuplicateRealSpeedExposures: boolean;
  blocksAdjacentSpeedDay: boolean;
  sessions: SpeedLoadAssessment[];
}

const EXPOSURE_RANK: Record<SpeedExposure, number> = {
  none: 0,
  technique: 1,
  microdose: 2,
  full: 3,
};

/**
 * Akcje, które mogą oznaczać realny sprint.
 * Nie obejmuje skipów i samej techniki biegu.
 */
const SPEED_ACTION_RE =
  /sprint|zryw|przyspiesz|akceler|flying|prędkość maks|max velocity/i;

const NEGATED_SPEED_RE =
  /bez\s+(?:maksymaln\w*\s+)?(?:sprint|zryw|przyspiesz)|nie\s+(?:rób|wykonuj|dodawaj)\s+(?:sprint|zryw|przyspiesz)/i;

const RSA_RE =
  /\brsa\b|powtarzaln\w*\s+sprint|repeated sprint/i;

const MAX_VELOCITY_RE =
  /prędkość maks|max velocity|flying sprint|sprint\w*\s+lotn/i;

const MICRODOSE_RE =
  /mikrodawk|microdose|ekspozycj\w*\s+szybko|speed exposure|speed primer|primer\w*\s+(?:szybko|sprint)|ostrość|submaks/i;

const RUNNING_TECHNIQUE_RE =
  /technika biegu|mechanika sprintu|sprint mechanics|a-skip|b-skip|c-skip|d-skip|skip\s*[abcd]|ankling|dribble|wall drill|marsz a/i;

const COD_RE =
  /\bcod\b|zmian\w*\s+kierunk|hamowan|deceler|agility|zwinno/i;

const MAX_SPEED_PERCENT_RE =
  /(?:9[5-9]|100)\s*%/i;

const MICRODOSE_PERCENT_RE =
  /(?:8[0-9]|90)\s*%/i;

/**
 * Te podkategorie zawsze oznaczają pełną ekspozycję.
 * Prędkość maksymalna nie może zostać zdegradowana do mikrodawki
 * tylko dlatego, że objętość wynosi np. 60–80 m.
 */
const ABSOLUTE_FULL_SUBCATEGORIES = new Set([
  "max_velocity",
  "max_velocity_cod",
  "flying_sprints",
]);

/**
 * Te podkategorie są pełnym bodźcem przy wysokiej intensywności,
 * chyba że sesja jest jawnie opisana jako mikrodawka lub primer.
 */
const HIGH_INTENSITY_FULL_SUBCATEGORIES = new Set([
  "acceleration",
  "acceleration_deceleration",
  "agility_speed",
]);

const MICRODOSE_SUBCATEGORIES = new Set([
  "first_step",
  "speed_microdose",
  "speed_primer",
]);

const TECHNIQUE_SUBCATEGORIES = new Set([
  "sprint_mechanics",
  "technical_speed",
  "deceleration",
  "braking",
  "change_of_direction",
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sessionExercises(session: SessionDay): ExerciseItem[] {
  if (session.exercises?.length) {
    return session.exercises;
  }

  return [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
    ...session.sections.cooldown,
  ];
}

function exerciseText(exercise: ExerciseItem): string {
  return normalizeText(
    [
      exercise.name,
      exercise.prescription,
      exercise.cue ?? "",
    ].join(" "),
  );
}

/**
 * Nie analizujemy reason, riskManaged ani avoidToday.
 * Mogą zawierać zdania typu „bez sprintów”, które dawałyby
 * fałszywy wynik.
 */
function sessionHeaderText(session: SessionDay): string {
  return normalizeText(
    [
      session.title,
      session.sessionType,
      session.goalOfSession,
    ].join(" "),
  );
}

function positiveSpeedTexts(session: SessionDay): string[] {
  return sessionExercises(session)
    .map(exerciseText)
    .filter(
      (text) =>
        SPEED_ACTION_RE.test(text) &&
        !NEGATED_SPEED_RE.test(text),
    );
}

function allRelevantTexts(session: SessionDay): string[] {
  return [
    sessionHeaderText(session),
    ...sessionExercises(session).map(exerciseText),
  ];
}

/**
 * Procent jest uznawany za procent prędkości tylko wtedy,
 * gdy w tym samym fragmencie znajduje się sprint, przyspieszenie
 * albo prędkość. Dzięki temu „95% ciężaru” na siłowni
 * nie zostanie uznane za pełny sprint.
 */
function hasSpeedPercentage(
  texts: string[],
  percentagePattern: RegExp,
): boolean {
  return texts.some(
    (text) =>
      SPEED_ACTION_RE.test(text) &&
      !NEGATED_SPEED_RE.test(text) &&
      percentagePattern.test(text),
  );
}

/**
 * Odczytuje np.:
 * - „łącznie 120 m”,
 * - „6 × 20 m”,
 * - „6–8 × 20–25 m”,
 * - „2 × (5 × 20 m)”.
 *
 * Dla zakresów przyjmuje większą wartość, aby reguła
 * bezpieczeństwa nie zaniżała obciążenia.
 */
function metersFromPrescription(
  prescription: string,
): number {
  const text = normalizeText(prescription);

  const explicitTotals = [
    ...text.matchAll(
      /(?:łącznie|razem|total|limit(?: objętości)?|maksymalnie|≤)\s*(\d+)\s*m\b/giu,
    ),
  ];

  if (explicitTotals.length > 0) {
    return Math.max(
      ...explicitTotals.map((match) => Number(match[1])),
    );
  }

  const nestedSets = [
    ...text.matchAll(
      /(\d+)(?:\s*[-–]\s*(\d+))?\s*[x×]\s*\(\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*m\s*\)/giu,
    ),
  ];

  if (nestedSets.length > 0) {
    return nestedSets.reduce((total, match) => {
      const outerSets = Number(match[2] ?? match[1]);
      const repetitions = Number(match[4] ?? match[3]);
      const distance = Number(match[6] ?? match[5]);

      return total + outerSets * repetitions * distance;
    }, 0);
  }

  const repetitions = [
    ...text.matchAll(
      /(\d+)(?:\s*[-–]\s*(\d+))?\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*m\b/giu,
    ),
  ];

  return repetitions.reduce((total, match) => {
    const reps = Number(match[2] ?? match[1]);
    const distance = Number(match[4] ?? match[3]);

    return total + reps * distance;
  }, 0);
}

export function estimateSprintMeters(
  session: SessionDay,
): number {
  return sessionExercises(session).reduce(
    (total, exercise) => {
      const text = exerciseText(exercise);

      if (
        !SPEED_ACTION_RE.test(text) ||
        NEGATED_SPEED_RE.test(text)
      ) {
        return total;
      }

      return (
        total +
        metersFromPrescription(exercise.prescription)
      );
    },
    0,
  );
}

function createAssessment(
  exposure: SpeedExposure,
  estimatedSprintMeters: number,
  reasons: string[],
): SpeedLoadAssessment {
  const countsAsSpeedExposure =
    exposure === "microdose" || exposure === "full";

  return {
    exposure,
    estimatedSprintMeters,
    reasons,
    countsAsSpeedExposure,

    /**
     * Zgodnie z twardą zasadą BallWise również mikrodawka
     * blokuje kolejną ekspozycję następnego dnia.
     */
    blocksAdjacentSpeedDay: countsAsSpeedExposure,

    requiresFullRecoveryGap: exposure === "full",
  };
}

export function assessSpeedLoad(
  session: SessionDay | null | undefined,
): SpeedLoadAssessment {
  if (
    !session ||
    session.isUnavailable ||
    session.dayType === "rest"
  ) {
    return createAssessment("none", 0, [
      "no-speed-load",
    ]);
  }

  const texts = allRelevantTexts(session);
  const header = sessionHeaderText(session);
  const positiveSprintTexts = positiveSpeedTexts(session);

  const estimatedSprintMeters =
    estimateSprintMeters(session);

  const classification = session.classification;
  const subcategory = classification?.subcategory;
  const categoryIsSpeed =
    classification?.category === "speed_sprint";

  const highIntensity =
    session.intensity === "wysoka";

  const containsSprintAction =
    positiveSprintTexts.length > 0;

  const containsRsa = texts.some((text) =>
    RSA_RE.test(text),
  );

  const containsMaxVelocity = texts.some((text) =>
    MAX_VELOCITY_RE.test(text),
  );

  const containsCod = texts.some((text) =>
    COD_RE.test(text),
  );

  const containsRunningTechnique = texts.some(
    (text) => RUNNING_TECHNIQUE_RE.test(text),
  );

  const explicitMicrodose =
    texts.some((text) => MICRODOSE_RE.test(text)) ||
    hasSpeedPercentage(
      texts,
      MICRODOSE_PERCENT_RE,
    );

  const explicitMaximumSpeed =
    containsMaxVelocity ||
    hasSpeedPercentage(texts, MAX_SPEED_PERCENT_RE);

  /**
   * 1. Trening klubowy jawnie opisany jako speed focus.
   * Traktujemy konserwatywnie jako pełną ekspozycję.
   */
  if (subcategory === "club_speed_focus") {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["club-speed-focus"],
    );
  }

  /**
   * 2. RSA zawsze liczy się jako pełna ekspozycja sprintowa,
   * nawet gdy główna kategoria to endurance_conditioning.
   */
  if (containsRsa) {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["repeated-sprint-ability"],
    );
  }

  /**
   * 3. Max velocity oraz flying sprint są pełnym sprintem
   * niezależnie od małej liczby metrów.
   */
  if (
    explicitMaximumSpeed ||
    (subcategory &&
      ABSOLUTE_FULL_SUBCATEGORIES.has(subcategory))
  ) {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["maximum-velocity-exposure"],
    );
  }

  /**
   * 4. Pełna sesja akceleracji o wysokiej intensywności.
   * 4 × 20 m może być pełnym treningiem, mimo tylko 80 m.
   */
  if (
    subcategory &&
    HIGH_INTENSITY_FULL_SUBCATEGORIES.has(
      subcategory,
    ) &&
    highIntensity &&
    !explicitMicrodose
  ) {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["high-intensity-speed-subcategory"],
    );
  }

  /**
   * 5. Sesja speed_sprint o wysokiej intensywności
   * i z rzeczywistą treścią sprintową.
   */
  if (
    categoryIsSpeed &&
    highIntensity &&
    containsSprintAction &&
    !explicitMicrodose
  ) {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["high-intensity-speed-session"],
    );
  }

  /**
   * 6. Wysokointensywny COD z przyspieszeniem lub sprintem
   * również daje pełne obciążenie szybkościowe.
   */
  if (
    containsCod &&
    highIntensity &&
    containsSprintAction &&
    !explicitMicrodose
  ) {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["high-intensity-cod-with-sprint"],
    );
  }

  /**
   * 7. Nieklasyfikowana sesja, ale zawiera sprint
   * o wysokiej intensywności.
   */
  if (
    highIntensity &&
    containsSprintAction &&
    !explicitMicrodose
  ) {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["high-intensity-sprint-content"],
    );
  }

  /**
   * 8. Duża objętość sprintu jest pełną ekspozycją,
   * niezależnie od brakującej klasyfikacji.
   */
  if (estimatedSprintMeters > 100) {
    return createAssessment(
      "full",
      estimatedSprintMeters,
      ["sprint-volume-over-100m"],
    );
  }

  /**
   * 9. Jawna mikrodawka, primer, MD-2 albo praca
   * submaksymalna.
   */
  if (
    explicitMicrodose &&
    (containsSprintAction ||
      estimatedSprintMeters > 0 ||
      categoryIsSpeed)
  ) {
    return createAssessment(
      "microdose",
      estimatedSprintMeters,
      ["explicit-speed-microdose"],
    );
  }

  if (
    subcategory &&
    MICRODOSE_SUBCATEGORIES.has(subcategory)
  ) {
    return createAssessment(
      "microdose",
      estimatedSprintMeters,
      ["speed-microdose-subcategory"],
    );
  }

  /**
   * 10. Rzeczywisty sprint do 100 m przy intensywności
   * niższej niż wysoka jest mikrodawką.
   */
  if (
    estimatedSprintMeters > 0 &&
    estimatedSprintMeters <= 100
  ) {
    return createAssessment(
      "microdose",
      estimatedSprintMeters,
      ["controlled-sprint-volume-up-to-100m"],
    );
  }

  /**
   * 11. COD zawierający przyspieszenia, ale bez wysokiej
   * intensywności, liczy się jako mikrodawka.
   */
  if (containsCod && containsSprintAction) {
    return createAssessment(
      "microdose",
      estimatedSprintMeters,
      ["cod-with-controlled-acceleration"],
    );
  }

  /**
   * 12. Same skipy, ankling, dribbles lub wall drills
   * nie są realną ekspozycją sprintową.
   */
  if (
    containsRunningTechnique ||
    (subcategory &&
      TECHNIQUE_SUBCATEGORIES.has(subcategory))
  ) {
    return createAssessment(
      "technique",
      estimatedSprintMeters,
      ["running-technique-without-real-sprint"],
    );
  }

  /**
   * 13. Awaryjne zachowanie konserwatywne:
   * istniejąca kategoria speed_sprint, ale treść jest
   * niepełna lub nieczytelna.
   */
  if (categoryIsSpeed) {
    if (highIntensity) {
      return createAssessment(
        "full",
        estimatedSprintMeters,
        ["classified-high-speed-session"],
      );
    }

    if (session.intensity === "umiarkowana") {
      return createAssessment(
        "microdose",
        estimatedSprintMeters,
        ["classified-moderate-speed-session"],
      );
    }

    return createAssessment(
      "technique",
      estimatedSprintMeters,
      ["classified-low-speed-session"],
    );
  }

  /**
   * 14. Treść zawiera sprint, ale sesja nie ma jeszcze
   * centralnej klasyfikacji.
   */
  if (containsSprintAction) {
    return createAssessment(
      highIntensity ? "full" : "microdose",
      estimatedSprintMeters,
      ["unclassified-speed-content"],
    );
  }

  return createAssessment(
    "none",
    estimatedSprintMeters,
    ["no-speed-content"],
  );
}

export function assessDaySpeedLoad(
  day: SessionDay,
): DaySpeedLoadAssessment {
  const sessions = [
    assessSpeedLoad(day),
    ...(day.secondSession
      ? [assessSpeedLoad(day.secondSession)]
      : []),
  ];

  const exposure = sessions.reduce<SpeedExposure>(
    (highest, current) =>
      EXPOSURE_RANK[current.exposure] >
      EXPOSURE_RANK[highest]
        ? current.exposure
        : highest,
    "none",
  );

  const realExposureCount = sessions.filter(
    (item) => item.countsAsSpeedExposure,
  ).length;

  const fullExposureCount = sessions.filter(
    (item) => item.exposure === "full",
  ).length;

  return {
    exposure,
    realExposureCount,
    fullExposureCount,
    hasDuplicateRealSpeedExposures:
      realExposureCount > 1,
    blocksAdjacentSpeedDay: sessions.some(
      (item) => item.blocksAdjacentSpeedDay,
    ),
    sessions,
  };
}

export function hasFullSpeedLoad(
  session: SessionDay | null | undefined,
): boolean {
  return assessSpeedLoad(session).exposure === "full";
}

export function hasRealSpeedExposure(
  session: SessionDay | null | undefined,
): boolean {
  return assessSpeedLoad(session)
    .countsAsSpeedExposure;
}

export function dayHasRealSpeedExposure(
  day: SessionDay,
): boolean {
  return assessDaySpeedLoad(day).realExposureCount > 0;
}

export function dayHasFullSpeedLoad(
  day: SessionDay,
): boolean {
  return assessDaySpeedLoad(day).fullExposureCount > 0;
}
