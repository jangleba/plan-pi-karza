/** The next situation: after a recurring problem the same principle in another situation
 * (transfer); otherwise by progress per lesson aim (weakest first, then new aims, then a
 * harder picture of a mastered aim). Storage and progress maths live in masteryStore.ts. */
import {
  lessonAim,
  type ContributionProblem,
  type DecisionAssessment,
  type LessonAim,
} from "./decisionAssessment";
import { pickerItems } from "./journeyGuide";
import type { JourneyDefinition } from "./journeyTypes";
import {
  addProblems,
  aimProgress,
  problemLabels,
  recurringProblem,
  type AimProgress,
  type Mastery,
  type ProblemEntry,
} from "./masteryStore";
import { GOOD_SHARE } from "./pictureDifficulty";
import { playableSituationBank } from "./situationBank";

export * from "./masteryStore";

export type NextSituation = {
  def: JourneyDefinition;
  progress: AimProgress;
  reason: string;
  /** "transfer": the same principle in another situation after a recurring problem. */
  kind: "aim" | "transfer";
};

/** Lesson aims whose situations train the answer to each problem. */
export const PROBLEM_AIMS: Record<ContributionProblem, LessonAim[]> = {
  "lane-closed": ["progress", "switch"],
  "lane-read": ["progress", "switch"],
  "offside-pass": ["counter", "progress"],
  "no-progress": ["progress", "counter"],
  "stayed-crowded": ["switch"],
  "carried-into-pressure": ["progress"],
  "long-shot": ["counter", "box"],
  "shot-angle": ["counter", "box"],
  "pass-not-reached": ["counter", "progress"],
  "offside-run": ["run-behind"],
  "receiver-lane-closed": ["space"],
  marked: ["space"],
  "no-run": ["run-behind"],
  "outside-box": ["box"],
  "far-from-ball": ["press"],
  bypassed: ["delay", "cover"],
  "lane-open": ["close-lane"],
  "rival-behind": ["cover"],
  "too-deep": ["sweep"],
  "lost-race": ["press"],
  "held-too-long": ["progress"],
};

/** Adds the problems of a finished lesson; a problem the lesson trained and that did not
 * come back counts as worked on, so its older entries are dropped. */
export function updateProblems(
  log: ProblemEntry[],
  list: DecisionAssessment[],
  def: JourneyDefinition,
): ProblemEntry[] {
  const aim = lessonAim(def);
  const now = new Set(list.map((a) => a.problem).filter(Boolean));
  const kept = log.filter((e) => now.has(e.problem) || !PROBLEM_AIMS[e.problem].includes(aim));
  return addProblems(kept, list, def.topicId);
}

/** Offered pictures of a topic from easiest (most good answers) to hardest. */
export function picturesByDifficulty(topicId: string): JourneyDefinition[] {
  return playableSituationBank
    .filter((d) => d.topicId === topicId)
    .sort((a, b) => (GOOD_SHARE[b.id] ?? 0) - (GOOD_SHARE[a.id] ?? 0) || a.ordinal - b.ordinal);
}
/** Difficulty follows progress: a new aim starts on the easiest picture, an aim being learnt
 * on a middle one, a mastered aim on the hardest (fewest good answers, tighter press). */
export function pictureFor(def: JourneyDefinition, progress: AimProgress): JourneyDefinition {
  const list = picturesByDifficulty(def.topicId);
  if (!list.length) return def;
  const at =
    progress.level === "new"
      ? 0
      : progress.level === "mastered"
        ? list.length - 1
        : Math.floor((list.length - 1) / 2);
  return list[at];
}

/** The next hand-placed situation for the player's position: after a recurring problem the
 * same principle in another situation (transfer), otherwise by progress per aim. */
export function nextByMastery(
  current: JourneyDefinition,
  position: string | undefined,
  mastery: Mastery,
  problems: ProblemEntry[] = [],
): NextSituation {
  const own = pickerItems(position, false);
  const pool = (own.length > 1 ? own : pickerItems(position, true)).map((i) => i.def);
  const recurring = recurringProblem(problems);
  if (recurring) {
    const aims = PROBLEM_AIMS[recurring.problem];
    const away = (d: JourneyDefinition) =>
      aims.includes(lessonAim(d)) &&
      d.topicId !== recurring.topicId &&
      d.topicId !== current.topicId;
    const candidates = pool.filter(away).length
      ? pool.filter(away)
      : pickerItems(position, true)
          .map((i) => i.def)
          .filter(away);
    const pick = candidates
      .map((def) => ({ def, progress: aimProgress(mastery, lessonAim(def)) }))
      .sort((a, b) => a.progress.score - b.progress.score || a.def.ordinal - b.def.ordinal)[0];
    if (pick)
      return {
        def: pictureFor(pick.def, pick.progress),
        progress: pick.progress,
        reason: `Powtarza się: ${problemLabels[recurring.problem]}. Ta sama zasada w innej sytuacji.`,
        kind: "transfer",
      };
  }
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
        : `Wszystkie cele opanowane. Trudniejszy układ: ${progress.label}.`;
  return { def: pictureFor(def, progress), progress, reason, kind: "aim" };
}
