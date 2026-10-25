import { normalizeFuelText, type FuelLoadBand, type FuelMoment } from "./assistant";
import type { SessionDay, SessionCompletion, Profile } from "../loadwise/types";
import { sessionKindFrom } from "./planAdapter";
import type { SessionKind } from "./types";
import type { StoreProduct } from "./storeCheck";

export type FuelPhase = "before" | "training" | "after" | "ordinary";
export interface FuelContext {
  key: string;
  date: string;
  kind: SessionKind;
  title: string;
  durationMin: number | null;
  load: FuelLoadBand;
  fromPlan: boolean;
  completed?: boolean;
  scheduledStartTime?: string | null;
  endedAt?: number | null;
}
export interface FuelTiming {
  startsAt: number | null;
  phase: FuelPhase;
  presetMin?: number;
  endedAt?: number;
}
export interface FuelPreferences {
  detailed: boolean;
  diet: "all" | "vegetarian" | "vegan";
  noCook: boolean;
  quick: boolean;
  portable: boolean;
  affordable: boolean;
  favorites: string[];
  hidden: string[];
  excludedFoodIds: string[];
}
export interface MealLine {
  foodId: string;
  grams: number;
}
export interface FuelEntry {
  id: string;
  recipeId: string;
  title: string;
  lines: MealLine[];
  contextKey: string;
  status: "selected" | "eaten";
  createdAt: number;
  eatenAt: number | null;
  fraction: number;
  feedback: "comfortable" | "heavy" | null;
  product?: { value: StoreProduct; portion: number; unit: "g" | "ml" };
}
export interface FuelDeviceData {
  version: 3;
  preferences: FuelPreferences;
  timings: Record<string, FuelTiming>;
  entries: FuelEntry[];
  selection: FuelSelection | null;
}
export interface FuelSelection {
  date: string;
  contextKey: string | null;
  manualKind: SessionKind;
  manualDurationMin: number | null;
  manualLoad: FuelLoadBand;
}
export const SESSION_LABELS: Record<SessionKind, string> = {
  match: "Mecz",
  football: "Trening piłkarski",
  speed: "Sprint",
  strength: "Siła",
  endurance: "Wydolność",
  recovery: "Regeneracja",
  none: "Bez treningu",
};
export function emptyFuelData(): FuelDeviceData {
  return {
    version: 3,
    preferences: {
      detailed: false,
      diet: "all",
      noCook: false,
      quick: false,
      portable: false,
      affordable: false,
      favorites: [],
      hidden: [],
      excludedFoodIds: [],
    },
    timings: {},
    entries: [],
    selection: null,
  };
}
export function manualFuelContext(
  date: string,
  kind: SessionKind,
  durationMin: number | null,
  load: FuelLoadBand,
): FuelContext {
  return {
    key: `${date}:manual:${kind}`,
    date,
    kind,
    title: SESSION_LABELS[kind],
    durationMin: kind === "none" ? null : durationMin,
    load: kind === "none" ? "low" : load,
    fromPlan: false,
  };
}
export function planFuelContexts(
  plan: SessionDay[],
  date: string,
  completions: Record<string, SessionCompletion>,
): FuelContext[] {
  return plan
    .filter((day) => day.date === date && !day.isUnavailable)
    .flatMap((day) => {
      return [day, day.secondSession]
        .filter((s): s is SessionDay => Boolean(s))
        .flatMap((session, index) => {
          const kind = sessionKindFrom(session);
          if (kind === "none" || !session.durationMin) return [];
          return [
            {
              key: `${date}:${session.dbId ?? session.sessionId ?? "main"}:${index + 1}`,
              date,
              kind,
              title: session.title || SESSION_LABELS[kind],
              durationMin: session.durationMin,
              load: (kind === "match" || session.intensity === "wysoka"
                ? "high"
                : kind === "recovery" || session.intensity === "niska"
                  ? "low"
                  : "moderate") as FuelLoadBand,
              fromPlan: true,
              completed: Boolean(session.dbId && completions[session.dbId]?.completed),
              scheduledStartTime: session.scheduledStartTime,
              endedAt:
                session.dbId && completions[session.dbId]?.endedAt
                  ? Date.parse(completions[session.dbId].endedAt!)
                  : null,
            },
          ];
        });
    });
}
export function resolveFuelTiming(context: FuelContext, saved?: FuelTiming): FuelTiming {
  if (context.completed)
    return {
      startsAt: saved?.startsAt ?? null,
      phase: "after",
      endedAt: context.endedAt ?? saved?.endedAt,
    };
  if (saved) return saved;
  let startsAt: number | null = null;
  const clock = context.scheduledStartTime;
  if (
    context.fromPlan &&
    clock &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock) &&
    /^\d{4}-\d{2}-\d{2}$/.test(context.date)
  ) {
    const date = new Date(`${context.date}T${clock}:00`);
    if (Number.isFinite(date.getTime()) && localDate(date.getTime()) === context.date)
      startsAt = date.getTime();
  }
  return {
    startsAt,
    phase: context.kind === "none" ? "ordinary" : context.completed ? "after" : "before",
  };
}
export function minutesToFuelStart(timing: FuelTiming, now: number): number | null {
  if (timing.phase !== "before" || timing.startsAt === null) return null;
  return Math.max(0, Math.ceil((timing.startsAt - now) / 60_000));
}
export function fuelMoment(timing: FuelTiming): FuelMoment {
  return timing.phase === "after" ? "after" : timing.phase === "ordinary" ? "ordinary" : "before";
}
export function clockFuelStart(clock: string, now: number): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null;
  const date = new Date(now);
  const [hours, minutes] = clock.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  // A past clock is not silently turned into tomorrow's training.
  return date.getTime() > now ? date.getTime() : null;
}
export function contextGuidance(
  context: FuelContext,
  timing: FuelTiming,
  now: number,
): { title: string; body: string } {
  const minutes = minutesToFuelStart(timing, now);
  if (timing.phase === "training")
    return {
      title: "Trening trwa",
      body: "Przygotuj posiłek na później. Gdy skończysz, wybierz „Już po treningu”.",
    };
  if (timing.phase === "after")
    return {
      title: "Posiłek po sesji",
      body: "Wybierz zestaw z węglowodanami i białkiem. Uwzględnij też to, co już jadłeś.",
    };
  if (timing.phase === "ordinary")
    return {
      title: "Zwykły posiłek",
      body: "Dopasuj wybór do apetytu, preferencji i dostępnych produktów.",
    };
  if (minutes === null)
    return {
      title: "Za ile zaczynasz?",
      body: "Ustaw czas, żeby dopasować propozycje. Na razie pokazuję ogólne zestawy.",
    };
  if (minutes === 0)
    return {
      title: "Zaczynasz czy przesuwasz?",
      body: "Ustawiony czas minął. Potwierdź rozpoczęcie lub zmień godzinę — trening nie został oznaczony jako wykonany.",
    };
  if (minutes <= 60)
    return {
      title: "Blisko treningu: prosty wybór",
      body: "Wśród propozycji są małe, proste przekąski. Wybierz to, co dobrze tolerujesz; nie nadrabiaj całego dnia jednym posiłkiem.",
    };
  return {
    title: context.load === "high" ? "Przygotuj posiłek na mocną sesję" : "Masz czas na posiłek",
    body: "Wybierz zestaw i dopasuj porcję do apetytu.",
  };
}

export function foodRestrictionTerms(profile: Profile | null): string[] {
  return [
    ...(profile?.foodAllergies ?? []),
    ...(profile?.foodIntolerances ?? []),
    ...(profile?.foodExclusions ?? []),
  ]
    .map(normalizeFuelText)
    .filter(Boolean);
}

export function fuelStorageKey(userId: string): string {
  return `ballwise:fuel:v3:${userId}`;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function isSelection(value: unknown, today: string): value is FuelSelection {
  return (
    isRecord(value) &&
    value.date === today &&
    (value.contextKey === null ||
      (typeof value.contextKey === "string" && value.contextKey.startsWith(`${today}:`))) &&
    typeof value.manualKind === "string" &&
    Object.hasOwn(SESSION_LABELS, value.manualKind) &&
    (value.manualDurationMin === null ||
      (typeof value.manualDurationMin === "number" &&
        Number.isFinite(value.manualDurationMin) &&
        value.manualDurationMin >= 10 &&
        value.manualDurationMin <= 300)) &&
    ["low", "moderate", "high"].includes(String(value.manualLoad))
  );
}
function isTiming(value: unknown): value is FuelTiming {
  return (
    isRecord(value) &&
    ["before", "training", "after", "ordinary"].includes(String(value.phase)) &&
    (value.startsAt === null ||
      (typeof value.startsAt === "number" && Number.isFinite(value.startsAt))) &&
    (value.presetMin === undefined ||
      (typeof value.presetMin === "number" &&
        Number.isInteger(value.presetMin) &&
        value.presetMin >= 1 &&
        value.presetMin <= 720))
  );
}
function isEntry(value: unknown): value is FuelEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.recipeId === "string" &&
    typeof value.title === "string" &&
    typeof value.contextKey === "string" &&
    (value.status === "selected" || value.status === "eaten") &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    (value.eatenAt === null ||
      (typeof value.eatenAt === "number" && Number.isFinite(value.eatenAt))) &&
    typeof value.fraction === "number" &&
    value.fraction > 0 &&
    value.fraction <= 1 &&
    [null, "comfortable", "heavy"].includes(value.feedback as null | string) &&
    (value.product === undefined || isProductEntry(value.product)) &&
    Array.isArray(value.lines) &&
    (value.lines.length > 0 || isProductEntry(value.product)) &&
    value.lines.length <= 20 &&
    value.lines.every(
      (line) =>
        isRecord(line) &&
        typeof line.foodId === "string" &&
        typeof line.grams === "number" &&
        Number.isFinite(line.grams) &&
        line.grams > 0 &&
        line.grams <= 5000,
    )
  );
}
function isProductEntry(value: unknown): boolean {
  if (!(
    isRecord(value) &&
    isRecord(value.value) &&
    typeof value.value.name === "string" &&
    value.value.name.length > 0 &&
    ["label", "openfoodfacts", "name"].includes(String(value.value.source)) &&
    typeof value.portion === "number" &&
    Number.isFinite(value.portion) &&
    value.portion > 0 &&
    value.portion <= 2000 &&
    (value.unit === "g" || value.unit === "ml")
  ))
    return false;
  const product = value.value as Record<string, unknown>;
  if (product.nutritionUnit !== undefined && !["g", "ml"].includes(String(product.nutritionUnit)))
    return false;
  if (
    ["brand", "ingredientsText", "imageUrl", "barcode"].some(
      (key) => product[key] != null && typeof product[key] !== "string",
    )
  )
    return false;
  if (
    ["categories", "allergens"].some(
      (key) =>
        product[key] !== undefined &&
        (!Array.isArray(product[key]) ||
          !product[key].every((item: unknown) => typeof item === "string")),
    )
  )
    return false;
  return (
    product.nutriments === undefined ||
    (isRecord(product.nutriments) &&
      Object.values(product.nutriments).every(
        (n) => n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0),
      ))
  );
}
export class CorruptFuelDataError extends Error {
  constructor() {
    super(
      "Nie udało się odczytać zapisu Fuel. Zachowano oryginał. Pobierz kopię przed odzyskiwaniem danych.",
    );
    this.name = "CorruptFuelDataError";
  }
}
export function readFuelData(
  storage: Pick<Storage, "getItem">,
  userId: string,
  now = Date.now(),
): FuelDeviceData {
  const empty = emptyFuelData();
  try {
    const original = storage.getItem(fuelStorageKey(userId));
    if (original === null) return empty;
    const raw: unknown = JSON.parse(original);
    if (
      !isRecord(raw) ||
      raw.version !== 3 ||
      !isRecord(raw.preferences) ||
      !isRecord(raw.timings) ||
      !Array.isArray(raw.entries) ||
      raw.entries.length > 100 ||
      !raw.entries.every(isEntry)
    )
      throw new CorruptFuelDataError();
    const p = isRecord(raw.preferences) ? raw.preferences : {};
    const strings = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string").slice(0, 80)
        : [];
    const timings = isRecord(raw.timings)
      ? Object.fromEntries(
          Object.entries(raw.timings)
            .filter(([key, value]) => key.startsWith(localDate(now)) && isTiming(value))
            .slice(-20),
        )
      : {};
    return {
      version: 3,
      timings: timings as Record<string, FuelTiming>,
      selection: isSelection(raw.selection, localDate(now)) ? raw.selection : null,
      preferences: {
        detailed: p.detailed === true,
        diet: p.diet === "vegan" || p.diet === "vegetarian" ? p.diet : "all",
        noCook: p.noCook === true,
        quick: p.quick === true,
        portable: p.portable === true,
        affordable: p.affordable === true,
        favorites: strings(p.favorites),
        hidden: strings(p.hidden),
        excludedFoodIds: strings(p.excludedFoodIds),
      },
      entries: Array.isArray(raw.entries)
        ? raw.entries
            .filter(isEntry)
            .filter((e) => e.createdAt >= now - 30 * 86_400_000 && e.createdAt <= now + 60_000)
            .slice(0, 100)
        : [],
    };
  } catch {
    throw new CorruptFuelDataError();
  }
}
export function writeFuelData(
  storage: Pick<Storage, "setItem">,
  userId: string,
  data: FuelDeviceData,
  now = Date.now(),
): boolean {
  try {
    const today = localDate(now);
    const retained: FuelDeviceData = {
      ...data,
      selection: isSelection(data.selection, today) ? data.selection : null,
      timings: Object.fromEntries(
        Object.entries(data.timings)
          .filter(([key, value]) => key.startsWith(today) && isTiming(value))
          .slice(-20),
      ),
      entries: data.entries
        .filter(isEntry)
        .filter(
          (entry) => entry.createdAt >= now - 30 * 86_400_000 && entry.createdAt <= now + 60_000,
        )
        .slice(0, 100),
    };
    const key = fuelStorageKey(userId);
    const value = JSON.stringify(retained);
    const previous = (storage as Partial<Storage>).getItem?.(key);
    storage.setItem(key, value);
    if (previous !== value && typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("ballwise:module-data-changed", {
          detail: { userId, module: "fuel", key, value },
        }),
      );
    return true;
  } catch {
    return false;
  }
}
export function localDate(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function markFuelEntryEaten(entry: FuelEntry, fraction: number, now: number): FuelEntry {
  return {
    ...entry,
    status: "eaten",
    fraction: Math.min(1, Math.max(0.1, fraction)),
    eatenAt: now,
  };
}

/** A backup includes preferences and exact edited portions, not just recipe IDs. */
export function createFuelBackup(data: FuelDeviceData) {
  return { schema: "ballwise.fuel.backup.v1", exportedAt: new Date().toISOString(), data };
}
export function readFuelBackup(input: unknown, userId: string, now = Date.now()): FuelDeviceData {
  // Accept the former entries-only export as an import into otherwise empty preferences.
  const value = Array.isArray(input)
    ? { ...emptyFuelData(), entries: input }
    : isRecord(input) && input.schema === "ballwise.fuel.backup.v1"
      ? input.data
      : null;
  const data =
    value ??
    (isRecord(input) && Array.isArray(input.entries)
      ? { ...emptyFuelData(), entries: input.entries }
      : null);
  return readFuelData({ getItem: () => JSON.stringify(data) }, userId, now);
}
