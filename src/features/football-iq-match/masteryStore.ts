/** Progress per lesson aim from TY's own graded decisions, and its local storage.
 * Light on purpose (no IQ engine imports): the Start screen reads it too. */
import type { ContributionProblem, DecisionAssessment, LessonAim } from "./decisionAssessment";
import type { JourneyQuality } from "./journeyTypes";
export const aimLabels: Record<LessonAim, string> = {
  progress: "Gra do przodu",
  switch: "Zmiana strony",
  counter: "Kontra",
  finish: "Wykończenie",
  space: "Wolne miejsce bez piłki",
  "run-behind": "Wbieganie za obrońców",
  box: "Wejście w pole karne",
  "close-lane": "Zamykanie linii podania",
  press: "Pressing",
  cover: "Asekuracja",
  delay: "Opóźnianie ataku",
  sweep: "Bramkarz za obroną",
  recover: "Walka o wolną piłkę",
};

/** Only the latest decisions count, so progress shows what the player does now. */
export const MASTERY_WINDOW = 8;
const MASTERED_MIN = 4;
const MASTERED_SCORE = 0.75;
const POINTS: Record<JourneyQuality, number> = { good: 1, possible: 0.5, error: 0 };

export type Mastery = Partial<Record<LessonAim, JourneyQuality[]>>;
export type AimProgress = {
  aim: LessonAim;
  label: string;
  decisions: number;
  /** 0–1: good = 1, can be better = 0.5, error = 0. */
  score: number;
  level: "new" | "learning" | "mastered";
};

export function aimProgress(mastery: Mastery, aim: LessonAim): AimProgress {
  const list = mastery[aim] ?? [];
  const score = list.length ? list.reduce((n, g) => n + POINTS[g], 0) / list.length : 0;
  return {
    aim,
    label: aimLabels[aim],
    decisions: list.length,
    score,
    level: !list.length
      ? "new"
      : list.length >= MASTERED_MIN && score >= MASTERED_SCORE
        ? "mastered"
        : "learning",
  };
}

export function addAssessments(mastery: Mastery, list: DecisionAssessment[]): Mastery {
  const next: Mastery = { ...mastery };
  for (const a of list) next[a.aim] = [...(next[a.aim] ?? []), a.grade].slice(-MASTERY_WINDOW);
  return next;
}

export const masteryKey = (owner: string | undefined) =>
  `ballwise:iq:mastery:v1:${owner ?? "local"}`;
const storageKey = masteryKey;
const GRADES: JourneyQuality[] = ["good", "possible", "error"];

export function loadMastery(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): Mastery {
  try {
    const raw = storage.getItem(storageKey(owner));
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Mastery = {};
    for (const aim of Object.keys(aimLabels) as LessonAim[]) {
      const list = (value as Record<string, unknown>)[aim];
      if (Array.isArray(list) && list.every((g) => GRADES.includes(g as JourneyQuality)))
        out[aim] = (list as JourneyQuality[]).slice(-MASTERY_WINDOW);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMastery(
  owner: string | undefined,
  mastery: Mastery,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  try {
    storage.setItem(storageKey(owner), JSON.stringify(mastery));
  } catch {
    /* Storage full or blocked: the next situation still follows this session's progress. */
  }
}

/** The aim to practise next: the weakest one already being learnt, or null. */
export function focusAim(mastery: Mastery): AimProgress | null {
  return (
    (Object.keys(mastery) as LessonAim[])
      .map((aim) => aimProgress(mastery, aim))
      .filter((p) => p.level === "learning")
      .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))[0] ?? null
  );
}

/** Recent problems in TY's own decisions (newest last), for choosing by error type. */
export type ProblemEntry = { problem: ContributionProblem; topicId: string };
export const PROBLEM_WINDOW = 12;
/** A problem counts as recurring when it shows up this many times in the window. */
export const RECURRING = 2;

export const problemLabels: Record<ContributionProblem, string> = {
  "lane-closed": "podanie w zamknięty tor",
  "lane-read": "podanie, które rywal przewidział",
  "offside-pass": "podanie na spalonego",
  "no-progress": "brak gry do przodu przy wolnym polu",
  "stayed-crowded": "gra w tłoku zamiast zmiany strony",
  "carried-into-pressure": "prowadzenie piłki w rywala",
  "long-shot": "strzał z daleka zamiast podania",
  "shot-angle": "strzał z ostrego kąta",
  "pass-not-reached": "podanie, do którego nikt nie dobiega",
  "offside-run": "wybieganie na spalonego",
  "receiver-lane-closed": "rywal na torze podania do Ciebie",
  marked: "zostawanie przy kryjącym rywalu",
  "no-run": "brak wbiegnięcia za obrońców",
  "outside-box": "zostawanie przed polem karnym",
  "far-from-ball": "za daleko od piłki w obronie",
  bypassed: "doskok bez stania między piłką a bramką",
  "lane-open": "otwarta linia podania rywala",
  "rival-behind": "rywal za Twoimi plecami",
  "too-deep": "bramkarz za głęboko",
  "lost-race": "spóźniony start do wolnej piłki",
  "held-too-long": "za długie trzymanie piłki pod pressingiem",
};

export function addProblems(
  log: ProblemEntry[],
  list: DecisionAssessment[],
  topicId: string,
): ProblemEntry[] {
  const fresh = list
    .filter((a) => a.problem)
    .map((a) => ({ problem: a.problem!, topicId }) as ProblemEntry);
  return [...log, ...fresh].slice(-PROBLEM_WINDOW);
}

/** The most frequent recurring problem (latest wins a tie), or null. */
export function recurringProblem(log: ProblemEntry[]): ProblemEntry | null {
  const counts = new Map<ContributionProblem, number>();
  for (const e of log) counts.set(e.problem, (counts.get(e.problem) ?? 0) + 1);
  let best: ProblemEntry | null = null,
    bestCount = 0;
  for (const e of log) {
    const n = counts.get(e.problem)!;
    if (n >= RECURRING && n >= bestCount) [best, bestCount] = [e, n];
  }
  return best;
}

export const problemsKey = (owner: string | undefined) =>
  `ballwise:iq:problems:v1:${owner ?? "local"}`;

export function loadProblems(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): ProblemEntry[] {
  try {
    const raw = storage.getItem(problemsKey(owner));
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (e): e is ProblemEntry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as ProblemEntry).topicId === "string" &&
          (e as ProblemEntry).problem in problemLabels,
      )
      .slice(-PROBLEM_WINDOW);
  } catch {
    return [];
  }
}

export function saveProblems(
  owner: string | undefined,
  log: ProblemEntry[],
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  try {
    storage.setItem(problemsKey(owner), JSON.stringify(log));
  } catch {
    /* Storage full or blocked: selection falls back to progress per aim. */
  }
}
