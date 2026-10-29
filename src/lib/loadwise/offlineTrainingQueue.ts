import { readDurableTrainingValue, updateDurableTrainingValue } from "./durableTrainingStore";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

const QUEUE_VERSION = 1;
const MAX_ITEMS = 120;

type SessionLogWrite = {
  kind: "session_log";
  dedupeKey: string;
  payload: TablesInsert<"session_logs">;
};

type SetLogWrite = {
  kind: "exercise_set_log";
  dedupeKey: string;
  payload: TablesInsert<"exercise_set_logs">;
};

type RunningActivityWrite = {
  kind: "running_activity";
  dedupeKey: string;
  payload: TablesInsert<"running_activities">;
};

type ProgressionWrite = {
  kind: "running_progression";
  dedupeKey: string;
  payload: Pick<
    TablesUpdate<"athlete_profiles">,
    "running_progression_level" | "running_progression_updated_at"
  >;
};

export type PendingTrainingWrite = (
  SessionLogWrite | SetLogWrite | RunningActivityWrite | ProgressionWrite
) & {
  operationId?: string;
  expectedVersion?: number;
  predecessors?: string[];
};

export type StoredTrainingWrite = PendingTrainingWrite & {
  queuedAt: number;
  operationId?: string;
  status?: "pending" | "sending" | "failed" | "conflict";
  error?: string;
};

interface QueueEnvelope {
  version: number;
  items: StoredTrainingWrite[];
  recoveryRaw?: string;
}
const durableSnapshots = new Map<string, QueueEnvelope>();
const recoveryFailures = new Map<string, string>();
const purgedUsers = new Set<string>();
let channel: BroadcastChannel | null = null;
function prepareChannel() {
  if (channel || typeof window === "undefined" || !("BroadcastChannel" in window)) return;
  channel = new window.BroadcastChannel("ballwise-training-journal");
  channel.onmessage = (event: MessageEvent<{ userId?: string; deleted?: boolean }>) => {
    const id = event.data?.userId;
    if (!id) return;
    if (event.data.deleted) {
      purgedUsers.add(id);
      durableSnapshots.delete(id);
    } else if (!purgedUsers.has(id))
      void readDurableTrainingValue<QueueEnvelope>(id)
        .then((value) => {
          if (!purgedUsers.has(id))
            durableSnapshots.set(id, value ?? { version: QUEUE_VERSION, items: [] });
          window.dispatchEvent(new Event("ballwise:training-queue-changed"));
        })
        .catch(() => undefined);
    window.dispatchEvent(new Event("ballwise:training-queue-changed"));
  };
}
function changed(userId: string, deleted = false) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ballwise:training-queue-changed"));
    prepareChannel();
    channel?.postMessage({ userId, deleted });
  }
}
function validWrite(item: unknown, userId: string): item is StoredTrainingWrite {
  if (!item || typeof item !== "object") return false;
  const row = item as StoredTrainingWrite;
  return (
    ["session_log", "exercise_set_log", "running_activity", "running_progression"].includes(
      row.kind,
    ) &&
    typeof row.dedupeKey === "string" &&
    !!row.dedupeKey &&
    typeof row.payload === "object" &&
    !!row.payload &&
    typeof row.queuedAt === "number" &&
    Number.isFinite(row.queuedAt) &&
    (!("user_id" in row.payload) || row.payload.user_id === userId)
  );
}
function parseEnvelope(raw: string | null, userId: string): QueueEnvelope {
  if (!raw) return { version: QUEUE_VERSION, items: [] };
  try {
    const parsed = JSON.parse(raw) as QueueEnvelope;
    if (
      parsed.version !== QUEUE_VERSION ||
      !Array.isArray(parsed.items) ||
      !parsed.items.every((item) => validWrite(item, userId))
    )
      throw new Error("Unsupported queue format");
    return parsed;
  } catch {
    return { version: QUEUE_VERSION, items: [], recoveryRaw: raw };
  }
}
function addLegacy(current: QueueEnvelope | undefined, legacy: QueueEnvelope): QueueEnvelope {
  const combined = current ?? { version: QUEUE_VERSION, items: [] };
  const items = new Map(combined.items.map((row) => [row.dedupeKey, row]));
  for (const candidate of legacy.items) {
    const old = items.get(candidate.dedupeKey);
    if (old?.operationId && candidate.operationId === old.operationId) continue;
    if (candidate.operationId && old?.predecessors?.includes(candidate.operationId)) continue;
    const causallyNewer = !!old?.operationId && candidate.predecessors?.includes(old.operationId);
    if (old && !causallyNewer && (!candidate.operationId || candidate.queuedAt < old.queuedAt))
      continue;
    items.set(candidate.dedupeKey, {
      ...candidate,
      operationId: candidate.operationId ?? crypto.randomUUID(),
      status: candidate.status ?? "pending",
    });
  }
  return {
    ...combined,
    recoveryRaw: combined.recoveryRaw ?? legacy.recoveryRaw,
    items: [...items.values()],
  };
}

/** Await before accepting a new result: a successful promise means the transaction committed. */
export async function recoverTrainingQueue(userId: string): Promise<void> {
  if (purgedUsers.has(userId)) return;
  const storage = browserStorage();
  let raw: string | null = null;
  try {
    raw = storage?.getItem(queueKey(userId)) ?? null;
    const envelope = raw
      ? await updateDurableTrainingValue<QueueEnvelope>(userId, (value) =>
          addLegacy(value, parseEnvelope(raw, userId)),
        )
      : await readDurableTrainingValue<QueueEnvelope>(userId);
    if (purgedUsers.has(userId)) return;
    const next = envelope ?? { version: QUEUE_VERSION, items: [] };
    const previous = durableSnapshots.get(userId);
    durableSnapshots.set(userId, next);
    recoveryFailures.delete(userId);
    // Migration is complete only after IndexedDB commit. Corrupt source bytes remain recoverable in the journal.
    if (raw && storage?.getItem(queueKey(userId)) === raw) storage.removeItem(queueKey(userId));
    if (JSON.stringify(previous) !== JSON.stringify(next)) changed(userId);
  } catch {
    // A denied IndexedDB still has a durable localStorage fallback, with an explicit diagnostic.
    recoveryFailures.set(
      userId,
      "Baza telefonu jest niedostępna; zapis korzysta z pamięci przeglądarki.",
    );
  }
}

export async function enqueueDurableTrainingWrite(
  userId: string,
  write: PendingTrainingWrite,
): Promise<boolean> {
  if (purgedUsers.has(userId)) return false;
  await recoverTrainingQueue(userId);
  const row: StoredTrainingWrite = {
    ...write,
    operationId: write.operationId ?? crypto.randomUUID(),
    queuedAt: Date.now(),
    status: "pending",
  };
  if (!validWrite(row, userId)) return false;
  try {
    const envelope = await updateDurableTrainingValue<QueueEnvelope>(userId, (current) => {
      if (purgedUsers.has(userId)) throw new Error("Account data deleted");
      const previous = current ?? { version: QUEUE_VERSION, items: [] };
      const replaced = previous.items.find((item) => item.dedupeKey === row.dedupeKey);
      row.predecessors = [
        ...new Set([
          ...(row.predecessors ?? []),
          ...(replaced?.predecessors ?? []),
          ...(replaced?.operationId ? [replaced.operationId] : []),
        ]),
      ].slice(-120);
      const items = previous.items.filter((item) => item.dedupeKey !== row.dedupeKey);
      if (items.length >= MAX_ITEMS) throw new Error("Queue full");
      return { ...previous, items: [...items, row] };
    });
    if (envelope && !purgedUsers.has(userId)) durableSnapshots.set(userId, envelope);
    changed(userId);
    return true;
  } catch {
    // This fallback is synchronous and must succeed before the UI reports a local save.
    return withTrainingWriteLock(userId, async () => enqueueTrainingWrite(userId, row));
  }
}

export function trainingQueueStatus(userId: string) {
  const items = readPendingTrainingWrites(userId);
  const raw = browserStorage()?.getItem(queueKey(userId)) ?? null;
  const recovery =
    durableSnapshots.get(userId)?.recoveryRaw ?? parseEnvelope(raw, userId).recoveryRaw;
  return {
    pending: items.filter(
      (row) => !row.status || row.status === "pending" || row.status === "sending",
    ).length,
    failed: items.filter((row) => row.status === "failed").length,
    conflicts: items.filter((row) => row.status === "conflict").length,
    recoveryRequired: !!recovery,
    storageWarning: recoveryFailures.get(userId) ?? null,
    error: items.find((row) => row.error)?.error ?? null,
  };
}

export async function exportTrainingQueue(userId: string) {
  await recoverTrainingQueue(userId);
  return {
    items: readPendingTrainingWrites(userId),
    recoveryRaw:
      durableSnapshots.get(userId)?.recoveryRaw ??
      browserStorage()?.getItem(queueKey(userId)) ??
      null,
  };
}

export async function purgeTrainingQueue(userId: string): Promise<boolean> {
  purgedUsers.add(userId);
  durableSnapshots.delete(userId);
  recoveryFailures.delete(userId);
  let cleared = true;
  try {
    browserStorage()?.removeItem(queueKey(userId));
  } catch {
    cleared = false;
  }
  if (typeof indexedDB !== "undefined") {
    try {
      await updateDurableTrainingValue(userId, () => undefined);
    } catch {
      cleared = false;
    }
  }
  changed(userId, true);
  return cleared;
}
export async function retryFailedTrainingWrites(userId: string): Promise<void> {
  await recoverTrainingQueue(userId);
  const reset = (current: QueueEnvelope | undefined) =>
    current && {
      ...current,
      items: current.items.map((row) =>
        row.status === "failed" ? { ...row, status: "pending" as const, error: undefined } : row,
      ),
    };
  try {
    const envelope = await updateDurableTrainingValue<QueueEnvelope>(userId, reset);
    if (envelope) durableSnapshots.set(userId, envelope);
  } catch {
    const storage = browserStorage();
    if (storage) {
      const current = parseEnvelope(storage.getItem(queueKey(userId)), userId);
      if (!current.recoveryRaw) writeQueue(userId, reset(current)!.items, storage);
    }
  }
  changed(userId);
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function queueKey(userId: string): string {
  return `loadwise:training-queue:v${QUEUE_VERSION}:${userId}`;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isRetryableWriteError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as Record<string, unknown>;
  if (/^\d{5}$/.test(String(row.code ?? ""))) return false;
  const status = Number(row.status ?? row.statusCode);
  if (status >= 400 && status <= 499 && ![408, 425, 429].includes(status)) return false;
  if (row.name === "AbortError") return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if ([408, 425, 429].includes(status) || (status >= 500 && status <= 599)) return true;
  const message = `${String(row.message ?? "")} ${String(row.details ?? "")}`.toLowerCase();
  return /failed to fetch|network|timeout|timed out|connection|load failed|fetch|temporar/.test(
    message,
  );
}

export function readPendingTrainingWrites(
  userId: string,
  storage: StorageLike | null = browserStorage(),
  _now = Date.now(),
): StoredTrainingWrite[] {
  if (purgedUsers.has(userId) && storage === browserStorage()) return [];
  if (storage === browserStorage() && durableSnapshots.has(userId)) {
    const durable = durableSnapshots.get(userId)!;
    const legacy = parseEnvelope(storage?.getItem(queueKey(userId)) ?? null, userId);
    return addLegacy(durable, legacy).items;
  }
  if (!storage) return [];
  try {
    const raw = storage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<QueueEnvelope>;
    if (parsed.version !== QUEUE_VERSION || !Array.isArray(parsed.items)) {
      return [];
    }
    const fresh = parsed.items.filter((item): item is StoredTrainingWrite =>
      validWrite(item, userId),
    );

    return fresh;
  } catch {
    // Leave unreadable bytes intact for recovery; never discard unsent results.
    return [];
  }
}

function writeQueue(userId: string, items: StoredTrainingWrite[], storage: StorageLike): void {
  if (items.length === 0) {
    storage.removeItem(queueKey(userId));
    return;
  }
  const envelope: QueueEnvelope = { version: QUEUE_VERSION, items };
  storage.setItem(queueKey(userId), JSON.stringify(envelope));
}

export function enqueueTrainingWrite(
  userId: string,
  write: PendingTrainingWrite,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(queueKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<QueueEnvelope>;
      if (
        parsed.version !== QUEUE_VERSION ||
        !Array.isArray(parsed.items) ||
        parsed.items.length !== readPendingTrainingWrites(userId, storage).length
      )
        return false;
    }
    const previous = readPendingTrainingWrites(userId, storage, now).find(
      (row) => row.dedupeKey === write.dedupeKey,
    );
    const current = readPendingTrainingWrites(userId, storage, now).filter(
      (item) => item.dedupeKey !== write.dedupeKey,
    );
    if (current.length >= MAX_ITEMS) return false;
    current.push({
      ...write,
      queuedAt: now,
      operationId: write.operationId ?? crypto.randomUUID(),
      status: "pending",
      predecessors: [
        ...new Set([
          ...(write.predecessors ?? []),
          ...(previous?.predecessors ?? []),
          ...(previous?.operationId ? [previous.operationId] : []),
        ]),
      ].slice(-120),
    } as StoredTrainingWrite);
    writeQueue(userId, current, storage);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function")
      window.dispatchEvent(new Event("ballwise:training-queue-changed"));
    return true;
  } catch {
    return false;
  }
}

export async function flushPendingTrainingWrites(
  userId: string,
  persist: (write: StoredTrainingWrite) => Promise<boolean>,
  storage: StorageLike | null = browserStorage(),
): Promise<{ synced: number; remaining: number }> {
  const durable = storage === browserStorage() && typeof indexedDB !== "undefined";
  if (durable) await recoverTrainingQueue(userId);
  const queued = readPendingTrainingWrites(userId, storage);
  let synced = 0;
  for (const item of queued) {
    if (purgedUsers.has(userId) && durable) break;
    if (item.status === "failed" || item.status === "conflict") continue;
    if (durable) await recoverTrainingQueue(userId);
    const stillPending = readPendingTrainingWrites(userId, storage).find(
      (row) => row.dedupeKey === item.dedupeKey,
    );
    if (
      stillPending?.operationId !== item.operationId ||
      JSON.stringify(stillPending?.payload) !== JSON.stringify(item.payload)
    )
      continue;
    let saved = false,
      failure: unknown;
    try {
      saved = await persist(item);
    } catch (error) {
      failure = error;
    }
    if (saved) {
      synced += 1;
      if (durable) {
        try {
          await acknowledgeDurableWrite(userId, item.dedupeKey, item);
        } catch {
          /* Stable operation ID makes an unacknowledged replay safe. */
        }
      } else acknowledgeTrainingWrite(userId, item.dedupeKey, item, storage);
    } else if (failure && !isRetryableWriteError(failure)) {
      const row = failure as { code?: string; message?: string };
      const status = row.code === "40001" ? "conflict" : "failed";
      const message =
        status === "conflict"
          ? "Ten wynik został zmieniony na innym urządzeniu. Zachowano kopię do odzyskania."
          : "Serwer odrzucił zapis. Zachowano kopię do odzyskania.";
      let markedDurably = false;
      if (durable) {
        try {
          const envelope = await updateDurableTrainingValue<QueueEnvelope>(
            userId,
            (current) =>
              current && {
                ...current,
                items: current.items.map((existing) =>
                  existing.operationId === item.operationId
                    ? { ...existing, status, error: message }
                    : existing,
                ),
              },
          );
          if (envelope) {
            durableSnapshots.set(userId, envelope);
            markedDurably = true;
          }
        } catch {
          // IndexedDB can exist while access is denied. Preserve the fallback's failure state.
        }
      }
      if (!markedDurably && storage)
        writeQueue(
          userId,
          readPendingTrainingWrites(userId, storage).map((existing) =>
            existing.operationId === item.operationId
              ? { ...existing, status, error: message }
              : existing,
          ),
          storage,
        );
    }
  }
  changed(userId);
  return { synced, remaining: readPendingTrainingWrites(userId, storage).length };
}

async function acknowledgeDurableWrite(
  userId: string,
  dedupeKey: string,
  expected: StoredTrainingWrite | undefined,
) {
  if (!expected || purgedUsers.has(userId)) return;
  try {
    const envelope = await updateDurableTrainingValue<QueueEnvelope>(
      userId,
      (current) =>
        current && {
          ...current,
          items: current.items.filter(
            (row) => row.dedupeKey !== dedupeKey || row.operationId !== expected.operationId,
          ),
        },
    );
    if (envelope && !purgedUsers.has(userId)) durableSnapshots.set(userId, envelope);
  } finally {
    // A denied IndexedDB must not leave a confirmed localStorage write pending forever.
    acknowledgeTrainingWrite(userId, dedupeKey, expected);
    changed(userId);
  }
}

/** Remove only obsolete versions after a confirmed foreground save. */
export function acknowledgeTrainingWrite(
  userId: string,
  dedupeKey: string,
  expected: StoredTrainingWrite | undefined,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage || !storage.getItem(queueKey(userId))) return;
  try {
    writeQueue(
      userId,
      parseEnvelope(storage.getItem(queueKey(userId)), userId).items.filter(
        (row) => row.dedupeKey !== dedupeKey || JSON.stringify(row) !== JSON.stringify(expected),
      ),
      storage,
    );
  } catch {
    /* Server-side ordering still prevents stale replay. */
  }
}

export function withAcknowledgedTrainingWrite<T extends { error: unknown }>(
  userId: string,
  dedupeKey: string,
  request: (previous?: StoredTrainingWrite) => PromiseLike<T>,
): Promise<T> {
  return withTrainingWriteLock(userId, async () => {
    await recoverTrainingQueue(userId);
    const previous = readPendingTrainingWrites(userId).find((row) => row.dedupeKey === dedupeKey);
    const result = await request(previous);
    if (!result.error) {
      if (typeof indexedDB !== "undefined") {
        try {
          await acknowledgeDurableWrite(userId, dedupeKey, previous);
        } catch {
          /* The server already confirmed the result. */
        }
      } else acknowledgeTrainingWrite(userId, dedupeKey, previous);
    }
    return result;
  });
}

const pendingLocks = new Map<string, Promise<unknown>>();
/** Serialize foreground and background writes, also across tabs when Web Locks is available. */
export async function withTrainingWriteLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(`ballwise-training:${userId}`, work);
  const previous = pendingLocks.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  pendingLocks.set(userId, next);
  try {
    return await next;
  } finally {
    if (pendingLocks.get(userId) === next) pendingLocks.delete(userId);
  }
}

/** Consent revocation must also remove sensitive fields from results not sent yet. */
export async function redactTrainingQueueHealthData(userId: string): Promise<void> {
  await recoverTrainingQueue(userId);
  const redact = (row: StoredTrainingWrite): StoredTrainingWrite =>
    row.kind === "session_log"
      ? { ...row, payload: { ...row.payload, notes: "" }, operationId: crypto.randomUUID() }
      : row;
  try {
    const value = await updateDurableTrainingValue<QueueEnvelope>(
      userId,
      (current) =>
        current && { ...current, recoveryRaw: undefined, items: current.items.map(redact) },
    );
    if (value) durableSnapshots.set(userId, value);
  } catch {
    /* localStorage fallback below */
  }
  const storage = browserStorage();
  if (storage?.getItem(queueKey(userId))) {
    const envelope = parseEnvelope(storage.getItem(queueKey(userId)), userId);
    // Unreadable legacy bytes can contain revoked health information and cannot be safely replayed.
    if (envelope.recoveryRaw) storage.removeItem(queueKey(userId));
    else writeQueue(userId, envelope.items.map(redact), storage);
  }
  changed(userId);
}

async function markWriteFailure(
  userId: string,
  operationId: string,
  failure: unknown,
): Promise<void> {
  if (isRetryableWriteError(failure) || purgedUsers.has(userId)) return;
  const conflict = (failure as { code?: string } | null)?.code === "40001";
  const status = conflict ? "conflict" : "failed";
  const error = conflict
    ? "Wynik ma nowszą wersję na serwerze. Zachowano lokalną kopię."
    : "Serwer odrzucił zapis. Zachowano lokalną kopię.";
  try {
    const envelope = await updateDurableTrainingValue<QueueEnvelope>(
      userId,
      (current) =>
        current && {
          ...current,
          items: current.items.map((row) =>
            row.operationId === operationId ? { ...row, status, error } : row,
          ),
        },
    );
    if (envelope) durableSnapshots.set(userId, envelope);
  } catch {
    const storage = browserStorage();
    if (storage) {
      const envelope = parseEnvelope(storage.getItem(queueKey(userId)), userId);
      if (!envelope.recoveryRaw)
        writeQueue(
          userId,
          envelope.items.map((row) =>
            row.operationId === operationId ? { ...row, status, error } : row,
          ),
          storage,
        );
    }
  }
  changed(userId);
}

export async function enqueueRejectedTrainingWrite(
  userId: string,
  write: PendingTrainingWrite,
  failure: unknown,
): Promise<boolean> {
  const operationId = write.operationId ?? crypto.randomUUID();
  const stored = await enqueueDurableTrainingWrite(userId, { ...write, operationId });
  if (stored) await markWriteFailure(userId, operationId, failure);
  return stored;
}

/** Commit the user's intent locally before touching the network; force-quit is recoverable. */
export async function withDurableTrainingWrite<T extends { error: unknown }>(
  userId: string,
  write: PendingTrainingWrite,
  request: (entry: StoredTrainingWrite) => PromiseLike<T>,
): Promise<T> {
  const operationId = write.operationId ?? crypto.randomUUID();
  if (!(await enqueueDurableTrainingWrite(userId, { ...write, operationId })))
    throw new Error(
      "Nie można zachować wyniku na telefonie. Zrób eksport oczekujących wyników i zwolnij pamięć.",
    );
  return withTrainingWriteLock(userId, async () => {
    const entry = readPendingTrainingWrites(userId).find((row) => row.operationId === operationId);
    if (!entry) throw new Error("Ten wynik zastąpiła nowsza edycja. Zachowano nowszą wersję.");
    // Do not let an expired Auth token turn a genuinely offline save into a permanent RLS error.
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      return { error: { message: "Network offline" } } as T;
    let result: T;
    try {
      result = await request(entry);
    } catch (failure) {
      await markWriteFailure(userId, operationId, failure);
      // Supabase normally returns errors; normalize thrown transport errors to the same contract.
      return { error: failure } as T;
    }
    if (!result.error && "data" in result && result.data === null)
      result = {
        ...result,
        error: { code: "P0002", message: "Serwer nie potwierdził zapisanego wyniku." },
      } as T;
    if (result.error) await markWriteFailure(userId, operationId, result.error);
    else if (typeof indexedDB !== "undefined") {
      try {
        await acknowledgeDurableWrite(userId, entry.dedupeKey, entry);
      } catch {
        /* Confirmed remotely; keep local receipt for safe replay. */
      }
    } else acknowledgeTrainingWrite(userId, entry.dedupeKey, entry);
    return result;
  });
}

/** A user can resolve a reviewed conflict; a newer local edit always wins over this old dialog. */
export async function resolveTrainingQueueConflict(
  userId: string,
  operationId: string,
  choice: "server" | "local",
  serverVersion = 0,
): Promise<boolean> {
  if (!Number.isSafeInteger(serverVersion) || serverVersion < 0 || purgedUsers.has(userId))
    return false;
  await recoverTrainingQueue(userId);
  let resolved = false;
  const resolve = (current: QueueEnvelope | undefined): QueueEnvelope | undefined => {
    if (!current) return current;
    const selected = current.items.find(
      (row) =>
        row.operationId === operationId && (row.status === "conflict" || row.status === "failed"),
    );
    if (!selected || (choice === "local" && selected.kind === "running_progression"))
      return current;
    resolved = true;
    return {
      ...current,
      items:
        choice === "server"
          ? current.items.filter((row) => row !== selected)
          : current.items.map((row) =>
              row !== selected
                ? row
                : {
                    ...row,
                    expectedVersion: serverVersion,
                    operationId: crypto.randomUUID(),
                    predecessors: [],
                    status: "pending",
                    error: undefined,
                  },
            ),
    };
  };
  try {
    const envelope = await updateDurableTrainingValue<QueueEnvelope>(userId, resolve);
    if (envelope) durableSnapshots.set(userId, envelope);
  } catch {
    // Use the same reviewed operation/version check when IndexedDB is unavailable.
    resolved = false;
    await withTrainingWriteLock(userId, async () => {
      if (purgedUsers.has(userId)) return;
      const storage = browserStorage();
      if (!storage) return;
      const current = parseEnvelope(storage.getItem(queueKey(userId)), userId);
      if (current.recoveryRaw) return;
      const next = resolve(current);
      if (resolved && next) writeQueue(userId, next.items, storage);
    });
  }
  if (resolved) {
    changed(userId);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("ballwise:training-synced"));
  }
  return resolved;
}
