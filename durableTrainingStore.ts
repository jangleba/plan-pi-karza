/** IndexedDB transactions are the durable source for unsent training writes. */
const DATABASE = "ballwise-training-v2";
const STORE = "users";
let opening: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Local database blocked by another window"));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        opening = null;
      };
      resolve(database);
    };
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening!;
}

export async function readDurableTrainingValue<T>(userId: string): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(userId);
    transaction.oncomplete = () => resolve(request.result as T | undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Local read cancelled"));
  });
}

/** One read/modify/write transaction prevents two tabs from dropping each other's results. */
export async function updateDurableTrainingValue<T>(
  userId: string,
  update: (current: T | undefined) => T | undefined,
): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    const objectStore = transaction.objectStore(STORE);
    const request = objectStore.get(userId);
    let result: T | undefined;
    request.onsuccess = () => {
      try {
        result = update(request.result as T | undefined);
        if (result === undefined) objectStore.delete(userId);
        else objectStore.put(result, userId);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Local write cancelled"));
  });
}
