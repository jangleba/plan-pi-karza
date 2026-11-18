/** Saved results of the 11v11 lesson: a separate, versioned key (the other IQ history is not
 * touched). Every attempt keeps its variant, engine version and inputs, so it can be played
 * again and checked: debrief and replay come from the same deterministic simulator. */
import { type E11Input, type OutcomeKind } from "./e11Sim";
import { makeVariant, ROLES, type E11Role, type E11Variant } from "./e11Variants";
import type { Grade, ProblemKey, TimingKind } from "./e11Debrief";

export const E11_RESULT_VERSION = 1;
export const MAX_E11_ATTEMPTS = 120;
export const MAX_E11_INPUTS = 1500;
export const e11HistoryKey = (owner: string) => `ballwise:iq:e11:v1:${owner}`;
export const e11RoleKey = (owner: string) => `ballwise:iq:e11:role:v1:${owner}`;
export const E11_HINTS_KEY = "ballwise:iq:e11:hints:v1";

export type E11Attempt = {
  id: string;
  version: typeof E11_RESULT_VERSION;
  engine: number;
  variant: string;
  role: E11Role;
  inputs: E11Input[];
  outcome: OutcomeKind;
  timing: TimingKind;
  choice: Grade;
  problem: ProblemKey;
  hints: boolean;
  createdAt: string;
};

const OUTCOMES: OutcomeKind[] = [
  "goal",
  "saved",
  "shotOff",
  "offside",
  "intercepted",
  "tackled",
  "out",
  "timeout",
];
const TIMINGS: TimingKind[] = ["inTime", "early", "late", "none"];
const GRADES: Grade[] = ["good", "ok", "poor"];
const PROBLEMS: ProblemKey[] = [
  "late",
  "early",
  "readLine",
  "heldTooLong",
  "blockedLane",
  "rushedShot",
  "none",
];
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);

function validInput(i: unknown): i is E11Input {
  if (!i || typeof i !== "object") return false;
  const x = i as Record<string, unknown>;
  if (!Number.isInteger(x.tick) || (x.tick as number) < 0 || (x.tick as number) > 10_000)
    return false;
  if (x.kind === "move") return num(x.dir) && num(x.speed);
  if (x.kind === "pass")
    return (
      Number.isInteger(x.to) &&
      typeof x.through === "boolean" &&
      (x.to as number) >= 0 &&
      (x.to as number) < 11
    );
  return x.kind === "shot";
}

export function validAttempt(a: unknown): a is E11Attempt {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    x.version === E11_RESULT_VERSION &&
    typeof x.variant === "string" &&
    ROLES.includes(x.role as E11Role) &&
    OUTCOMES.includes(x.outcome as OutcomeKind) &&
    TIMINGS.includes(x.timing as TimingKind) &&
    GRADES.includes(x.choice as Grade) &&
    PROBLEMS.includes(x.problem as ProblemKey) &&
    Array.isArray(x.inputs) &&
    x.inputs.length <= MAX_E11_INPUTS &&
    x.inputs.every(validInput) &&
    typeof x.createdAt === "string"
  );
}

type Store = Pick<Storage, "getItem" | "setItem">;
const browser = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadE11History(owner: string, store: Store | null = browser()): E11Attempt[] {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(e11HistoryKey(owner)) ?? "[]");
    return Array.isArray(raw) ? raw.filter(validAttempt).slice(-MAX_E11_ATTEMPTS) : [];
  } catch {
    return [];
  }
}
export function saveE11Attempt(
  owner: string,
  attempt: E11Attempt,
  store: Store | null = browser(),
): E11Attempt[] {
  const next = [...loadE11History(owner, store).filter((a) => a.id !== attempt.id), attempt].slice(
    -MAX_E11_ATTEMPTS,
  );
  store?.setItem(e11HistoryKey(owner), JSON.stringify(next));
  return next;
}

/** `e11-<role>-<seed>` back to the picture it names, or null for anything else. */
export function variantFromId(id: string): E11Variant | null {
  const m = /^e11-(mid|fwd|def)-(\d+)$/.exec(id);
  return m ? makeVariant(Number(m[2]), m[1] as E11Role) : null;
}
