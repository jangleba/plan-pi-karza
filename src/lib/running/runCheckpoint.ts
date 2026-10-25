import type { RunningActivityDraft } from "./types";
import type { NativeRunState } from "./nativeRecorder";

const PREFIX = "ballwise:run-draft:v1:";
export interface BrowserRunCheckpoint {
  schema: 1;
  ownerId: string;
  sessionId: string;
  date: string;
  startedAt: string;
  durationSec: number;
  distanceM: number;
  phase: "paused" | "review";
  pending?: RunningActivityDraft;
  intervalResults?: NativeRunState["intervalResults"];
  guideState?: NativeRunState["guideState"];
}
const key = (owner: string, session: string) =>
  `${PREFIX}${encodeURIComponent(owner)}:${encodeURIComponent(session)}`;
export function loadRunCheckpoint(
  owner: string,
  session: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): BrowserRunCheckpoint | null {
  const raw = storage.getItem(key(owner, session));
  if (!raw) return null;
  let value: BrowserRunCheckpoint;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error();
    value = parsed as BrowserRunCheckpoint;
  } catch {
    throw new Error("Nie można odczytać szkicu biegu. Zachowano jego kopię.");
  }
  if (
    value.schema !== 1 ||
    value.ownerId !== owner ||
    value.sessionId !== session ||
    !Number.isFinite(value.durationSec) ||
    value.durationSec < 0 ||
    !Number.isFinite(value.distanceM) ||
    value.distanceM < 0 ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !["paused", "review"].includes(value.phase) ||
    (value.pending &&
      (value.pending.sessionId !== session ||
        value.pending.date !== value.date ||
        !Number.isFinite(value.pending.distanceM) ||
        !Number.isFinite(value.pending.durationSec)))
  )
    throw new Error("Szkic biegu ma nieznaną wersję lub nieprawidłowe dane. Nie nadpisano go.");
  // Repair the earlier journal bug: a complete pending result is always a review.
  if (value.pending) value.phase = "review";
  if (value.phase === "review" && !value.pending)
    throw new Error("Szkic przeglądu nie zawiera wyniku. Nie nadpisano go.");
  return value;
}
export function saveRunCheckpoint(
  value: BrowserRunCheckpoint,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  // Routes stay in RAM. Checkpoints contain aggregates and interval measurements only.
  const pending = value.pending ? { ...value.pending, route: [], splits: [] } : undefined;
  storage.setItem(key(value.ownerId, value.sessionId), JSON.stringify({ ...value, pending }));
}
export function clearRunCheckpoint(
  owner: string,
  session: string,
  storage: Pick<Storage, "removeItem"> = localStorage,
) {
  storage.removeItem(key(owner, session));
}

export function quarantineRunCheckpoint(
  owner: string,
  session: string,
  storage: Storage = localStorage,
) {
  const checkpointKey = key(owner, session);
  const raw = storage.getItem(checkpointKey);
  if (raw === null) return;
  // If the copy cannot be stored, the original remains untouched.
  storage.setItem(`${checkpointKey}:corrupt:${Date.now()}`, raw);
  storage.removeItem(checkpointKey);
}
