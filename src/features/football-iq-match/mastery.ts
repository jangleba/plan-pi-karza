/** The next situation chosen by progress per lesson aim: the weakest aim first, then aims
 * not tried yet, then a repeat. Storage and progress maths live in masteryStore.ts. */
import { lessonAim } from "./decisionAssessment";
import { pickerItems } from "./journeyGuide";
import type { JourneyDefinition } from "./journeyTypes";
import { aimProgress, type AimProgress, type Mastery } from "./masteryStore";

export * from "./masteryStore";

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
