import { readFuelData, fuelStorageKey } from "@/lib/fuel/experience";
import { findRecipe } from "@/lib/fuel/catalog";
import {
  loadJourneyDraft,
  loadJourneyHistory,
  journeyDraftKey,
  journeyHistoryKey,
} from "../football-iq-match/journeyHistory";
import { loadBrowserResults } from "../browser-lab/storage";
import {
  loadReactiveCustomSets,
  loadReactiveResults,
  loadReactiveSession,
} from "@/lib/reactive-training/storage";

export const MODULES = ["fuel", "iq", "lab", "reactive"] as const;
export type BackupModule = (typeof MODULES)[number];
export const MODULE_LABELS: Record<BackupModule, string> = {
  fuel: "Fuel",
  iq: "IQ",
  lab: "Lab",
  reactive: "Reakcja",
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface ModuleSnapshot {
  schema: "ballwise.module-backup.v1";
  module: BackupModule;
  createdAt: string;
  includesUserText: boolean;
  omitted: number;
  records: Record<string, unknown>;
  deleted: Record<string, string[]>;
}
export interface BackupState {
  known: Record<string, string[]>;
  deleted: Record<string, string[]>;
}
export const backupStateKey = (owner: string, module: BackupModule) =>
  `ballwise:module-backup:state:v1:${owner}:${module}`;
export const deviceStorageKey = (owner: string) => `ballwise:module-backup:device:v1:${owner}`;
export function moduleKeys(module: BackupModule, owner: string): Record<string, string> {
  if (!owner) throw new Error("Zaloguj się, aby korzystać z kopii.");
  switch (module) {
    case "fuel":
      return { data: fuelStorageKey(owner) };
    case "iq":
      return { history: journeyHistoryKey(owner), draft: journeyDraftKey(owner) };
    case "lab":
      return { history: `ballwise.browser-lab.v1:${encodeURIComponent(owner)}` };
    case "reactive": {
      const key = `ballwise:reactive:v1:${owner}`;
      return { sets: key, history: `${key}:history`, session: `${key}:session` };
    }
  }
}
const pick = (value: unknown, fields: string[]) =>
  Object.fromEntries(
    fields
      .filter((field) => value && typeof value === "object" && field in value)
      .map((field) => [field, (value as Record<string, unknown>)[field]]),
  );
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function readRecords(
  module: BackupModule,
  owner: string,
  storage: Pick<Storage, "getItem">,
  now: number,
): Record<string, unknown> {
  const readonlyStore = {
    getItem: (key: string) => storage.getItem(key),
    setItem: () => {
      throw new Error("Odczyt kopii nie może zapisywać danych.");
    },
    removeItem: () => {
      throw new Error("Odczyt kopii nie może usuwać danych.");
    },
  };
  const keys = moduleKeys(module, owner);
  const present = (slot: string, read: () => unknown) =>
    storage.getItem(keys[slot]) === null ? null : read();
  if (module === "iq")
    return {
      history: present("history", () =>
        loadJourneyHistory(owner, storage).map((row) => ({
          ...pick(row, [
            "version",
            "bankVersion",
            "id",
            "scenarioId",
            "role",
            "mode",
            "createdAt",
            "outcome",
            "verdict",
          ]),
          choices: row.choices.map((choice) => pick(choice, ["id", "seconds"])),
        })),
      ),
      draft: present("draft", () => {
        const draft = loadJourneyDraft(owner, storage);
        return draft
          ? {
              ...pick(draft, ["version", "bankVersion", "id", "scenarioId", "mode"]),
              choices: draft.choices.map((choice) => pick(choice, ["id", "seconds"])),
            }
          : null;
      }),
    };
  if (module === "lab")
    return { history: present("history", () => loadBrowserResults(owner, readonlyStore)) };
  if (module === "fuel")
    return {
      data: present("data", () => {
        const data = readFuelData(storage, owner, now);
        return {
          ...data,
          entries: data.entries.map((entry) => ({
            ...pick(entry, [
              "id",
              "recipeId",
              "title",
              "contextKey",
              "status",
              "createdAt",
              "eatenAt",
              "fraction",
              "feedback",
            ]),
            lines: entry.lines.map((line) => pick(line, ["foodId", "grams"])),
            ...(entry.product
              ? {
                  product: {
                    ...pick(entry.product, ["portion", "unit"]),
                    value: pick(entry.product.value, [
                      "barcode",
                      "name",
                      "brand",
                      "ingredientsText",
                      "categories",
                      "imageUrl",
                      "source",
                      "nutritionUnit",
                      "allergens",
                      "nutriments",
                    ]),
                  },
                }
              : {}),
          })),
        };
      }),
    };
  const key = `ballwise:reactive:v1:${owner}`;
  const cleanSession = (row: unknown) =>
    row
      ? {
          ...pick(row, ["version", "id", "phase"]),
          settings: pick((row as Record<string, unknown>).settings, [
            "mode",
            "level",
            "intervalSec",
            "randomTiming",
            "durationMin",
            "vibration",
            "flashDurationMs",
            "activeDirections",
            "activeColors",
            "sequenceLength",
            "customSetId",
          ]),
          stats: pick((row as Record<string, unknown>).stats, [
            "startedAt",
            "endedAt",
            "elapsedSec",
            "cueCount",
            "decisionChanges",
            "directionCounts",
            "colorCounts",
            "mode",
            "intervalSec",
            "randomTiming",
          ]),
        }
      : null;
  return {
    history: present("history", () => loadReactiveResults(key, readonlyStore).map(cleanSession)),
    session: present("session", () => cleanSession(loadReactiveSession(key, readonlyStore))),
    sets: present("sets", () =>
      loadReactiveCustomSets(key, readonlyStore).map((set) => ({
        ...pick(set, ["id", "name", "createdAt"]),
        actions: set.actions.map((action) => pick(action, ["id", "label", "direction", "color"])),
      })),
    ),
  };
}
const rowIds = (records: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(records).map(([slot, value]) => {
      const list = Array.isArray(value)
        ? value
        : slot === "data" && value
          ? ((value as { entries?: unknown[] }).entries ?? [])
          : [];
      return [slot, list.map((row) => (row as { id: string }).id)];
    }),
  );
export function readBackupState(
  owner: string,
  module: BackupModule,
  storage: Pick<Storage, "getItem">,
): BackupState {
  const raw = storage.getItem(backupStateKey(owner, module));
  if (!raw) return { known: {}, deleted: {} };
  const value = JSON.parse(raw) as BackupState;
  if (
    !value ||
    !value.known ||
    !value.deleted ||
    ![...Object.values(value.known), ...Object.values(value.deleted)].every(
      (ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"),
    )
  )
    throw new Error("Zapis stanu kopii jest uszkodzony. Zachowano oryginał.");
  return value;
}
export function createModuleSnapshot(
  module: BackupModule,
  owner: string,
  storage: Store = localStorage,
  includeUserText = false,
  now = Date.now(),
): ModuleSnapshot {
  const records = copy(readRecords(module, owner, storage, now));
  const actualIds = rowIds(records);
  let omitted = 0;
  if (!includeUserText) {
    if (module === "lab" && Array.isArray(records.history))
      records.history = records.history.map((row) => ({
        ...row,
        notes: "",
        sourceName: "nagranie",
      }));
    if (module === "reactive" && Array.isArray(records.sets)) {
      omitted += records.sets.length;
      records.sets = null;
    }
    if (module === "fuel" && records.data) {
      const data = records.data as { entries: Record<string, unknown>[] };
      const before = data.entries.length;
      data.entries = data.entries
        .filter((entry) => !entry.product)
        .map((entry) => ({
          ...entry,
          title: findRecipe(String(entry.recipeId))?.title ?? "Posiłek",
        }));
      omitted += before - data.entries.length;
    }
  }
  const state = readBackupState(owner, module, storage);
  const ids = actualIds;
  const deleted = Object.fromEntries(
    Object.keys(records).map((slot) => [
      slot,
      [
        ...new Set([
          ...(state.deleted[slot] ?? []),
          ...(state.known[slot] ?? []).filter((id) => !(ids[slot] ?? []).includes(id)),
        ]),
      ].slice(-1000),
    ]),
  );
  return {
    schema: "ballwise.module-backup.v1",
    module,
    createdAt: new Date(now).toISOString(),
    includesUserText: includeUserText,
    omitted,
    records,
    deleted,
  };
}
export function validateModuleSnapshot(
  value: unknown,
  expected: BackupModule,
  owner: string,
  now = Date.now(),
): ModuleSnapshot {
  const row = value as ModuleSnapshot;
  if (
    !row ||
    row.schema !== "ballwise.module-backup.v1" ||
    row.module !== expected ||
    !row.records ||
    typeof row.records !== "object" ||
    Array.isArray(row.records) ||
    typeof row.includesUserText !== "boolean" ||
    !Number.isFinite(Date.parse(row.createdAt)) ||
    !row.deleted ||
    typeof row.deleted !== "object"
  )
    throw new Error("Nieprawidłowa kopia modułu.");
  if (new TextEncoder().encode(JSON.stringify(row)).length > 1_000_000)
    throw new Error("Kopia przekracza 1 MB.");
  const keys = moduleKeys(expected, owner);
  if (
    Object.keys(row.records).some((slot) => !Object.hasOwn(keys, slot)) ||
    Object.values(row.deleted).some(
      (ids) =>
        !Array.isArray(ids) || ids.length > 1000 || !ids.every((id) => typeof id === "string"),
    )
  )
    throw new Error("Kopia zawiera nieobsługiwane dane.");
  const fake = {
    getItem: (key: string) => {
      const slot = Object.entries(keys).find(([, expectedKey]) => expectedKey === key)?.[0];
      const value = slot ? row.records[slot] : null;
      return value == null ? null : JSON.stringify(value);
    },
  };
  const cleaned = readRecords(expected, owner, fake, now);
  return { ...row, records: cleaned };
}
export interface RestorePreview {
  module: BackupModule;
  expected: Record<string, string | null>;
  writes: Record<string, string | null>;
  conflicts: string[];
  added: number;
  skippedDeleted: number;
}
export function previewModuleRestore(
  snapshot: ModuleSnapshot,
  owner: string,
  storage: Store = localStorage,
  now = Date.now(),
): RestorePreview {
  const incoming = validateModuleSnapshot(snapshot, snapshot.module, owner, now);
  const local = readRecords(snapshot.module, owner, storage, now);
  const state = readBackupState(owner, snapshot.module, storage);
  const localIds = rowIds(local);
  const keys = moduleKeys(snapshot.module, owner);
  const preview: RestorePreview = {
    module: snapshot.module,
    expected: {},
    writes: {},
    conflicts: [],
    added: 0,
    skippedDeleted: 0,
  };
  const mergeList = (slot: string, previous: unknown[], next: unknown[]) => {
    const merged = copy(previous) as Record<string, unknown>[];
    for (const item of next as Record<string, unknown>[]) {
      const id = String(item.id);
      if (
        [
          ...(state.deleted[slot] ?? []),
          ...(state.known[slot] ?? []).filter((known) => !(localIds[slot] ?? []).includes(known)),
          ...(incoming.deleted[slot] ?? []),
        ].includes(id)
      ) {
        preview.skippedDeleted++;
        continue;
      }
      const old = merged.find((row) => row.id === item.id);
      if (!old) {
        merged.push(item);
        preview.added++;
      } else if (JSON.stringify(old) !== JSON.stringify(item))
        preview.conflicts.push(`${slot}: ${id}`);
    }
    return merged;
  };
  for (const [slot, key] of Object.entries(keys)) {
    const before = local[slot];
    const next = incoming.records[slot];
    preview.expected[key] = storage.getItem(key);
    let result = before;
    if (next != null) {
      if (Array.isArray(next)) result = mergeList(slot, Array.isArray(before) ? before : [], next);
      else if (before == null) {
        result = next;
        preview.added++;
      } else if (slot === "data") {
        const current = before as Record<string, unknown>;
        const remote = next as Record<string, unknown>;
        result = {
          ...current,
          entries: mergeList(slot, current.entries as unknown[], remote.entries as unknown[]),
        };
        if (
          JSON.stringify({ ...current, entries: [] }) !== JSON.stringify({ ...remote, entries: [] })
        )
          preview.conflicts.push("ustawienia Fuel");
      } else if (JSON.stringify(before) !== JSON.stringify(next)) preview.conflicts.push(slot);
    }
    preview.writes[key] = result == null ? null : JSON.stringify(result);
  }
  // Re-run the real module validators before any write, including local capacity limits.
  const mergedRecords = readRecords(
    snapshot.module,
    owner,
    { getItem: (key) => preview.writes[key] ?? null },
    now,
  );
  const stateKey = backupStateKey(owner, snapshot.module);
  preview.expected[stateKey] = storage.getItem(stateKey);
  const deleted = Object.fromEntries(
    Object.keys(keys).map((slot) => [
      slot,
      [
        ...new Set([
          ...(state.deleted[slot] ?? []),
          ...(state.known[slot] ?? []).filter((known) => !(localIds[slot] ?? []).includes(known)),
          ...(incoming.deleted[slot] ?? []),
        ]),
      ],
    ]),
  );
  if (Object.values(deleted).some((ids) => ids.length > 1000))
    throw new Error(
      "Zapis usunięć przekracza pojemność kopii. Zachowaj pliki kopii przed dalszym przywracaniem.",
    );
  preview.writes[stateKey] = JSON.stringify({ known: rowIds(mergedRecords), deleted });
  return preview;
}
export function applyModuleRestore(
  preview: RestorePreview,
  owner: string,
  storage: Store = localStorage,
) {
  const moduleAllowed = Object.values(moduleKeys(preview.module, owner));
  const allowed = [...moduleAllowed, backupStateKey(owner, preview.module)];
  if (Object.keys(preview.writes).some((key) => !Object.hasOwn(preview.expected, key)))
    throw new Error("Nieprawidłowy podgląd przywracania.");
  for (const [key, expected] of Object.entries(preview.expected)) {
    if (!allowed.includes(key) || storage.getItem(key) !== expected)
      throw new Error("Dane zmieniły się. Przygotuj przywracanie ponownie.");
  }
  const applied: string[] = [];
  try {
    for (const [key, value] of Object.entries(preview.writes)) {
      if (!allowed.includes(key)) throw new Error("Nieobsługiwany klucz kopii.");
      if (value === preview.expected[key]) continue;
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      applied.push(key);
    }
  } catch (error) {
    for (const key of applied.reverse()) {
      try {
        const old = preview.expected[key];
        if (old === null) storage.removeItem(key);
        else storage.setItem(key, old);
      } catch {
        throw new Error(
          "Przywracanie częściowo zapisane; nie udało się cofnąć zapisu. Zachowaj obie kopie i sprawdź historię.",
        );
      }
    }
    throw error;
  }
  if (typeof window !== "undefined")
    for (const key of applied.filter((key) => moduleAllowed.includes(key)))
      window.dispatchEvent(
        new CustomEvent("ballwise:module-data-applied", {
          detail: { userId: owner, module: preview.module, key, value: preview.writes[key] },
        }),
      );
}
export function rememberModuleSnapshot(
  owner: string,
  snapshot: ModuleSnapshot,
  storage: Store = localStorage,
) {
  storage.setItem(
    backupStateKey(owner, snapshot.module),
    JSON.stringify({ known: rowIds(snapshot.records), deleted: snapshot.deleted }),
  );
}
