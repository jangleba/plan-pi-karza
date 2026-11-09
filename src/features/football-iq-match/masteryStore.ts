/** Progress per lesson aim from TY's own graded decisions, and its local storage.
 * Light on purpose (no IQ engine imports): the Start screen reads it too. */
import type { DecisionAssessment, LessonAim } from "./decisionAssessment";
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
