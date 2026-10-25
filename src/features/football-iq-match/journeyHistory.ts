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
export const MAX_JOURNEY_ATTEMPTS = 100;
export const journeyHistoryKey = (owner: string) => `ballwise:iq:journeys:v1:${owner}`;
export const journeyDraftKey = (owner: string) => `${journeyHistoryKey(owner)}:draft`;
const key = journeyHistoryKey;
const draftKey = journeyDraftKey;
function announce(owner: string, key: string, value: string | null) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("ballwise:module-data-changed", {
        detail: { userId: owner, module: "iq", key, value },
      }),
    );
}
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
function validAttempt(v: unknown): v is JourneyAttempt {
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
  if (
    !Array.isArray(value) ||
    value.length > MAX_JOURNEY_ATTEMPTS ||
    !value.every(validAttempt) ||
    new Set(value.map((row) => row.id)).size !== value.length
  )
    throw new Error("Nie udało się odczytać historii akcji.");
  value.forEach(validateCompletedAttempt);
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
  validateCompletedAttempt(attempt);
  const duplicate = previous.find((a) => a.id === attempt.id);
  if (duplicate) {
    if (!sameAttempt(duplicate, attempt))
      throw new Error(
        "Ten identyfikator oznacza już inną próbę. Zachowaj obie kopie przed importem.",
      );
    return true;
  }
  if (previous.length >= MAX_JOURNEY_ATTEMPTS)
    throw new Error(
      "Historia zawiera już 100 prób. Pobierz kopię, a następnie wyczyść historię, aby zapisywać kolejne. Bieżącą próbę możesz pobrać osobno.",
    );
  const value = JSON.stringify([...previous, attempt]);
  storage.setItem(key(owner), value);
  announce(owner, key(owner), value);
  return true;
}
function validateCompletedAttempt(attempt: JourneyAttempt) {
  if (!validAttempt(attempt)) throw new Error("Nieprawidłowy zapis próby IQ.");
  const reconstructed = restoreJourney(attempt);
  if (
    !reconstructed.outcome ||
    reconstructed.outcome !== attempt.outcome ||
    journeyVerdict(reconstructed) !== attempt.verdict
  )
    throw new Error("Wynik nie zgadza się z zapisem akcji.");
}
const attemptSignature = (attempt: JourneyAttempt) =>
  JSON.stringify([
    attempt.version,
    attempt.bankVersion,
    attempt.id,
    attempt.scenarioId,
    attempt.role,
    attempt.mode,
    attempt.choices.map((choice) => [choice.id, choice.seconds]),
    attempt.outcome,
    attempt.verdict,
  ]);
const sameAttempt = (a: JourneyAttempt, b: JourneyAttempt) =>
  attemptSignature(a) === attemptSignature(b);
export function saveJourneyDraft(
  owner: string | undefined,
  session: JourneySession,
  mode: JourneyMode,
  id: string,
  storage: Store = localStorage,
) {
  if (!owner) return;
  // A failed restore must never let the boot autosave erase the only corrupt copy.
  loadJourneyDraft(owner, storage);
  if (session.outcome) {
    storage.removeItem(draftKey(owner));
    announce(owner, draftKey(owner), null);
    return;
  }
  const draft = makeJourneyDraft(session, mode, id);
  const value = JSON.stringify(draft);
  if (storage.getItem(draftKey(owner)) !== value) {
    storage.setItem(draftKey(owner), value);
    announce(owner, draftKey(owner), value);
  }
}
export function makeJourneyDraft(
  session: JourneySession,
  mode: JourneyMode,
  id: string,
): JourneyDraft {
  return {
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

export function rawJourneyData(owner: string, storage: Pick<Storage, "getItem"> = localStorage) {
  return { history: storage.getItem(key(owner)), draft: storage.getItem(draftKey(owner)) };
}
export function createJourneyBackup(
  attempts: readonly JourneyAttempt[],
  draft: JourneyDraft | null = null,
) {
  attempts.forEach(validateCompletedAttempt);
  if (draft) restoreJourney(draft);
  return {
    schema: "ballwise.iq.journey-backup.v1",
    exportedAt: new Date().toISOString(),
    bankVersion: JOURNEY_BANK_VERSION,
    attempts: [...attempts],
    draft,
  };
}
export function readJourneyBackup(input: unknown) {
  if (
    !object(input) ||
    input.schema !== "ballwise.iq.journey-backup.v1" ||
    !Array.isArray(input.attempts) ||
    input.attempts.length > MAX_JOURNEY_ATTEMPTS ||
    !input.attempts.every(validAttempt)
  )
    throw new Error("To nie jest poprawna kopia IQ Journey.");
  const attempts = input.attempts as JourneyAttempt[];
  attempts.forEach(validateCompletedAttempt);
  if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length)
    throw new Error("Kopia zawiera powtórzone identyfikatory prób.");
  const draft = input.draft ?? null;
  if (draft !== null && !validBase(draft))
    throw new Error("Nieprawidłowy zapis niedokończonej akcji w kopii.");
  if (draft !== null && restoreJourney(draft).outcome)
    throw new Error("Kopia niedokończonej akcji zawiera już wynik.");
  return { attempts, draft: draft as JourneyDraft | null };
}
export function restoreJourneyBackup(owner: string, input: unknown, storage: Store = localStorage) {
  if (!owner) throw new Error("Zaloguj się, aby przywrócić kopię IQ.");
  const incoming = readJourneyBackup(input);
  const current = loadJourneyHistory(owner, storage);
  const currentDraft = loadJourneyDraft(owner, storage);
  const merged = [...current];
  for (const attempt of incoming.attempts) {
    const existing = merged.find((row) => row.id === attempt.id);
    if (existing && !sameAttempt(existing, attempt))
      throw new Error(
        "Kopia zawiera inną próbę pod istniejącym identyfikatorem. Nie zmieniono historii.",
      );
    if (!existing) merged.push(attempt);
  }
  if (merged.length > MAX_JOURNEY_ATTEMPTS)
    throw new Error(
      "Połączona historia przekracza 100 prób. Pobierz obie kopie przed wyczyszczeniem zapisu lokalnego.",
    );
  if (
    incoming.draft &&
    currentDraft &&
    JSON.stringify(incoming.draft) !== JSON.stringify(currentDraft)
  )
    throw new Error(
      "Masz inną niedokończoną akcję. Dokończ ją albo pobierz kopię i wyczyść zapis przed importem.",
    );
  const before = rawJourneyData(owner, storage);
  const historyRaw = JSON.stringify(merged);
  const draftRaw = incoming.draft && !currentDraft ? JSON.stringify(incoming.draft) : before.draft;
  try {
    storage.setItem(key(owner), historyRaw);
    if (draftRaw !== before.draft && draftRaw !== null) storage.setItem(draftKey(owner), draftRaw);
  } catch (reason) {
    try {
      if (before.history === null) storage.removeItem(key(owner));
      else storage.setItem(key(owner), before.history);
    } catch {
      throw new Error(
        "Historia została przywrócona, ale nie udało się zapisać akcji roboczej ani cofnąć importu. Zachowaj plik kopii i sprawdź historię.",
      );
    }
    throw reason;
  }
  announce(owner, key(owner), historyRaw);
  if (draftRaw !== before.draft) announce(owner, draftKey(owner), draftRaw);
  return {
    attempts: merged,
    added: merged.length - current.length,
    draft: incoming.draft ?? currentDraft,
  };
}
/** Explicit recovery only, after the user downloaded the original raw snapshot. */
export function clearJourneyDataAfterBackup(
  owner: string,
  expected: ReturnType<typeof rawJourneyData>,
  storage: Store = localStorage,
) {
  const current = rawJourneyData(owner, storage);
  if (current.history !== expected.history || current.draft !== expected.draft)
    throw new Error("Zapis zmienił się. Pobierz aktualną kopię przed wyczyszczeniem.");
  storage.removeItem(key(owner));
  storage.removeItem(draftKey(owner));
  announce(owner, key(owner), null);
  announce(owner, draftKey(owner), null);
}
