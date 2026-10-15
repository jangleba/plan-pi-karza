import { JOURNEY_BANK_VERSION, SUPPORTED_JOURNEY_BANK_VERSIONS, journeyBank } from "./journeyBank";
import { chooseJourney, createJourney, journeyVerdict } from "./journeyEngine";
import type { JourneyAttempt, JourneyMode, JourneySession } from "./journeyTypes";

export type JourneyDraft = {
  version: 1;
  bankVersion: string;
  id: string;
  scenarioId: string;
  mode: JourneyMode;
  choices: { id: string; seconds: number }[];
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (owner: string) => `ballwise:iq:journeys:v1:${owner}`;
const draftKey = (owner: string) => `${key(owner)}:draft`;
const definitionById = new Map(journeyBank.map((s) => [s.id, s]));
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const validChoice = (v: unknown) =>
  object(v) &&
  typeof v.id === "string" &&
  v.id.length <= 80 &&
  typeof v.seconds === "number" &&
  Number.isFinite(v.seconds) &&
  v.seconds >= 0 &&
  v.seconds <= 86400;
function validBase(v: unknown): v is JourneyDraft {
  return (
    object(v) &&
    v.version === 1 &&
    typeof v.bankVersion === "string" &&
    SUPPORTED_JOURNEY_BANK_VERSIONS.includes(v.bankVersion) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    v.id.length <= 100 &&
    typeof v.scenarioId === "string" &&
    definitionById.has(v.scenarioId) &&
    (v.bankVersion !== "2026-10-15.1" || definitionById.get(v.scenarioId)?.revision !== 2) &&
    ["learn", "challenge"].includes(String(v.mode)) &&
    Array.isArray(v.choices) &&
    v.choices.length <= 6 &&
    v.choices.every(validChoice) &&
    v.choices.every(
      (c) =>
        !c.id.startsWith("free:") || (v.bankVersion === "2026-10-15.3" && v.mode === "challenge"),
    )
  );
}
function validAttempt(v: unknown): boolean {
  if (!validBase(v)) return false;
  const row = v as unknown as Record<string, unknown>;
  return (
    typeof row.createdAt === "string" &&
    Number.isFinite(Date.parse(row.createdAt)) &&
    ["strong", "conditional", "risky"].includes(String(row.verdict)) &&
    ["progress", "retained", "chance", "blocked", "loss", "recovered", "contained"].includes(
      String(row.outcome),
    ) &&
    row.role === definitionById.get(v.scenarioId)!.role
  );
}
export function restoreJourney(value: JourneyDraft): JourneySession {
  if (!validBase(value)) throw new Error("Nieobsługiwana wersja zapisu akcji.");
  let session = createJourney(definitionById.get(value.scenarioId)!);
  for (const choice of value.choices) session = chooseJourney(session, choice.id, choice.seconds);
  return session;
}
export function loadJourneyHistory(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): JourneyAttempt[] {
  if (!owner) return [];
  const raw = storage.getItem(key(owner));
  if (!raw) return [];
  if (raw.length > 2_000_000) throw new Error("Historia jest zbyt duża do bezpiecznego odczytu.");
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 100 || !value.every(validAttempt))
    throw new Error("Nie udało się odczytać historii akcji.");
  return value as JourneyAttempt[];
}
export function makeJourneyAttempt(
  session: JourneySession,
  mode: JourneyMode,
  id: string,
  now = new Date(),
): JourneyAttempt {
  if (!session.outcome) throw new Error("Nie zapisujemy nieukończonej akcji jako wyniku.");
  return {
    version: 1,
    bankVersion: JOURNEY_BANK_VERSION,
    id,
    scenarioId: session.definition.id,
    role: session.definition.role,
    mode,
    createdAt: now.toISOString(),
    choices: session.decisions.map((d) => ({
      id: d.choiceId,
      seconds: Math.min(86400, d.decisionSeconds),
    })),
    outcome: session.outcome,
    verdict: journeyVerdict(session),
  };
}
export function saveJourneyAttempt(
  owner: string | undefined,
  attempt: JourneyAttempt,
  storage: Store = localStorage,
) {
  if (!owner) return false;
  const previous = loadJourneyHistory(owner, storage);
  if (previous.some((a) => a.id === attempt.id)) return true;
  const reconstructed = restoreJourney(attempt);
  if (
    !reconstructed.outcome ||
    reconstructed.outcome !== attempt.outcome ||
    journeyVerdict(reconstructed) !== attempt.verdict
  )
    throw new Error("Wynik nie zgadza się z zapisem akcji.");
  storage.setItem(key(owner), JSON.stringify([...previous, attempt].slice(-100)));
  return true;
}
export function saveJourneyDraft(
  owner: string | undefined,
  session: JourneySession,
  mode: JourneyMode,
  id: string,
  storage: Store = localStorage,
) {
  if (!owner) return;
  if (session.outcome) {
    storage.removeItem(draftKey(owner));
    return;
  }
  const draft: JourneyDraft = {
    version: 1,
    bankVersion: JOURNEY_BANK_VERSION,
    id,
    scenarioId: session.definition.id,
    mode,
    choices: session.decisions.map((d) => ({
      id: d.choiceId,
      seconds: Math.min(86400, d.decisionSeconds),
    })),
  };
  storage.setItem(draftKey(owner), JSON.stringify(draft));
}
export function loadJourneyDraft(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): JourneyDraft | null {
  if (!owner) return null;
  const raw = storage.getItem(draftKey(owner));
  if (!raw) return null;
  if (raw.length > 10000) throw new Error("Nieprawidłowy zapis niedokończonej akcji.");
  const draft: unknown = JSON.parse(raw);
  if (!validBase(draft)) throw new Error("Nie udało się odczytać niedokończonej akcji.");
  const session = restoreJourney(draft);
  return session.outcome ? null : draft;
}
