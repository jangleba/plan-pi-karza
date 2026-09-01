/**
 * Lokalny sejf bieżącego filmu Vision Lab.
 *
 * `File` zapisany wyłącznie w module znika po przeładowaniu podglądu/HMR i
 * wtedy retry kończyło się NO_VIDEO_SOURCE. IndexedDB przechowuje Blob na tym
 * samym urządzeniu tylko na czas rozpoczętej analizy. Film nie jest wysyłany
 * do Supabase ani do żadnego zewnętrznego API.
 */

const DB_NAME = "ballwise-vision-session";
const DB_VERSION = 1;
const STORE_NAME = "videos";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const OPEN_TIMEOUT_MS = 5_000;

interface StoredVisionSessionVideo {
  testId: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  storedAt: number;
  blob: Blob;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("INDEXED_DB_REQUEST_FAILED"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_FAILED"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_ABORTED"));
  });
}

function openSessionDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error("INDEXED_DB_UNAVAILABLE"));
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("INDEXED_DB_OPEN_TIMEOUT"));
    }, OPEN_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "testId" });
      }
    };
    request.onsuccess = () => finish(() => resolve(request.result));
    request.onerror = () =>
      finish(() => reject(request.error ?? new Error("INDEXED_DB_OPEN_FAILED")));
    request.onblocked = () => finish(() => reject(new Error("INDEXED_DB_OPEN_BLOCKED")));
  });
}

/** Zapisuje film lokalnie. `false` oznacza fallback do pamięci bieżącej karty. */
export async function saveVisionSessionVideo(testId: string, file: File): Promise<boolean> {
  if (!testId || !(file instanceof Blob) || file.size <= 0) return false;
  let db: IDBDatabase | null = null;
  try {
    db = await openSessionDatabase();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const record: StoredVisionSessionVideo = {
      testId,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      storedAt: Date.now(),
      blob: file,
    };
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

/** Odtwarza film po przeładowaniu podglądu, o ile lokalna sesja nie wygasła. */
export async function loadVisionSessionVideo(testId: string): Promise<File | null> {
  if (!testId || !hasIndexedDb()) return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openSessionDatabase();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const record = (await requestValue(transaction.objectStore(STORE_NAME).get(testId))) as
      StoredVisionSessionVideo | undefined;
    await transactionDone(transaction);
    if (!record) return null;
    const expired = Date.now() - record.storedAt > SESSION_TTL_MS;
    const invalid = !(record.blob instanceof Blob) || record.blob.size <= 0;
    const inconsistentSize = record.size !== record.blob.size;
    if (expired || invalid || inconsistentSize) {
      void clearVisionSessionVideo(testId);
      return null;
    }
    return new File([record.blob], record.name || "vision-video", {
      type: record.type || record.blob.type,
      lastModified: record.lastModified || record.storedAt,
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** Usuwa lokalną kopię po wyniku albo świadomym wyborze innego filmu. */
export async function clearVisionSessionVideo(testId: string): Promise<void> {
  if (!testId || !hasIndexedDb()) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openSessionDatabase();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(testId);
    await transactionDone(transaction);
  } catch {
    // Brak możliwości sprzątnięcia lokalnego cache nie może blokować aplikacji.
  } finally {
    db?.close();
  }
}

/** Usuwa wszystkie lokalne filmy Vision Lab, np. przy żądaniu usunięcia konta. */
export async function clearAllVisionSessionVideos(): Promise<void> {
  if (!hasIndexedDb()) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openSessionDatabase();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  } catch {
    // Czyszczenie pamięci przeglądarki może być niedostępne w trybie prywatnym.
  } finally {
    db?.close();
  }
}
