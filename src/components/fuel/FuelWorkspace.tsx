import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  RotateCcw,
  ScanBarcode,
  ShoppingCart,
  SlidersHorizontal,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { FuelMealSheet, type FuelMealDraft } from "./FuelMealSheet";
import { FuelNextSteps } from "./FuelNextSteps";
import { FuelFitSheet, type FuelFitOption } from "./FuelFitSheet";
import { FuelPanels, downloadFuelFile, type FuelPanelName } from "./FuelPanels";
import { StoreCheckSheet } from "./StoreCheckSheet";
import { FOOD_BY_ID, findRecipe, parsePantry, type FuelRecipe } from "@/lib/fuel/catalog";
import {
  emptyFuelData,
  fuelMoment,
  localDate,
  manualFuelContext,
  SESSION_LABELS,
  minutesToFuelStart,
  readFuelData,
  FUEL_HISTORY_LIMIT,
  resolveFuelTiming,
  writeFuelData,
  fuelStorageKey,
  readFuelBackup,
  type FuelContext,
  type FuelDeviceData,
  type FuelEntry,
  type FuelPreferences,
  type FuelTiming,
  type MealLine,
} from "@/lib/fuel/experience";
import {
  chooseFuelContext,
  createRecipeEntry,
  foodPreferenceTerms,
  householdPortion,
  practicalRecipes,
  relativeFuelTiming,
  fuelEntryAllowed,
  FUEL_TIME_PRESETS,
} from "@/lib/fuel/practical";
import {
  DEFAULT_FUEL_REMINDERS,
  readReminderPreferences,
  reminderStorageKey,
  type FuelReminderPreferences,
} from "@/lib/fuel/reminderPlan";
import {
  enableFuelReminderPermission,
  nativeFuelRemindersAvailable,
} from "@/lib/fuel/nativeReminders";
import { detectBarcodeFromImage } from "@/lib/fuel/barcode";
import {
  evaluateStoreProduct,
  lookupStoreProduct,
  productFromName,
  type StoreProduct,
} from "@/lib/fuel/storeCheck";
import type { SessionKind } from "@/lib/fuel/types";
import {
  FUEL_FITS,
  fuelDuration,
  provenFuelSets,
  retimeFuelEntries,
  type FuelFit,
  type ProvenFuelSet,
} from "@/lib/fuel/now";
import { PageHeader } from "@/components/loadwise/PageHeader";

const EMPTY_FOOD_IDS: string[] = [];

type Speech = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function FuelWorkspace({
  userId,
  contexts,
  tomorrowMatch = false,
  tomorrowContext = null,
  legacyDislikedFoodIds = EMPTY_FOOD_IDS,
}: {
  userId: string;
  contexts: FuelContext[];
  tomorrowMatch?: boolean;
  tomorrowContext?: FuelContext | null;
  /** Catalogue food IDs from an old profile, moved once into "Czego nie lubię". */
  legacyDislikedFoodIds?: string[];
}) {
  const [data, setData] = useState<FuelDeviceData>(emptyFuelData);
  const [loaded, setLoaded] = useState(false);
  const [storageOK, setStorageOK] = useState(true);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const recoverySnapshot = useRef<string | null>(null);
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const pendingSaveFeedback = useRef<{ message: string; undo: () => void } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [panel, setPanel] = useState<FuelPanelName>(null);
  const [text, setText] = useState("");
  const [recipeIndex, setRecipeIndex] = useState(0);
  const [draft, setDraft] = useState<FuelMealDraft | null>(null);
  const [packingTomorrow, setPackingTomorrow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<FuelReminderPreferences>({
    ...DEFAULT_FUEL_REMINDERS,
  });
  const [reminderBusy, setReminderBusy] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  /** A quick fit waiting for the athlete's choice in its sheet. */
  const [fitSheet, setFitSheet] = useState<"quick" | "store" | null>(null);
  const [storeName, setStoreName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storePortion, setStorePortion] = useState<number | null>(100);
  const [storeUnit, setStoreUnit] = useState<"g" | "ml">("g");
  const [listening, setListening] = useState<"meal" | "store" | null>(null);
  const speech = useRef<Speech | null>(null);
  const request = useRef<AbortController | null>(null);
  const requestRevision = useRef(0);
  const lastTap = useRef(0);
  const date = localDate(now);
  const context = useMemo(() => {
    const selection = data.selection?.date === date ? data.selection : null;
    const selected = selection?.contextKey;
    const planned = selected === null ? null : chooseFuelContext(contexts, selected ?? null, date);
    return (
      planned ??
      manualFuelContext(
        date,
        selection?.manualKind ?? "football",
        selection?.manualDurationMin ?? null,
        selection?.manualLoad ?? "moderate",
      )
    );
  }, [contexts, data.selection, date]);
  const todaySelection = data.selection?.date === date ? data.selection : null;
  const fit: FuelFit | null = todaySelection?.fit ?? null;
  const pantry = useMemo(
    () => (fit === "own" ? (todaySelection?.pantry ?? []).filter((id) => FOOD_BY_ID[id]) : []),
    [fit, todaySelection?.pantry],
  );
  const timing = useMemo(
    () => resolveFuelTiming(context, data.timings[context.key]),
    [context, data.timings],
  );
  const minutes = minutesToFuelStart(timing, now);
  const parsed = useMemo(() => parsePantry(text), [text]);
  const recipes = useMemo(
    () =>
      practicalRecipes({
        context,
        timing,
        now,
        data,
        pantry,
        quick: fit === "quick",
        store: fit === "store",
      }),
    [context, timing, now, data, pantry, fit],
  );
  // The sets a quick fit would show; the same list the card uses once the fit is applied.
  const fitOptions = useMemo<FuelFitOption[]>(
    () =>
      fitSheet
        ? practicalRecipes({
            context,
            timing,
            now,
            data,
            pantry: [],
            quick: fitSheet === "quick",
            store: fitSheet === "store",
          })
            .slice(0, 3)
            .map((recipe, index) => ({ recipe, index }))
        : [],
    [fitSheet, context, timing, now, data],
  );
  const selectedEntry = data.entries.find(
    (e) => e.contextKey === context.key && e.status === "selected",
  );
  const suggestedHero = recipes.length ? recipes[recipeIndex % recipes.length] : null;
  const hero =
    suggestedHero && selectedEntry?.recipeId === suggestedHero.id
      ? { ...suggestedHero, title: selectedEntry.title, lines: selectedEntry.lines }
      : suggestedHero;
  const restrictions = useMemo(() => foodPreferenceTerms(data.preferences), [data.preferences]);
  const proven = useMemo(
    () => provenFuelSets(data.entries, data.preferences, restrictions),
    [data.entries, data.preferences, restrictions],
  );
  const latest = data.entries.find(
    (e) => e.status === "eaten" && e.eatenAt !== null && localDate(e.eatenAt) === localDate(now),
  );
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const packContext = packingTomorrow
    ? (tomorrowContext ?? manualFuelContext(localDate(tomorrowDate.getTime()), "match", 90, "high"))
    : context;
  const packEntry =
    data.entries.find((e) => e.contextKey === packContext.key && e.status === "selected") ?? null;
  const packRecipe = packEntry
    ? null
    : packingTomorrow
      ? (practicalRecipes({
          context: packContext,
          timing: resolveFuelTiming(packContext),
          now,
          data: { ...data, preferences: { ...data.preferences, portable: true } },
        })[0] ?? null)
      : hero;
  const nextSession =
    contexts.find(
      (c) =>
        c.key !== context.key &&
        !c.completed &&
        (resolveFuelTiming(c, data.timings[c.key]).startsAt ?? Infinity) > (timing.startsAt ?? now),
    ) ?? null;
  const native = nativeFuelRemindersAvailable();

  useEffect(() => {
    const reload = () => {
      try {
        setData(readFuelData(window.localStorage, userId));
        setReminders(readReminderPreferences(window.localStorage, userId));
        setStorageBlocked(false);
        setStorageError("");
      } catch (error) {
        setStorageOK(false);
        setStorageBlocked(true);
        setStorageError(error instanceof Error ? error.message : "Zapis Fuel jest niedostępny.");
      }
      setLoaded(true);
    };
    reload();
    const applied = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; module: string }>).detail;
      if (detail?.userId === userId && detail.module === "fuel") reload();
    };
    window.addEventListener("ballwise:module-data-applied", applied);
    return () => window.removeEventListener("ballwise:module-data-applied", applied);
  }, [userId]);
  useEffect(() => {
    if (!loaded || storageBlocked || !legacyDislikedFoodIds.length) return;
    setData((d) => {
      const missing = legacyDislikedFoodIds.filter(
        (id) => FOOD_BY_ID[id] && !d.preferences.excludedFoodIds.includes(id),
      );
      return missing.length
        ? {
            ...d,
            preferences: {
              ...d.preferences,
              excludedFoodIds: [...d.preferences.excludedFoodIds, ...missing],
            },
          }
        : d;
    });
  }, [loaded, storageBlocked, legacyDislikedFoodIds]);
  useEffect(() => {
    if (!loaded || storageBlocked) return;
    let saved = false;
    try {
      saved = writeFuelData(window.localStorage, userId, data);
    } catch {
      /* retain in memory */
    }
    setStorageOK(saved);
    const feedback = pendingSaveFeedback.current;
    pendingSaveFeedback.current = null;
    if (feedback) {
      if (saved)
        toast.success(feedback.message, { action: { label: "Cofnij", onClick: feedback.undo } });
      else
        toast.info(
          "Nie zapisano posiłku na urządzeniu. Pobierz kopię w Historii przed zamknięciem.",
        );
    }
    window.dispatchEvent(new CustomEvent("ballwise:fuel-changed"));
  }, [data, loaded, storageBlocked, userId]);
  async function downloadRecoveryCopy() {
    setRecoveryDownloaded(false);
    recoverySnapshot.current = null;
    const owner = userId;
    try {
      const raw = localStorage.getItem(fuelStorageKey(owner));
      const result = await downloadFuelFile(
        "BallWise-Fuel-oryginalny-zapis.json",
        raw ?? "null",
        "application/json",
        owner,
      );
      if (activeUser.current !== owner) return;
      if (result === "delivered" && localStorage.getItem(fuelStorageKey(owner)) === raw) {
        recoverySnapshot.current = raw;
        setRecoveryDownloaded(true);
      } else
        toast.info(
          result === "cancelled"
            ? "Anulowano przekazanie kopii. Oryginalny zapis pozostaje bez zmian."
            : "Zapis zmienił się podczas eksportu. Pobierz nową kopię przed utworzeniem nowego zapisu.",
        );
    } catch {
      toast.info("Nie udało się pobrać kopii. Sprawdź dostęp do plików.");
    }
  }
  function recoveryCopyMatches() {
    try {
      return (
        recoveryDownloaded &&
        localStorage.getItem(fuelStorageKey(userId)) === recoverySnapshot.current
      );
    } catch {
      return false;
    }
  }
  function importBackup(value: unknown) {
    if (storageBlocked && !recoveryCopyMatches()) {
      toast.info("Najpierw pobierz oryginalny zapis. Import nie nadpisze go bez kopii.");
      return;
    }
    try {
      const incoming = readFuelBackup(value, userId);
      const entries = [
        ...data.entries,
        ...incoming.entries.filter(
          (entry) => !data.entries.some((existing) => existing.id === entry.id),
        ),
      ];
      if (entries.length > 100)
        throw new Error(
          "Kopia i historia mają razem ponad 100 wpisów. Zachowaj oba eksporty i wybierz mniejszą kopię.",
        );
      const drinks = [
        ...(data.drinks ?? []),
        ...(incoming.drinks ?? []).filter(
          (d) => !(data.drinks ?? []).some((existing) => existing.id === d.id),
        ),
      ];
      if (drinks.length > 100)
        throw new Error("Połączona historia napojów przekracza 100 wpisów. Zachowaj obie kopie.");
      const next = { ...incoming, entries, drinks };
      if (!writeFuelData(localStorage, userId, next))
        throw new Error("Brak miejsca na zapis kopii. Oryginalny zapis pozostał bez zmian.");
      setStorageBlocked(false);
      setStorageError("");
      setData(next);
      toast.success("Przywrócono kopię Fuel.");
    } catch (error) {
      toast.info(error instanceof Error ? error.message : "Nie udało się odczytać kopii.");
    }
  }
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => setNow(Date.now());
    const visibility = () => {
      if (timer) clearInterval(timer);
      if (document.visibilityState === "visible") {
        refresh();
        timer = setInterval(refresh, 30_000);
      } else speech.current?.stop();
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", refresh);
    const fail = () =>
      toast.info("Nie udało się zaplanować przypomnienia. Sprawdź ustawienia telefonu.");
    window.addEventListener("ballwise:fuel-reminder-error", fail);
    return () => {
      if (timer) clearInterval(timer);
      speech.current?.stop();
      request.current?.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("ballwise:fuel-reminder-error", fail);
    };
  }, []);
  /** The set picked in a fit sheet; applied once the new fit has rebuilt the list. */
  const pendingFitIndex = useRef<number | null>(null);
  useEffect(() => {
    setRecipeIndex(pendingFitIndex.current ?? 0);
    pendingFitIndex.current = null;
  }, [context.key, timing.phase, fit, pantry, data.preferences]);
  const updatePreferences = (patch: Partial<FuelPreferences>) =>
    setData((d) => ({ ...d, preferences: { ...d.preferences, ...patch } }));
  function setTiming(next: FuelTiming) {
    setNow(Date.now());
    setData((d) => ({
      ...d,
      timings: { ...d.timings, [context.key]: next },
      // A new start time keeps every saved meal; only "how long before" is corrected.
      entries: retimeFuelEntries(d.entries, context.key, next),
      selection: {
        ...(d.selection?.date === localDate(Date.now()) ? d.selection : {}),
        date: localDate(Date.now()),
        contextKey: context.fromPlan ? context.key : null,
        manualKind: context.kind,
        manualDurationMin: context.durationMin,
        manualLoad: context.load,
      },
    }));
    setRecipeIndex(0);
    setPanel(null);
  }
  function setRelative(value: number) {
    const next = relativeFuelTiming(value, Date.now());
    if (next) setTiming(next);
    else toast.info("Wybierz od 1 do 720 minut.");
  }
  function chooseContext(key: string) {
    const c = contexts.find((c) => c.key === key);
    setData((d) => ({
      ...d,
      selection: {
        date: localDate(Date.now()),
        contextKey: c?.key ?? null,
        manualKind: c?.kind ?? (key as SessionKind),
        manualDurationMin: c?.durationMin ?? null,
        manualLoad: c?.load ?? "moderate",
        fit: null,
        pantry: [],
      },
    }));
    setRecipeIndex(0);
  }
  /** Today's quick fit is kept with the selection, so it survives reopening Fuel. */
  function applyFit(next: FuelFit | null, nextPantry: string[] = []) {
    setData((d) => {
      const today = localDate(Date.now());
      const base =
        d.selection?.date === today
          ? d.selection
          : {
              date: today,
              contextKey: context.fromPlan ? context.key : null,
              manualKind: context.kind,
              manualDurationMin: context.durationMin,
              manualLoad: context.load,
            };
      return { ...d, selection: { ...base, fit: next, pantry: next === "own" ? nextPantry : [] } };
    });
    setRecipeIndex(0);
  }
  function chooseFit(next: FuelFit) {
    if (next === "own") {
      setText(pantry.map((id) => FOOD_BY_ID[id].label).join(", "));
      setPanel("pantry");
      return;
    }
    // An active fit switches off with one tap; a new one asks first in its sheet.
    if (fit === next) applyFit(null);
    else setFitSheet(next);
  }
  function repeatSet(set: ProvenFuelSet) {
    setEditingId(null);
    setDraft({
      id: set.entry.recipeId,
      title: set.entry.title,
      lines: set.entry.lines.map((line) => ({ ...line })),
      recipe: findRecipe(set.entry.recipeId),
      repeated: true,
      fraction: set.entry.fraction,
    });
  }
  function favorite(id: string) {
    setData((d) => ({
      ...d,
      preferences: {
        ...d.preferences,
        favorites: d.preferences.favorites.includes(id)
          ? d.preferences.favorites.filter((v) => v !== id)
          : [...d.preferences.favorites, id],
      },
    }));
  }
  function excludeFood(id: string) {
    if (data.preferences.excludedFoodIds.includes(id)) return;
    updatePreferences({ excludedFoodIds: [...data.preferences.excludedFoodIds, id] });
    setRecipeIndex(0);
    toast.success(`${FOOD_BY_ID[id].label}: dodano do „Czego nie lubię”.`, {
      action: {
        label: "Cofnij",
        onClick: () =>
          setData((d) => ({
            ...d,
            preferences: {
              ...d.preferences,
              excludedFoodIds: d.preferences.excludedFoodIds.filter((v) => v !== id),
            },
          })),
      },
    });
  }
  function recordEntry(entry: FuelEntry, replaceId?: string | null) {
    setNow(Date.now());
    const previous = replaceId ? data.entries.find((e) => e.id === replaceId) : null;
    if (
      entry.status === "eaten" &&
      previous?.status !== "eaten" &&
      entry.contextKey === context.key
    ) {
      const before = minutesToFuelStart(timing, entry.eatenAt ?? Date.now());
      entry = {
        ...entry,
        sessionKind: entry.sessionKind ?? context.kind,
        phase: entry.phase ?? timing.phase,
        minutesBefore: before !== null && before <= 1440 ? before : null,
      };
    }
    if (entry.minutesBefore != null && entry.minutesBefore > 1440)
      entry = { ...entry, minutesBefore: null };
    setData((d) => ({
      ...d,
      // Newest first; the oldest entry drops out instead of blocking a new meal.
      entries: [entry, ...d.entries.filter((e) => e.id !== (replaceId ?? entry.id))].slice(
        0,
        FUEL_HISTORY_LIMIT,
      ),
    }));
    pendingSaveFeedback.current = {
      message:
        entry.status === "eaten" ? "Zapisano zjedzony zestaw." : "Zestaw zapisany na później.",
      undo: () =>
        setData((current) => ({
          ...current,
          entries: [
            ...(previous ? [previous] : []),
            ...current.entries.filter((row) => row.id !== entry.id),
          ],
        })),
    };
    if (storageBlocked) {
      pendingSaveFeedback.current = null;
      toast.info(
        "Posiłek jest tylko na tym ekranie. Najpierw odzyskaj zapis lub pobierz kopię w Historii.",
      );
    }
  }
  function quickSave(recipe: FuelRecipe, status: FuelEntry["status"], targetContext = context) {
    if (!fuelEntryAllowed({ lines: recipe.lines }, data.preferences, restrictions)) {
      toast.info("Ten zestaw koliduje z aktualnymi ograniczeniami. Wybierz zamiennik.");
      return;
    }
    const at = Date.now();
    if (at - lastTap.current < 700) return;
    lastTap.current = at;
    const existing = data.entries.find(
      (e) =>
        e.contextKey === targetContext.key && e.recipeId === recipe.id && e.status === "selected",
    );
    const entry = createRecipeEntry(
      recipe,
      targetContext.key,
      status,
      at,
      existing?.id ?? crypto.randomUUID(),
    );
    const exact = existing
      ? { ...existing, status, eatenAt: status === "eaten" ? at : null }
      : entry;
    exact.sessionKind = targetContext.kind;
    exact.phase = status === "eaten" ? timing.phase : exact.phase;
    exact.minutesBefore = status === "eaten" ? minutesToFuelStart(timing, at) : exact.minutesBefore;
    if (!fuelEntryAllowed(exact, data.preferences, restrictions)) {
      toast.info("Zapisany zestaw koliduje z aktualnymi ograniczeniami. Popraw go przed wyborem.");
      return;
    }
    recordEntry(exact, existing?.id);
    if (status === "selected") setPanel(null);
  }
  function openRecipe(recipe: FuelRecipe, initialSwapFoodId?: string) {
    const selected = data.entries.find(
      (e) => e.contextKey === context.key && e.recipeId === recipe.id && e.status === "selected",
    );
    setEditingId(selected?.id ?? null);
    setDraft({
      id: recipe.id,
      title: recipe.title,
      lines: (selected?.lines ?? recipe.lines).map((l) => ({ ...l })),
      recipe,
      initialSwapFoodId,
    });
    setPanel(null);
  }
  function saveDraft(meal: FuelMealDraft, lines: MealLine[], eaten: boolean, fraction: number) {
    const existing = editingId ? data.entries.find((e) => e.id === editingId) : null;
    const at = Date.now();
    recordEntry(
      {
        id: existing?.id ?? crypto.randomUUID(),
        recipeId: meal.id,
        title: meal.title,
        lines: lines.map((l) => ({ ...l })),
        contextKey: existing?.contextKey ?? context.key,
        status: eaten ? "eaten" : "selected",
        createdAt: existing?.createdAt ?? at,
        eatenAt: eaten ? (meal.eatenAt ?? existing?.eatenAt ?? at) : null,
        fraction: eaten ? fraction : 1,
        feedback: null,
        sessionKind: existing?.sessionKind ?? context.kind,
        phase: eaten ? timing.phase : undefined,
        minutesBefore: eaten ? minutesToFuelStart(timing, meal.eatenAt ?? at) : undefined,
      },
      editingId,
    );
    setDraft(null);
    setEditingId(null);
  }
  function openOwn() {
    if (!parsed.ids.length) return;
    setEditingId(null);
    setDraft({
      id: `own:${crypto.randomUUID()}`,
      title: "Mój posiłek",
      own: true,
      lines: parsed.ids.map((foodId) => ({ foodId, grams: FOOD_BY_ID[foodId].unitGrams })),
    });
    setPanel(null);
  }
  function toggleVoice(mode: "meal" | "store") {
    if (listening) {
      speech.current?.stop();
      setListening(null);
      return;
    }
    const w = window as typeof window & {
      SpeechRecognition?: new () => Speech;
      webkitSpeechRecognition?: new () => Speech;
    };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info("Na tym urządzeniu wpisz produkty lub użyj dyktowania klawiatury.");
      return;
    }
    const rec = new Recognition();
    rec.lang = "pl-PL";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const value = e.results[0]?.[0]?.transcript?.trim();
      if (value) {
        if (mode === "meal") setText(value);
        else {
          setStoreName(value);
          setProduct(null);
        }
      }
    };
    rec.onerror = () => {
      setListening(null);
      toast.info("Nie rozpoznałem głosu. Możesz wpisać tekst.");
    };
    rec.onend = () => {
      speech.current = null;
      setListening(null);
    };
    try {
      speech.current = rec;
      rec.start();
      setListening(mode);
    } catch {
      setListening(null);
      toast.info("Mikrofon jest niedostępny. Użyj tekstu.");
    }
  }
  function stopRequest() {
    request.current?.abort();
    request.current = null;
    requestRevision.current += 1;
    setStoreLoading(false);
  }
  async function checkCode(value: string) {
    stopRequest();
    const ticket = requestRevision.current;
    const controller = new AbortController();
    request.current = controller;
    setStoreLoading(true);
    setProduct(null);
    try {
      const result = await lookupStoreProduct(value, controller.signal);
      if (ticket !== requestRevision.current) return;
      if (result) {
        setProduct(result);
        setStoreName(result.name);
      } else toast.info("Nie znalazłem produktu. Wpisz nazwę lub wartości z etykiety.");
    } catch (e) {
      if (!controller.signal.aborted)
        toast.info(e instanceof Error ? e.message : "Nie udało się sprawdzić produktu.");
    } finally {
      if (ticket === requestRevision.current) setStoreLoading(false);
    }
  }
  async function scanCode(file: File | undefined) {
    if (!file) return;
    stopRequest();
    const ticket = requestRevision.current;
    setStoreLoading(true);
    try {
      const code = await detectBarcodeFromImage(file);
      if (ticket !== requestRevision.current) return;
      if (code) {
        setBarcode(code);
        await checkCode(code);
      } else toast.info("Nie odczytałem kodu. Wpisz cyfry lub nazwę.");
    } catch (e) {
      if (ticket === requestRevision.current)
        toast.info(e instanceof Error ? e.message : "Nie odczytałem kodu.");
    } finally {
      if (ticket === requestRevision.current) setStoreLoading(false);
    }
  }
  const onPortionChange = useCallback((portion: number | null, unit: "g" | "ml") => {
    setStorePortion(portion);
    setStoreUnit(unit);
  }, []);
  const evaluation = product
    ? evaluateStoreProduct({
        product,
        moment: fuelMoment(timing),
        load: context.load,
        minutesToStart: minutes,
        restrictions,
        diet: data.preferences.diet,
        portion: storePortion ?? 0,
        unit: storeUnit,
      })
    : null;
  function logProduct(value: StoreProduct, portion: number, unit: "g" | "ml", eaten: boolean) {
    const at = Date.now();
    recordEntry({
      id: crypto.randomUUID(),
      recipeId: `product:${value.barcode ?? crypto.randomUUID()}`,
      title: value.name,
      lines: [],
      contextKey: context.key,
      status: eaten ? "eaten" : "selected",
      createdAt: at,
      eatenAt: eaten ? at : null,
      fraction: 1,
      feedback: null,
      product: { value, portion, unit },
    });
    setStoreOpen(false);
  }
  function persistReminders(next: FuelReminderPreferences) {
    setReminders(next);
    try {
      localStorage.setItem(reminderStorageKey(userId), JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("ballwise:fuel-changed"));
    } catch {
      toast.info("Telefon nie zapisał ustawień przypomnienia.");
    }
  }
  async function toggleReminders() {
    if (reminderBusy) return;
    if (!native) {
      setPanel("reminders");
      return;
    }
    if (reminders.enabled) {
      persistReminders({ ...reminders, enabled: false });
      return;
    }
    setReminderBusy(true);
    try {
      if (await enableFuelReminderPermission()) {
        persistReminders({ ...reminders, enabled: true });
        toast.success("Przypomnienia są włączone.");
      } else toast.info("Zezwól BallWise na powiadomienia w ustawieniach telefonu.");
    } catch {
      toast.info("Nie udało się włączyć przypomnień. Sprawdź ustawienia telefonu.");
    } finally {
      setReminderBusy(false);
    }
  }
  const timingTitle =
    timing.phase === "after"
      ? "Po treningu"
      : timing.phase === "training"
        ? "Trening trwa"
        : timing.phase === "ordinary"
          ? "Zwykły posiłek"
          : minutes === null
            ? "Za ile zaczynasz?"
            : minutes === 0
              ? "Czas startu minął"
              : fuelDuration(minutes);

  const match = context.kind === "match";
  const startClock =
    timing.startsAt !== null
      ? new Date(timing.startsAt).toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const startDay =
    timing.startsAt === null
      ? "Dziś"
      : localDate(timing.startsAt) === date
        ? "Dziś"
        : localDate(timing.startsAt) === localDate(tomorrowDate.getTime())
          ? "Jutro"
          : null;
  const contextTitle =
    timing.phase === "ordinary"
      ? "Dziś bez treningu"
      : timing.phase === "training"
        ? match
          ? "Mecz trwa"
          : "Trening trwa"
        : timing.phase === "after"
          ? match
            ? "Po meczu"
            : "Po treningu"
          : startClock && startDay
            ? `${startDay} ${match ? "gramy" : "trening"} o ${startClock}`
            : timingTitle;
  const contextLine =
    timing.phase === "ordinary"
      ? "Zwykły posiłek"
      : `${context.fromPlan ? context.title : SESSION_LABELS[context.kind]}${
          context.durationMin ? ` · ${context.durationMin} min` : ""
        }`;
  const phases = [
    { id: "before", label: "Przed" },
    { id: "training", label: "W trakcie" },
    { id: "after", label: "Po" },
  ] as const;
  const phaseIndex = phases.findIndex((item) => item.id === timing.phase);
  const untilLabel =
    timing.phase === "before" && minutes !== null && minutes > 0
      ? `${match ? "Do meczu" : "Do treningu"} ${fuelDuration(minutes)}`
      : null;
  const phaseName =
    timing.phase === "after"
      ? match
        ? "Po meczu"
        : "Po treningu"
      : timing.phase === "training"
        ? "W przerwie"
        : timing.phase === "ordinary"
          ? "Zwykły posiłek"
          : match
            ? "Przed meczem"
            : "Przed treningiem";
  const fitWhen =
    timing.phase === "before" && minutes !== null && minutes > 0
      ? `${phaseName} · ${fuelDuration(minutes)} do startu`
      : phaseName;

  return (
    <div className="fuel-workspace fuel-v4">
      <PageHeader
        title="Fuel"
        sketch="fuel"
        className="fuel-v4-header fuel-now-header bw-page-header--inset"
        actions={
          <button
            className="fuel-header-link"
            aria-label={latest ? "Historia, zapisano dziś" : "Historia"}
            onClick={() => setPanel("history")}
          >
            {latest && <Check size={15} aria-hidden="true" className="bw-tone--success" />}
            Historia
          </button>
        }
      />
      <main className="fuel-v4-main">
        {!storageOK && (
          <div className="fuel-v4-warning bw-inline-error" role="status">
            <p>
              {storageError ||
                "Nie zapisano ostatnich zmian. Pobierz kopię w Historii przed zamknięciem aplikacji."}
            </p>
            {storageBlocked && (
              <>
                <button className="fuel-secondary mt-2" onClick={downloadRecoveryCopy}>
                  Pobierz oryginalny zapis
                </button>
                <button
                  className="fuel-text-button mt-2"
                  disabled={!recoveryDownloaded}
                  onClick={() => {
                    if (!recoveryCopyMatches()) {
                      setRecoveryDownloaded(false);
                      toast.info(
                        "Zapis zmienił się. Pobierz aktualną kopię przed utworzeniem nowego.",
                      );
                      return;
                    }
                    setStorageBlocked(false);
                    setStorageError("");
                    setData(emptyFuelData());
                  }}
                >
                  Po pobraniu kopii utwórz nowy zapis
                </button>
              </>
            )}
          </div>
        )}
        <section className="fuel-v4-time fuel-now-context" aria-label="Czas do treningu">
          {timing.phase === "before" && minutes === null ? (
            <div className="fuel-time-options">
              <h2 className="fuel-v4-time-question">
                {context.kind === "match" ? "Za ile zaczynasz mecz?" : "Za ile zaczynasz trening?"}
              </h2>
              {context.fromPlan && context.title !== SESSION_LABELS[context.kind] && (
                <p className="fuel-now-plan">Z planu: {context.title}</p>
              )}
              <div className="fuel-v4-presets">
                {FUEL_TIME_PRESETS.map((v) => (
                  <button
                    key={v}
                    aria-pressed={timing.presetMin === v}
                    onClick={() => setRelative(v)}
                  >
                    {v < 60 ? `${v} min` : `${v / 60} h`}
                  </button>
                ))}
              </div>
              <div className="fuel-now-question-links">
                <button className="fuel-v4-clock-link" onClick={() => setPanel("time")}>
                  Inna godzina
                </button>
                {!context.fromPlan && (
                  <button
                    className="fuel-v4-clock-link"
                    onClick={() => setTiming({ startsAt: null, phase: "ordinary" })}
                  >
                    Dziś bez treningu
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="fuel-row">
              <div className="fuel-v4-time-value">
                <CalendarDays
                  size={22}
                  aria-hidden="true"
                  className={
                    timing.phase === "before" && minutes === 0 ? "bw-tone--warning" : undefined
                  }
                />
                <div>
                  <strong className="tabular-nums">{contextTitle}</strong>
                  <span>{contextLine}</span>
                </div>
              </div>
              <button className="fuel-text-button" onClick={() => setPanel("time")}>
                Zmień
              </button>
            </div>
          )}
          {timing.phase === "before" && minutes === 0 && (
            <div className="fuel-v4-expired">
              <button onClick={() => setTiming({ ...timing, phase: "training" })}>Zaczynam</button>
              <button onClick={() => setTiming({ ...timing, phase: "after", endedAt: Date.now() })}>
                Już po treningu
              </button>
            </div>
          )}
        </section>
        {phaseIndex >= 0 && !(timing.phase === "before" && minutes === null) && (
          <section className="fuel-timeline" aria-label="Pora jedzenia">
            <ol>
              {phases.map((item, i) => (
                <li
                  key={item.id}
                  data-state={i === phaseIndex ? "now" : i < phaseIndex ? "past" : "next"}
                  aria-current={i === phaseIndex ? "step" : undefined}
                >
                  {i === phaseIndex && <span className="fuel-timeline-now">Teraz</span>}
                  <i aria-hidden="true" />
                  <span className="fuel-timeline-label">{item.label}</span>
                </li>
              ))}
            </ol>
            {untilLabel && <p className="fuel-timeline-caption">{untilLabel}</p>}
          </section>
        )}
        {hero ? (
          <article className="fuel-v4-hero fuel-now-card" key={`${hero.id}:${timing.phase}`}>
            <div className="fuel-row fuel-now-title">
              <h2 className="fuel-now-question">
                {timing.phase === "training" ? "W przerwie najlepiej" : "Teraz najlepiej"}
              </h2>
              <button
                className="fuel-v4-heart"
                aria-label={
                  data.preferences.favorites.includes(hero.id)
                    ? "Usuń z ulubionych"
                    : "Dodaj do ulubionych"
                }
                aria-pressed={data.preferences.favorites.includes(hero.id)}
                onClick={() => favorite(hero.id)}
              >
                <Heart
                  size={19}
                  fill={data.preferences.favorites.includes(hero.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <h3>{hero.title}</h3>
            <p className="fuel-v4-ingredients fuel-now-portion" aria-label="Orientacyjna porcja">
              {hero.lines.map((line, i) => (
                <Fragment key={line.foodId}>
                  {i > 0 && " "}
                  <span className="fuel-now-portion-item">
                    <button
                      className="fuel-v4-ingredient-change"
                      aria-label={`Zmień ${FOOD_BY_ID[line.foodId].label}`}
                      title={householdPortion(line)}
                      onClick={() => openRecipe(hero, line.foodId)}
                    >
                      {compactPortion(line, i > 0)}
                    </button>
                    {i < hero.lines.length - 1 && <span aria-hidden="true"> ·</span>}
                  </span>
                </Fragment>
              ))}
            </p>
            {pantry.length > 0 && (
              <p className="fuel-v4-meta fuel-now-missing">
                Brakuje:{" "}
                {hero.lines
                  .filter((l) => !pantry.includes(l.foodId))
                  .map((l) => FOOD_BY_ID[l.foodId].label)
                  .join(", ") || "nic, masz wszystko"}
              </p>
            )}
            <p className="fuel-now-meta">
              <Clock3 size={18} aria-hidden="true" />
              <span>Porcja orientacyjna · {hero.prepMin} min</span>
            </p>
            <div className="fuel-v4-hero-actions">
              <button
                className="fuel-primary"
                disabled={!loaded}
                onClick={() => quickSave(hero, "eaten")}
              >
                Zjadłem
              </button>
              <button className="fuel-now-action" onClick={() => setPanel("swap")}>
                Zamień
              </button>
              <button className="fuel-now-action" onClick={() => openRecipe(hero)}>
                Przepis
              </button>
            </div>
            {fit === "store" && (
              <button
                className="fuel-now-link fuel-now-card-link"
                onClick={() => {
                  setProduct(null);
                  setStoreOpen(true);
                }}
              >
                <ScanBarcode size={15} aria-hidden="true" /> Sprawdź produkt z półki
              </button>
            )}
            {fit === "own" && (
              <button className="fuel-now-link fuel-now-card-link" onClick={() => chooseFit("own")}>
                <Utensils size={15} aria-hidden="true" /> Zmień, co masz
              </button>
            )}
          </article>
        ) : (
          <div className="fuel-v4-hero fuel-v4-empty">
            <h3>Brak pasującego zestawu</h3>
            <p>
              {fit
                ? "Żaden zestaw nie pasuje do tego dopasowania."
                : "Możesz zmienić preferencje lub opisać własne jedzenie."}
            </p>
            <button
              className="fuel-secondary"
              onClick={() => (fit ? applyFit(null) : setPanel("preferences"))}
            >
              {fit ? "Pokaż wszystkie" : "Zmień preferencje"}
            </button>
          </div>
        )}
        <section className="fuel-fit-section" aria-labelledby="fuel-fit-title">
          <h2 id="fuel-fit-title" className="fuel-section-title">
            Dopasuj do chwili
          </h2>
          <div className="fuel-now-fits" role="group" aria-label="Szybkie dopasowanie">
            {FUEL_FITS.map((option) => (
              <button
                key={option.id}
                className="fuel-now-fit"
                aria-pressed={fit === option.id}
                onClick={() => chooseFit(option.id)}
              >
                {option.id === "quick" ? (
                  <Clock3 size={24} aria-hidden="true" />
                ) : option.id === "store" ? (
                  <ShoppingCart size={24} aria-hidden="true" />
                ) : (
                  <SlidersHorizontal size={24} aria-hidden="true" />
                )}
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <FuelNextSteps
          middle={
            proven.length > 0 && (
              <section className="fuel-v4-list fuel-now-proven" aria-label="Sprawdzone zestawy">
                <h2 className="fuel-now-list-title">Sprawdzone</h2>
                {proven.map((set) => (
                  <button
                    key={set.entry.id}
                    className="fuel-v4-row"
                    onClick={() => repeatSet(set)}
                    aria-label={`Powtórz ${set.entry.title}`}
                  >
                    <span aria-hidden="true" className="fuel-v4-row-icon">
                      <RotateCcw size={17} />
                    </span>
                    <span className="fuel-v4-row-label">{set.entry.title}</span>
                    <span className="fuel-v4-row-value">
                      {set.times > 1 ? `${set.times}×` : "Powtórz"}
                    </span>
                    <ChevronRight size={16} className="fuel-v4-row-chevron" aria-hidden="true" />
                  </button>
                ))}
              </section>
            )
          }
          context={context}
          timing={timing}
          now={now}
          data={data}
          nextSession={nextSession}
          laterTitle={selectedEntry?.title ?? null}
          tomorrowMatch={tomorrowMatch || !!tomorrowContext}
          native={native}
          remindersOn={reminders.enabled}
          reminderBusy={reminderBusy || !loaded}
          onOwn={() => {
            setText("");
            setPanel("own");
          }}
          onSettings={() => setPanel("preferences")}
          afterLabel={
            timing.phase === "before" || timing.phase === "training"
              ? match
                ? "Po meczu"
                : "Po treningu"
              : null
          }
          onAfter={() => setTiming({ ...timing, phase: "after", endedAt: Date.now() })}
          onPack={() => {
            setPackingTomorrow(false);
            setPanel("pack");
          }}
          onTomorrow={() => {
            setPackingTomorrow(true);
            setPanel("pack");
          }}
          onReminders={() => setPanel("reminders")}
          onToggleReminders={() => void toggleReminders()}
          onDrink={(ml, kind) => {
            const id = crypto.randomUUID();
            const at = Date.now();
            setNow(at);
            setData((d) => ({
              ...d,
              // Newest first; the oldest drink drops out instead of blocking new logs.
              drinks: [{ id, contextKey: context.key, at, ml, kind }, ...(d.drinks ?? [])].slice(
                0,
                FUEL_HISTORY_LIMIT,
              ),
            }));
            pendingSaveFeedback.current = {
              message: "Zapisano wypity napój.",
              undo: () =>
                setData((d) => ({ ...d, drinks: (d.drinks ?? []).filter((row) => row.id !== id) })),
            };
          }}
        />
        <p className="fuel-v4-discreet">
          Porcje są orientacyjne. Fuel nie liczy dawek z masy ciała.
        </p>
      </main>
      <FuelPanels
        userId={userId}
        panel={panel}
        setPanel={setPanel}
        data={data}
        setData={setData}
        contexts={contexts}
        context={context}
        timing={timing}
        preferences={data.preferences}
        hero={hero}
        recipes={recipes}
        packRecipe={packRecipe}
        packEntry={packEntry}
        packContext={packContext}
        onPackSave={() => {
          if (packEntry) {
            recordEntry(packEntry, packEntry.id);
            setPanel(null);
          } else if (packRecipe) quickSave(packRecipe, "selected", packContext);
        }}
        restrictions={restrictions}
        onImportBackup={importBackup}
        text={text}
        setText={setText}
        parsed={parsed}
        native={native}
        reminders={reminders}
        reminderBusy={reminderBusy}
        setTiming={setTiming}
        setRelative={setRelative}
        chooseContext={chooseContext}
        updatePreferences={updatePreferences}
        excludeFood={excludeFood}
        openRecipe={openRecipe}
        quickSave={quickSave}
        openOwn={openOwn}
        toggleVoice={() => toggleVoice("meal")}
        listening={listening === "meal"}
        recordEntry={recordEntry}
        editEntry={(entry) => {
          setEditingId(entry.id);
          setDraft({
            id: entry.recipeId,
            title: entry.title,
            lines: entry.lines,
            edited: true,
            recipe: findRecipe(entry.recipeId),
            fraction: entry.fraction,
            eatenAt: entry.eatenAt ?? undefined,
          });
          setPanel(null);
        }}
        onStore={() => {
          setPanel(null);
          setStoreOpen(true);
        }}
        onQuick={() => {
          applyFit("quick");
          setPanel(null);
        }}
        onNext={() => {
          setRecipeIndex((v) => v + 1);
          setPanel(null);
        }}
        onPantry={() => {
          applyFit("own", parsed.ids);
          setPanel(null);
        }}
        persistReminders={persistReminders}
        toggleReminders={() => void toggleReminders()}
        onClose={() => {
          speech.current?.stop();
          setPanel(null);
        }}
      />
      <FuelFitSheet
        open={fitSheet !== null}
        title={fitSheet === "store" ? "W sklepie" : "Mam 5 minut"}
        subtitle={`${fitSheet === "store" ? "Do kupienia" : "Proste opcje"} ${
          timing.phase === "after"
            ? match
              ? "po meczu"
              : "po treningu"
            : timing.phase === "training"
              ? "na przerwę"
              : timing.phase === "ordinary"
                ? "na zwykły posiłek"
                : match
                  ? "przed meczem"
                  : "przed treningiem"
        }`}
        when={fitWhen}
        options={fitOptions}
        onChoose={(option) => {
          pendingFitIndex.current = option.index;
          if (fitSheet) applyFit(fitSheet);
          setRecipeIndex(option.index);
          setFitSheet(null);
        }}
        onOther={() => {
          setFitSheet(null);
          chooseFit("own");
        }}
        onClose={() => setFitSheet(null)}
      />
      <FuelMealSheet
        draft={draft}
        context={context}
        timing={timing}
        now={now}
        preferences={data.preferences}
        restrictions={restrictions}
        onClose={() => {
          setDraft(null);
          setEditingId(null);
        }}
        onSave={saveDraft}
        onFavorite={favorite}
      />
      <StoreCheckSheet
        open={storeOpen}
        productName={storeName}
        barcode={barcode}
        product={product}
        evaluation={evaluation}
        moment={fuelMoment(timing)}
        listening={listening === "store"}
        loading={storeLoading}
        onClose={() => {
          stopRequest();
          speech.current?.stop();
          setStoreOpen(false);
        }}
        onProductNameChange={(value) => {
          stopRequest();
          setStoreName(value);
          setProduct(null);
        }}
        onBarcodeChange={(value) => {
          stopRequest();
          setBarcode(value);
          setProduct(null);
        }}
        onMomentChange={(phase) =>
          setTiming({ ...timing, phase, ...(phase === "after" ? { endedAt: Date.now() } : {}) })
        }
        onToggleVoice={() => toggleVoice("store")}
        onImage={(file) => void scanCode(file)}
        onCheckName={() => {
          stopRequest();
          setProduct(productFromName(storeName));
        }}
        onCheckBarcode={() => void checkCode(barcode)}
        onReset={() => {
          stopRequest();
          setProduct(null);
        }}
        onLabelProduct={setProduct}
        onLog={logProduct}
        onPortionChange={onPortionChange}
      />
    </div>
  );
}

/** "Ryż 80 g", "kurczak 120 g", "makaron 200 g po ugotowaniu" — one ingredient in the portion line. */
function compactPortion(line: MealLine, lower: boolean): string {
  const food = FOOD_BY_ID[line.foodId];
  const label = lower
    ? food.label.charAt(0).toLocaleLowerCase("pl-PL") + food.label.slice(1)
    : food.label;
  const state =
    food.unitLabel === "miseczki" ? " po ugotowaniu" : food.state === "suche" ? " na sucho" : "";
  return `${label} ${Math.round(line.grams)} g${state}`;
}
