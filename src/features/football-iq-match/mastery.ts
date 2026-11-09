/** Progress per lesson aim, from TY's own graded decisions, and the next situation
 * chosen by it: the weakest aim first, then aims not tried yet, then a repeat. */
import type { DecisionAssessment, LessonAim } from "./decisionAssessment";
import { lessonAim } from "./decisionAssessment";
import { pickerItems } from "./journeyGuide";
import type { JourneyDefinition, JourneyQuality } from "./journeyTypes";

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

export type NextSituation = {
  def: JourneyDefinition;
  progress: AimProgress;
  reason: string;
};

/** The next hand-placed situation for the player's position, chosen by progress. */
export function nextByMastery(
  current: JourneyDefinition,
  position: string | undefined,
  mastery: Mastery,
): NextSituation {
  const own = pickerItems(position, false);
  const pool = (own.length > 1 ? own : pickerItems(position, true)).map((i) => i.def);
  const at = pool.findIndex((d) => d.topicId === current.topicId);
  // Start after the current topic so equal candidates rotate through the list.
  const ordered = [...pool.slice(at + 1), ...pool.slice(0, at + 1)].filter(
    (d) => d.topicId !== current.topicId || pool.length === 1,
  );
  const rank = (p: AimProgress) => (p.level === "learning" ? 0 : p.level === "new" ? 1 : 2);
  const ranked = ordered
    .map((def, order) => ({ def, order, progress: aimProgress(mastery, lessonAim(def)) }))
    .sort(
      (a, b) =>
        rank(a.progress) - rank(b.progress) ||
        a.progress.score - b.progress.score ||
        a.order - b.order,
    );
  const { def, progress } = ranked[0];
  const percent = Math.round(progress.score * 100);
  const reason =
    progress.level === "learning"
      ? `Ćwiczysz dalej: ${progress.label} (${percent}% z ostatnich decyzji).`
      : progress.level === "new"
        ? `Nowy cel: ${progress.label}.`
        : `Wszystkie cele opanowane. Powtórka: ${progress.label}.`;
  return { def, progress, reason };
}

const storageKey = (owner: string | undefined) => `ballwise:iq:mastery:v1:${owner ?? "local"}`;
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
