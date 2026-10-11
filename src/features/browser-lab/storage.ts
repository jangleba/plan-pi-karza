import { sameTrial, validatedResult, type BrowserResult } from "./results";

export const MAX_STORED_RESULTS = 300;
export class CorruptHistoryError extends Error {}
const keyFor = (owner: string) => `ballwise.browser-lab.v1:${encodeURIComponent(owner)}`;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function loadBrowserResults(owner: string, store: Store = localStorage) {
  if (!owner) throw new Error("Brakuje konta dla historii pomiarów.");
  const raw = store.getItem(keyFor(owner));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_STORED_RESULTS) throw new Error();
    const rows = parsed.map(validatedResult);
    if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error();
    return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  } catch {
    throw new CorruptHistoryError(
      "Nie można odczytać lokalnej historii. Nie nadpisano jej. Możesz pobrać surową kopię w narzędziach Labu i przywrócić prawidłową kopię.",
    );
  }
}

export function storeBrowserResults(
  owner: string,
  rows: readonly BrowserResult[],
  store: Store = localStorage,
) {
  if (!owner) throw new Error("Brakuje konta dla historii pomiarów.");
  if (rows.length > MAX_STORED_RESULTS)
    throw new Error(
      "Historia ma już 300 prób. Pobierz kopię i usuń wybrane starsze próby, aby zapisać nowe.",
    );
  const validated = rows.map(validatedResult);
  if (new Set(validated.map((r) => r.id)).size !== validated.length)
    throw new Error("Powtórzone identyfikatory prób.");
  try {
    store.setItem(keyFor(owner), JSON.stringify(validated));
  } catch {
    throw new Error(
      "Safari nie zapisało historii. Pobierz wynik przed zamknięciem. Sprawdź wolne miejsce i użyj zwykłego okna przeglądarki.",
    );
  }
  return validated;
}

export function appendBrowserResult(
  owner: string,
  result: BrowserResult,
  store: Store = localStorage,
) {
  const rows = loadBrowserResults(owner, store);
  const checked = validatedResult(result);
  if (rows.some((r) => sameTrial(r, checked)))
    throw new Error("Ta sama próba z tych samych klatek jest już zapisana w historii.");
  return storeBrowserResults(owner, [checked, ...rows], store);
}
export function deleteBrowserResult(owner: string, id: string, store: Store = localStorage) {
  return storeBrowserResults(
    owner,
    loadBrowserResults(owner, store).filter((r) => r.id !== id),
    store,
  );
}
export const rawBrowserHistory = (owner: string, store: Store = localStorage) =>
  store.getItem(keyFor(owner)) ?? "[]";

export function createHistoryBackup(rows: readonly BrowserResult[]) {
  return {
    schema: "ballwise.browser-lab.backup.v1",
    exportedAt: new Date().toISOString(),
    results: rows.map(validatedResult),
  };
}
export function backupResults(input: unknown) {
  if (
    !input ||
    typeof input !== "object" ||
    !("schema" in input) ||
    input.schema !== "ballwise.browser-lab.backup.v1" ||
    !("results" in input) ||
    !Array.isArray(input.results) ||
    input.results.length > MAX_STORED_RESULTS
  )
    throw new Error("To nie jest poprawna kopia historii BallWise Lab.");
  const incoming = input.results.map(validatedResult);
  if (new Set(incoming.map((row) => row.id)).size !== incoming.length)
    throw new Error("Kopia zawiera powtórzone identyfikatory prób.");
  return incoming;
}
export function restoreHistoryBackup(owner: string, input: unknown, store: Store = localStorage) {
  const incoming = backupResults(input);
  const current = loadBrowserResults(owner, store);
  const merged = [...current];
  let added = 0;
  for (const result of incoming) {
    if (merged.some((r) => r.id === result.id || sameTrial(r, result))) continue;
    merged.push(result);
    added++;
  }
  const rows = storeBrowserResults(
    owner,
    merged.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    store,
  );
  return { rows, added };
}

/** Called only after an explicit recovery confirmation and download of the raw history. */
export function replaceCorruptedHistory(
  owner: string,
  input: unknown,
  expectedRaw: string,
  store: Store = localStorage,
) {
  const incoming = backupResults(input);
  if (rawBrowserHistory(owner, store) !== expectedRaw)
    throw new Error("Historia zmieniła się. Odczytaj ją ponownie przed odzyskiwaniem.");
  let corrupt = false;
  try {
    loadBrowserResults(owner, store);
  } catch (reason) {
    if (reason instanceof CorruptHistoryError) corrupt = true;
    else throw reason;
  }
  if (!corrupt)
    throw new Error(
      "Historia jest poprawna. Użyj zwykłego przywracania, które zachowuje wcześniejsze próby.",
    );
  return storeBrowserResults(owner, incoming, store);
}
