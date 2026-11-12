/** Saved results of the 5v5 lessons.
 *
 * A separate, versioned key: older IQ history (3v2, situations on the board, mastery) is not
 * touched. Every attempt stores its variant, engine version and inputs, so it can be played
 * again and checked: the debrief and replay come from the same deterministic simulator.
 * Results describe play in the simulator only.
 */
import { F5_ENGINE_VERSION, runSim, type F5Input, type OutcomeKind } from "./f5Sim";
import { POSITIONS, variantFromId, type Position } from "./f5Variants";
import type { Grade, ProblemKey } from "./f5Debrief";

export const F5_RESULT_VERSION = 1;
export const MAX_F5_ATTEMPTS = 200;
export const MAX_F5_INPUTS = 2500;
export const f5HistoryKey = (owner: string) => `ballwise:iq:f5:v1:${owner}`;

export type F5Attempt = {
  id: string;
  version: typeof F5_RESULT_VERSION;
  engine: number;
  variant: string;
  position: Position;
  inputs: F5Input[];
  outcome: OutcomeKind;
  choice: Grade;
  execution: Grade;
  problem: ProblemKey;
  /** How the player looked around: device motion or dragging/keys. */
  look: "motion" | "drag";
  createdAt: string;
};

type Store = Pick<Storage, "getItem" | "setItem">;
const OUTCOMES: OutcomeKind[] = [
  "goal",
  "conceded",
  "shot",
  "shotAgainst",
  "kept",
  "lost",
  "out",
  "outAgainst",
];
const GRADES: Grade[] = ["good", "ok", "poor"];
const PROBLEMS: ProblemKey[] = [
  "touchIntoPressure",
  "stoppedUnderPressure",
  "heldTooLong",
  "blockedLane",
  "noReaction",
  "neverReceived",
  "none",
];
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);

function validInput(i: unknown): i is F5Input {
  if (!i || typeof i !== "object") return false;
  const x = i as Record<string, unknown>;
  if (!Number.isInteger(x.tick) || (x.tick as number) < 0 || (x.tick as number) > 10_000)
    return false;
  if (x.kind === "move")
    return num(x.dir) && num(x.speed) && (x.speed as number) >= 0 && (x.speed as number) <= 1;
  if (x.kind === "press" || x.kind === "tackle") return true;
  if (x.kind !== "kick") return false;
  return (
    (x.type === "pass" || x.type === "shot" || x.type === "lofted") &&
    num(x.dir) &&
    num(x.pitch) &&
    num(x.power) &&
    (x.target === undefined ||
      (Number.isInteger(x.target) && (x.target as number) >= 0 && (x.target as number) < 10))
  );
}

export function validF5Attempt(row: unknown): row is F5Attempt {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    r.id.length <= 80 &&
    r.version === F5_RESULT_VERSION &&
    Number.isInteger(r.engine) &&
    typeof r.variant === "string" &&
    variantFromId(r.variant) !== null &&
    POSITIONS.includes(r.position as Position) &&
    variantFromId(r.variant)!.position === r.position &&
    Array.isArray(r.inputs) &&
    r.inputs.length <= MAX_F5_INPUTS &&
    r.inputs.every(validInput) &&
    OUTCOMES.includes(r.outcome as OutcomeKind) &&
    GRADES.includes(r.choice as Grade) &&
    GRADES.includes(r.execution as Grade) &&
    PROBLEMS.includes(r.problem as ProblemKey) &&
    (r.look === "motion" || r.look === "drag") &&
    typeof r.createdAt === "string" &&
    Number.isFinite(Date.parse(r.createdAt))
  );
}

export function loadF5History(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): F5Attempt[] {
  if (!owner) return [];
  const raw = storage.getItem(f5HistoryKey(owner));
  if (!raw) return [];
  if (raw.length > 4_000_000) throw new Error("Historia jest zbyt duża do bezpiecznego odczytu.");
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    value.length > MAX_F5_ATTEMPTS ||
    !value.every(validF5Attempt) ||
    new Set(value.map((row) => row.id)).size !== value.length
  )
    throw new Error("Zapis wyników 5 na 5 jest uszkodzony.");
  return value;
}

/** Adds an attempt; the oldest drop off past the limit. Returns the saved list. */
export function saveF5Attempt(
  owner: string | undefined,
  attempt: F5Attempt,
  storage: Store = localStorage,
) {
  if (!owner) return [attempt];
  if (!validF5Attempt(attempt)) throw new Error("Nieprawidłowy wynik fragmentu.");
  let previous: F5Attempt[];
  try {
    previous = loadF5History(owner, storage);
  } catch {
    previous = []; // a broken list must not block saving a new result
  }
  const next = [...previous.filter((row) => row.id !== attempt.id), attempt].slice(
    -MAX_F5_ATTEMPTS,
  );
  storage.setItem(f5HistoryKey(owner), JSON.stringify(next));
  return next;
}

/** Plays restored attempts again; a result that does not follow from its inputs is rejected.
 * Attempts from another engine version are kept as they are. */
export function verifyF5Attempts(attempts: F5Attempt[]) {
  for (const attempt of attempts) {
    if (!validF5Attempt(attempt)) throw new Error("Nieprawidłowy wynik fragmentu 5 na 5.");
    if (attempt.engine !== F5_ENGINE_VERSION) continue;
    const variant = variantFromId(attempt.variant)!;
    const replay = runSim(variant, attempt.inputs, { record: false });
    if (replay.outcome?.kind !== attempt.outcome)
      throw new Error("Wynik fragmentu 5 na 5 nie zgadza się z powtórką.");
  }
}

export function f5Summary(history: F5Attempt[]) {
  const recent = history.slice(-20);
  return {
    played: history.length,
    goodTouches: recent.filter((r) => r.execution === "good").length,
    goodChoices: recent.filter((r) => r.choice === "good").length,
    recent: recent.length,
  };
}
