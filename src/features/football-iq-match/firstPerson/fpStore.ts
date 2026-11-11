/** Saved results of the first-person 3v2 lessons.
 *
 * A separate, versioned key: the older IQ history (journeys, mastery, field task) is not
 * touched. Every attempt stores its variant, engine version and inputs, so it can be played
 * again and checked (the debrief and replay come from the same deterministic simulator).
 */
import { FP_ENGINE_VERSION, runSim, type FpInput, type OutcomeKind } from "./fpSim";
import { variantFromId } from "./fpVariants";
import type { Grade, PrincipleKey } from "./fpDebrief";

export const FP_RESULT_VERSION = 1;
export const MAX_FP_ATTEMPTS = 300;
export const fpHistoryKey = (owner: string) => `ballwise:iq:fp:v1:${owner}`;

export type FpAttempt = {
  id: string;
  version: typeof FP_RESULT_VERSION;
  engine: number;
  variant: string;
  principle: PrincipleKey;
  inputs: FpInput[];
  outcome: OutcomeKind;
  choice: Grade;
  execution: Grade;
  /** How the player looked around: device motion or dragging on the screen. */
  look: "motion" | "drag";
  createdAt: string;
};

type Store = Pick<Storage, "getItem" | "setItem">;
const OUTCOMES: OutcomeKind[] = ["chance", "progress", "kept", "loss", "offside", "timeout"];
const GRADES: Grade[] = ["good", "ok", "poor"];
const PRINCIPLE_KEYS: PrincipleKey[] = ["touch", "lane", "timing"];

function validInput(i: unknown): i is FpInput {
  if (!i || typeof i !== "object") return false;
  const x = i as Record<string, unknown>;
  if (!Number.isInteger(x.tick) || (x.tick as number) < 0 || (x.tick as number) > 10_000)
    return false;
  if (x.kind === "touch" || x.kind === "carry") return Number.isFinite(x.dir);
  if (x.kind !== "pass") return false;
  const aim = x.aim as Record<string, unknown> | undefined;
  if (!aim) return false;
  if (aim.kind === "player") return aim.id === "support" || aim.id === "runner";
  return aim.kind === "point" && Number.isFinite(aim.x) && Number.isFinite(aim.y);
}

export function validFpAttempt(row: unknown): row is FpAttempt {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    r.id.length <= 80 &&
    r.version === FP_RESULT_VERSION &&
    Number.isInteger(r.engine) &&
    typeof r.variant === "string" &&
    variantFromId(r.variant) !== null &&
    PRINCIPLE_KEYS.includes(r.principle as PrincipleKey) &&
    Array.isArray(r.inputs) &&
    r.inputs.length <= 400 &&
    r.inputs.every(validInput) &&
    OUTCOMES.includes(r.outcome as OutcomeKind) &&
    GRADES.includes(r.choice as Grade) &&
    GRADES.includes(r.execution as Grade) &&
    (r.look === "motion" || r.look === "drag") &&
    typeof r.createdAt === "string" &&
    Number.isFinite(Date.parse(r.createdAt))
  );
}

export function loadFpHistory(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): FpAttempt[] {
  if (!owner) return [];
  const raw = storage.getItem(fpHistoryKey(owner));
  if (!raw) return [];
  if (raw.length > 2_000_000) throw new Error("Historia jest zbyt duża do bezpiecznego odczytu.");
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    value.length > MAX_FP_ATTEMPTS ||
    !value.every(validFpAttempt) ||
    new Set(value.map((row) => row.id)).size !== value.length
  )
    throw new Error("Zapis wyników 3 na 2 jest uszkodzony.");
  return value;
}

/** Adds an attempt; the oldest ones drop off past the limit. Returns the saved list. */
export function saveFpAttempt(
  owner: string | undefined,
  attempt: FpAttempt,
  storage: Store = localStorage,
) {
  if (!owner) return [attempt];
  if (!validFpAttempt(attempt)) throw new Error("Nieprawidłowy wynik akcji.");
  let previous: FpAttempt[];
  try {
    previous = loadFpHistory(owner, storage);
  } catch {
    previous = []; // a broken list must not block saving a new result
  }
  const next = [...previous.filter((row) => row.id !== attempt.id), attempt].slice(
    -MAX_FP_ATTEMPTS,
  );
  storage.setItem(fpHistoryKey(owner), JSON.stringify(next));
  return next;
}

/** Plays restored attempts again; a result that does not follow from its inputs is rejected.
 * Attempts from an older engine version are kept as they are (that engine is not shipped). */
export function verifyFpAttempts(attempts: FpAttempt[]) {
  for (const attempt of attempts) {
    if (!validFpAttempt(attempt)) throw new Error("Nieprawidłowy wynik akcji 3 na 2.");
    if (attempt.engine !== FP_ENGINE_VERSION) continue;
    const variant = variantFromId(attempt.variant)!;
    const replay = runSim(variant, attempt.inputs, { record: false });
    if (replay.outcome?.kind !== attempt.outcome)
      throw new Error("Wynik akcji 3 na 2 nie zgadza się z powtórką.");
  }
}

export function fpSummary(history: FpAttempt[]) {
  const recent = history.slice(-20);
  return {
    played: history.length,
    goodChoices: recent.filter((r) => r.choice === "good").length,
    recent: recent.length,
  };
}
