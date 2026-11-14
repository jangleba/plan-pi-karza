import type { TrainingBlock, TrainingExercise, TrainingSection } from "../types";
import { getExerciseDefinition, resolveExerciseByName } from "../exerciseLibrary";
import { compactPrescription, formatRestValue } from "../sessionPresentation";
import { plannedSets } from "../setLogs";
import { parseRestDuration } from "../restTimer";
import { skipRound } from "../skipRounds";
import { linkedNextStep } from "../blockMethod";
import { FUNCTIONAL_CATALOGUE } from "../engineV2/taxonomy";

/** What the athlete records or does on the current card. */
export type TaskKind =
  | "load" // gym sets: kg × reps
  | "bodyweight" // sets × reps without external load
  | "hold" // timed sets or isometric holds
  | "power" // jumps, throws, landings: quality, not reps in reserve
  | "sprint" // runs and drills over a distance, rep by rep
  | "run" // continuous running inside a session (warm-up jog)
  | "mobility" // mobility, prehab and recovery movements
  | "ball" // ball tasks
  | "general"; // a single task without set structure

export type SessionKind = "strength" | "sprint" | "general";

const definitionOf = (exercise: TrainingExercise) =>
  (exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined) ??
  resolveExerciseByName(exercise.name);

const doseText = (e: TrainingExercise) =>
  `${e.displayPrescription ?? ""} ${e.sets ?? ""} ${e.reps ?? ""} ${e.duration ?? ""}`;

const isTimedText = (text: string) => /\d\s*(?:s|sek\w*|min\w*)\b/i.test(text);

/** Power, plyometric and landing work is judged by quality, never by reps in reserve. */
export function isPowerTask(exercise: TrainingExercise): boolean {
  const definition = definitionOf(exercise);
  if (definition && ["power", "plyometric"].includes(definition.category)) return true;
  if (definition && ["ballistic", "impact"].includes(definition.loadingType)) return true;
  if (definition?.family === "power" || definition?.family === "plyometric") return true;
  if (typeof exercise.groundContacts === "number" && exercise.groundContacts > 0) return true;
  return /\b(?:skok|wyskok|odbici|lądowani|rzut|snap.?down|pogo|wieloskok|jump|hop|bound|throw)/i.test(
    exercise.name,
  );
}

export function taskKind(
  exercise: TrainingExercise,
  section: Pick<TrainingSection, "type">,
  sessionKind: SessionKind = "general",
): TaskKind {
  const definition = definitionOf(exercise);
  const text = doseText(exercise);
  const sets = plannedSets(exercise);
  const seconds = exercise.engineDose?.seconds;
  const numericDuration = typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0;
  const isometric =
    definition?.movementPattern === "isometric" ||
    (definition && FUNCTIONAL_CATALOGUE[definition.id]?.contraction === "isometric");
  // A coached overcoming effort is a fixed timed protocol, never a holding/RIR table.
  if (isometric && numericDuration && exercise.engineDose?.intent === "explosive") return "general";
  // The prescribed contraction has priority over broad "prehab"/mobility categories.
  if (
    isometric &&
    ((numericDuration && exercise.engineDose?.intent === "hold") ||
      (!exercise.engineDose &&
        sets > 0 &&
        (numericDuration || isTimedText(`${exercise.duration ?? ""} ${exercise.reps ?? ""}`))))
  )
    return "hold";
  if (definition?.family === "football_ball_work" || definition?.requiresBall) return "ball";
  if (/\bz piłk|piłką|piłki\b/i.test(exercise.name)) return "ball";
  const mobility =
    ["mobility", "prehab"].includes(definition?.category ?? "") ||
    ["mobility", "recovery"].includes(definition?.family ?? "") ||
    /mobilno|rozciąg|oddech|rolowan/i.test(exercise.name);
  if (mobility) return "mobility";
  if (/\bm\b/.test(text) && /\d\s*m\b/.test(text) && !isTimedText(exercise.reps ?? "")) {
    if (
      definition?.category === "speed" ||
      sessionKind === "sprint" ||
      /sprint|skip|bieg|marsz/i.test(exercise.name)
    )
      return "sprint";
  }
  if (definition?.category === "speed" && !isTimedText(text)) return "sprint";
  if (definition?.category === "endurance" || /bieg tlenow|trucht|rower/i.test(exercise.name))
    return isTimedText(text) ? "run" : "general";
  // A timed warm-up sequence ("8–10 min: Raise → …") is one guided block.
  if (
    /^\s*\d+(?:\s*[–-]\s*\d+)?\s*min\b/i.test(
      exercise.displayPrescription ?? exercise.duration ?? exercise.reps ?? "",
    )
  )
    return "general";
  if (isPowerTask(exercise)) return "power";
  const holdText = `${exercise.reps ?? ""} ${exercise.duration ?? ""}`;
  if (
    /izometr|utrzyma|deska|plank|wall sit/i.test(`${exercise.name} ${holdText}`) ||
    (sets > 0 && !exercise.reps && exercise.duration)
  )
    return "hold";
  if (
    sets > 0 &&
    isTimedText(exercise.reps ?? "") &&
    !/\d+\s*(?:powt|×)/i.test(exercise.reps ?? "")
  )
    return "hold";
  // kg only where the plan loads the movement; bands, benches and body weight record reps.
  if (sets > 0 && ["external", "axial"].includes(definition?.loadingType ?? ""))
    return section.type === "warmup" ? "bodyweight" : "load";
  if (sets > 0) return "bodyweight";
  if (isTimedText(text)) return "run";
  return "general";
}

/** True when the dose is done on each side separately. */
export function isUnilateral(exercise: TrainingExercise): boolean {
  if (exercise.engineDose?.perSide) return true;
  return /(?:\/|\bna\s+(?:każdą\s+)?)\s*(?:stron\w*|nog\w*|rękę|ręk\w*)\b|każd\w*\s+(?:stron\w*|nog\w*|ręk\w*)|\bL\s*\/\s*P\b|lewa\s*(?:i|\+|\/)\s*prawa/i.test(
    doseText(exercise),
  );
}

const RIR_IN_TEXT =
  /\s*[·,;—-]?\s*(?:RIR\s*\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?|\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*RIR)/gi;
const RPE_IN_TEXT = /\s*[·,;—-]?\s*RPE\s*\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?/gi;

/** Dose without RIR/RPE: the effort is shown once, in its own line. */
export function doseLine(exercise: TrainingExercise): string {
  return compactPrescription(exercise)
    .replace(RIR_IN_TEXT, "")
    .replace(RPE_IN_TEXT, "")
    .replace(/\s*·\s*$/, "")
    .trim();
}

function rirValue(exercise: TrainingExercise): string | null {
  const own = exercise.rir
    ?.trim()
    .replace(/\s*RIR\s*/gi, "")
    .trim();
  if (own) return own;
  const fromLoad = exercise.loadTarget?.match(
    /(\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?)\s*RIR/i,
  );
  return fromLoad?.[1]?.replace(/\s+/g, "") ?? null;
}

/**
 * One effort line. Strength: "Zapas 3–4 powt." Power and landings: the
 * quality criterion from the plan (older saved plans may still carry a RIR
 * on a jump — it is not shown there).
 */
export function effortLine(exercise: TrainingExercise, kind: TaskKind): string | null {
  if (kind === "power") {
    const target = exercise.loadTarget?.trim();
    if (target && !/RIR|RPE|ciężar/i.test(target)) return `Jakość: ${lowerFirst(target)}`;
    return /lądowan|snap.?down|zeskok|drop/i.test(`${exercise.name} ${exercise.exerciseId ?? ""}`)
      ? "Jakość: ciche, stabilne lądowanie"
      : "Jakość: każde powtórzenie szybkie; przerwij serię, gdy zwalnia";
  }
  if (!["load", "bodyweight"].includes(kind)) return null;
  const rir = rirValue(exercise);
  return rir ? `Zapas ${rir.replace(/-/g, "–")} powt.` : null;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase("pl-PL") + text.slice(1);
}

function upperFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pl-PL") + text.slice(1);
}

/** Rest formatted in one place: "Przerwa 30 s", "Przerwa 2 min (pełny odpoczynek)", "Bez przerw — …". */
export function restText(value: string | undefined | null): string | null {
  const raw = value?.trim() ?? "";
  if (!raw || /^[—–-]+$/.test(raw)) return null;
  if (/^bez\s+przerw/i.test(raw)) return upperFirst(raw);
  const rest = formatRestValue(raw);
  if (!rest) return null;
  // "przejdź płynnie dalej", "pełna przerwa" — an instruction, not a duration.
  if (!/\d/.test(rest))
    return upperFirst(/^pełny odpoczynek|^pełna przerwa$/i.test(raw) ? "Pełna przerwa" : rest);
  return `Przerwa ${rest}`;
}

/** Rest after one set of a single exercise; pair rests belong to paired blocks only. */
export function singleRest(exercise: TrainingExercise): string | null {
  return restText(exercise.restAfterExercise || exercise.restAfterPair);
}

/** What the screen says after this exercise in a paired block. */
export function pairedNext(block: TrainingBlock, exercise: TrainingExercise): string | null {
  return linkedNextStep(block, exercise);
}

/** Rest seconds to start after a confirmed set of this row, null when the plan gives no duration. */
export function restSecondsAfter(
  block: TrainingBlock,
  exercise: TrainingExercise,
  paired: boolean,
  partnerStillOpen: boolean,
  completedBlock = false,
): number | null {
  if (completedBlock && exercise.engineDose?.postRestSeconds)
    return exercise.engineDose.postRestSeconds;
  const value = paired
    ? partnerStillOpen
      ? exercise.restAfterExercise
      : exercise.restAfterPair || block.restAfterBlock || exercise.restAfterExercise
    : exercise.restAfterExercise || exercise.restAfterPair;
  if (!value || /^bez\s+przerw/i.test(value)) return null;
  return parseRestDuration(value.replace(/\s*do\s+[A-Z]\d.*$/i, ""));
}

export interface Range {
  min: number;
  max: number;
}

/** Planned sets or repetitions as a range; "2–3" stays a range, never silently rounded up. */
export function setRange(exercise: TrainingExercise): Range {
  const raw = String(exercise.sets ?? "").trim();
  const range = raw.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const fromDose = (exercise.displayPrescription ?? "").match(
    /^(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:×|serie|serii)/,
  );
  const planned = plannedSets(exercise);
  if (!raw && fromDose)
    return { min: Number(fromDose[1]), max: Number(fromDose[2] ?? fromDose[1]) };
  const count = Math.max(1, planned);
  return { min: count, max: count };
}

export function formatRange(range: Range): string {
  return range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
}

/** Distance of one sprint repetition, as written in the plan ("15–20 m"). */
export function sprintDistance(exercise: TrainingExercise): string | null {
  const match = `${exercise.displayPrescription ?? ""} ${exercise.reps ?? ""}`.match(
    /(\d+(?:\s*[–-]\s*\d+)?)\s*m\b/,
  );
  return match ? `${match[1].replace(/\s*-\s*/, "–")} m` : null;
}

/** The recorded rhythm of a skip round, only when the plan states one. */
export function variantLabel(exercise: TrainingExercise): string | null {
  const round = skipRound(exercise.exerciseId, exercise.animationVariant);
  if (round?.rhythm) return `Rytm: ${round.rhythm}`;
  return null;
}

/** One concrete instruction for the card: the first sentence of the plan's cue. Never a generic placeholder. */
export function keyCue(exercise: TrainingExercise): string | null {
  const definition = definitionOf(exercise);
  const raw = (exercise.cue?.trim() || definition?.coachingCues?.[0]?.trim() || "")
    .replace(/\.{2}(?!\.)/g, ".")
    .replace(/\s+/g, " ");
  if (!raw) return null;
  const first = raw.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? raw;
  return first.length > 140 ? `${first.slice(0, 137).replace(/\s+\S*$/, "")}…` : first;
}

/** Work length of one bout in seconds when the plan states exactly one duration ("3 min", "6 × 45 s"). */
export function workSeconds(exercise: TrainingExercise): number | null {
  const seconds = exercise.engineDose?.seconds;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) return seconds;
  const sources = [exercise.duration, exercise.reps, exercise.displayPrescription]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  for (const text of sources) {
    const perSet = text.match(/^\d+(?:\s*[–-]\s*\d+)?\s*[×x]\s*(\d+)\s*(s|sek\w*|min\w*)\b/i);
    if (perSet) return Number(perSet[1]) * (/^min/i.test(perSet[2]) ? 60 : 1);
    if (/[×x]\s*\d/i.test(text)) continue;
    const minutes = text.match(/^(\d+(?:[.,]\d+)?)\s*min\b/i);
    if (minutes) return Math.round(Number(minutes[1].replace(",", ".")) * 60);
    const seconds = text.match(/^(\d+)(?:\s*[–-]\s*(\d+))?\s*s\b/i);
    if (seconds) return Number(seconds[2] ?? seconds[1]);
  }
  return null;
}
