import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

const QUEUE_VERSION = 1;
const MAX_ITEMS = 120;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

export type PendingTrainingWrite =
  | SessionLogWrite
  | SetLogWrite
  | RunningActivityWrite
  | ProgressionWrite;

type StoredTrainingWrite = PendingTrainingWrite & { queuedAt: number };

interface QueueEnvelope {
  version: number;
  items: StoredTrainingWrite[];
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
  return typeof window === "undefined" ? null : window.localStorage;
}

export function isRetryableWriteError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error || typeof error !== "object") return false;
  const row = error as Record<string, unknown>;
  const status = Number(row.status ?? row.statusCode ?? row.code);
  if ([408, 425, 429].includes(status) || status >= 500) return true;
  const message = `${String(row.message ?? "")} ${String(row.details ?? "")}`.toLowerCase();
  return /failed to fetch|network|timeout|timed out|connection|load failed|fetch|temporar/.test(
    message,
  );
}

export function readPendingTrainingWrites(
  userId: string,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): StoredTrainingWrite[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<QueueEnvelope>;
    if (parsed.version !== QUEUE_VERSION || !Array.isArray(parsed.items)) {
      storage.removeItem(queueKey(userId));
      return [];
    }
    const fresh = parsed.items.filter(
      (item): item is StoredTrainingWrite =>
        Boolean(item?.kind && item?.dedupeKey && item?.payload) &&
        typeof item.queuedAt === "number" &&
        now - item.queuedAt <= MAX_AGE_MS,
    );
    if (fresh.length !== parsed.items.length) writeQueue(userId, fresh, storage);
    return fresh;
  } catch {
    storage.removeItem(queueKey(userId));
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
    const current = readPendingTrainingWrites(userId, storage, now).filter(
      (item) => item.dedupeKey !== write.dedupeKey,
    );
    current.push({ ...write, queuedAt: now } as StoredTrainingWrite);
    writeQueue(userId, current.slice(-MAX_ITEMS), storage);
    return true;
  } catch {
    return false;
  }
}

export async function flushPendingTrainingWrites(
  userId: string,
  persist: (write: PendingTrainingWrite) => Promise<boolean>,
  storage: StorageLike | null = browserStorage(),
): Promise<{ synced: number; remaining: number }> {
  if (!storage) return { synced: 0, remaining: 0 };
  const queued = readPendingTrainingWrites(userId, storage);
  const remaining: StoredTrainingWrite[] = [];
  let synced = 0;
  for (const item of queued) {
    try {
      if (await persist(item)) synced += 1;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(userId, remaining, storage);
  return { synced, remaining: remaining.length };
}

export function clearPendingTrainingWrites(
  userId: string,
  storage: StorageLike | null = browserStorage(),
): void {
  storage?.removeItem(queueKey(userId));
}
