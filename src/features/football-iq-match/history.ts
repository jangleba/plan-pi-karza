import type { EvaluationLevel } from "./types";
export type IQAttempt = {
  id: string;
  scenarioId: string;
  variant: number;
  verdict: EvaluationLevel;
  createdAt: string;
  decisionSeconds: number;
  mode: "learn" | "challenge";
};
const key = (owner: string) => `ballwise:iq:v2:${owner}`;
export function loadIQHistory(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): IQAttempt[] {
  if (!owner) return [];
  const raw = storage.getItem(key(owner));
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (
    !Array.isArray(data) ||
    !data.every(
      (x) =>
        x &&
        typeof x.id === "string" &&
        typeof x.scenarioId === "string" &&
        ["strong", "conditional", "risky"].includes(x.verdict) &&
        typeof x.createdAt === "string" &&
        !Number.isNaN(Date.parse(x.createdAt)) &&
        Number.isInteger(x.variant) &&
        x.variant >= 0 &&
        x.variant <= 2 &&
        typeof x.decisionSeconds === "number" &&
        Number.isFinite(x.decisionSeconds) &&
        x.decisionSeconds >= 0 &&
        ["learn", "challenge"].includes(x.mode),
    )
  )
    throw new Error("Nie udało się odczytać historii IQ.");
  return data.slice(-100);
}
export function saveIQAttempt(
  owner: string | undefined,
  attempt: IQAttempt,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  if (!owner) return false;
  const previous = loadIQHistory(owner, storage);
  if (previous.some((x) => x.id === attempt.id)) return true;
  storage.setItem(key(owner), JSON.stringify([...previous, attempt].slice(-100)));
  return true;
}
