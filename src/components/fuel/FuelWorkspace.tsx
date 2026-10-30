import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  History,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { FuelMealSheet, type FuelMealDraft } from "./FuelMealSheet";
import { FuelPanels, downloadFuelFile, type FuelPanelName } from "./FuelPanels";
import { StoreCheckSheet } from "./StoreCheckSheet";
import { FOOD_BY_ID, findRecipe, parsePantry, type FuelRecipe } from "@/lib/fuel/catalog";
import {
  emptyFuelData,
  fuelMoment,
  localDate,
  manualFuelContext,
  minutesToFuelStart,
  readFuelData,
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

const EMPTY_RESTRICTIONS: string[] = [];

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
  profileRestrictions = EMPTY_RESTRICTIONS,
}: {
  userId: string;
  contexts: FuelContext[];
  tomorrowMatch?: boolean;
  profileRestrictions?: string[];
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
  const [quick, setQuick] = useState(false);
  const [pantry, setPantry] = useState<string[]>([]);
  const [draft, setDraft] = useState<FuelMealDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<FuelReminderPreferences>({
    ...DEFAULT_FUEL_REMINDERS,
  });
  const [reminderBusy, setReminderBusy] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
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
    const selected = data.selection?.date === date ? data.selection.contextKey : undefined;
    const planned = selected === null ? null : chooseFuelContext(contexts, selected ?? null, date);
    return (
      planned ??
      manualFuelContext(
        date,
        data.selection?.manualKind ?? "football",
        data.selection?.manualDurationMin ?? null,
        data.selection?.manualLoad ?? "moderate",
      )
    );
  }, [contexts, data.selection, date]);
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
        quick,
        restrictions: profileRestrictions,
      }),
    [context, timing, now, data, pantry, quick, profileRestrictions],
  );
  const hero = recipes.length ? recipes[recipeIndex % recipes.length] : null;
  const restrictions = useMemo(
    () => [...profileRestrictions, ...foodPreferenceTerms(data.preferences)],
    [profileRestrictions, data.preferences],
  );
  const repeat = data.entries.find(
    (entry) =>
      entry.status === "eaten" &&
      !entry.product &&
      fuelEntryAllowed(entry, data.preferences, restrictions),
  );
  const latest = data.entries.find(
    (e) => e.status === "eaten" && e.eatenAt !== null && localDate(e.eatenAt) === localDate(now),
  );
  const selectedEntry = data.entries.find(
    (e) => e.contextKey === context.key && e.status === "selected",
  );
  const packRecipe = selectedEntry ? null : hero;
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
      const next = { ...incoming, entries };
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
  useEffect(() => {
    setRecipeIndex(0);
  }, [context.key, timing.phase, quick, pantry, data.preferences]);
  const updatePreferences = (patch: Partial<FuelPreferences>) =>
    setData((d) => ({ ...d, preferences: { ...d.preferences, ...patch } }));
  function setTiming(next: FuelTiming) {
    setNow(Date.now());
    setData((d) => ({
      ...d,
      timings: { ...d.timings, [context.key]: next },
      selection: {
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
      },
    }));
    setQuick(false);
    setPantry([]);
    setRecipeIndex(0);
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
    toast.success(`${FOOD_BY_ID[id].label}: pomijam w propozycjach.`, {
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
    const previous = replaceId ? data.entries.find((e) => e.id === replaceId) : null;
    if (
      !previous &&
      !data.entries.some((existing) => existing.id === entry.id) &&
      data.entries.length >= 100
    ) {
      toast.info(
        "Historia ma 100 wpisów. Pobierz kopię i usuń starsze wpisy, żeby zapisać nowy posiłek.",
      );
      return;
    }
    setData((d) => ({
      ...d,
      entries: [entry, ...d.entries.filter((e) => e.id !== (replaceId ?? entry.id))].slice(0, 100),
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
  function quickSave(recipe: FuelRecipe, status: FuelEntry["status"]) {
    if (!fuelEntryAllowed({ lines: recipe.lines }, data.preferences, restrictions)) {
      toast.info("Ten zestaw koliduje z aktualnymi ograniczeniami. Wybierz zamiennik.");
      return;
    }
    const at = Date.now();
    if (at - lastTap.current < 700) return;
    lastTap.current = at;
    const existing = data.entries.find(
      (e) => e.contextKey === context.key && e.recipeId === recipe.id && e.status === "selected",
    );
    const entry = createRecipeEntry(
      recipe,
      context.key,
      status,
      at,
      existing?.id ?? crypto.randomUUID(),
    );
    if (existing) entry.createdAt = existing.createdAt;
    recordEntry(entry, existing?.id);
    if (status === "selected") setPanel(null);
  }
  function openRecipe(recipe: FuelRecipe) {
    setEditingId(null);
    setDraft({
      id: recipe.id,
      title: recipe.title,
      lines: recipe.lines.map((l) => ({ ...l })),
      recipe,
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
        eatenAt: eaten ? (existing?.eatenAt ?? at) : null,
        fraction: eaten ? fraction : 1,
        feedback: null,
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
              : minutes >= 60
                ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`
                : `${minutes} min`;

  return (
    <div className="fuel-workspace fuel-v4">
      <header className="fuel-v4-header">
        <div>
          <h1>Fuel</h1>
          <span>{context.fromPlan ? context.title : "Jedzenie do Twojego treningu"}</span>
        </div>
        <button
          className="fuel-icon-button"
          aria-label="Ustawienia Fuel"
          onClick={() => setPanel("preferences")}
        >
          <SlidersHorizontal size={20} />
        </button>
      </header>
      <main className="fuel-v4-main">
        {!storageOK && (
          <div className="fuel-v4-warning" role="status">
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
        <section className="fuel-v4-time" aria-label="Czas do treningu">
          <div className="fuel-row">
            <div className="fuel-v4-time-value">
              <Clock3 size={21} />
              <div>
                <span>{timing.phase === "before" ? "Do treningu" : "Twój moment"}</span>
                <strong className="tabular-nums">{timingTitle}</strong>
              </div>
            </div>
            <button className="fuel-text-button" onClick={() => setPanel("time")}>
              Zmień
            </button>
          </div>
          {timing.phase === "before" && (
            <>
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
              <button className="fuel-v4-clock-link" onClick={() => setPanel("time")}>
                Wpisz godzinę lub inny czas
              </button>
            </>
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
        <div className="fuel-row fuel-v4-section-title">
          <h2>{timing.phase === "after" ? "Co zjeść po treningu" : "Co zjeść teraz"}</h2>
          {(quick || pantry.length > 0) && (
            <button
              className="fuel-text-button"
              onClick={() => {
                setQuick(false);
                setPantry([]);
              }}
            >
              Wszystkie
            </button>
          )}
        </div>
        {hero ? (
          <article className="fuel-v4-hero" key={`${hero.id}:${timing.phase}`}>
            <div className="fuel-row">
              <h3>{hero.title}</h3>
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
                  size={20}
                  fill={data.preferences.favorites.includes(hero.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <p className="fuel-v4-meta">
              {hero.prepMin} min{hero.noCook ? " · bez gotowania" : ""}
              {hero.portable ? " · do zabrania" : ""}
            </p>
            <ul className="fuel-v4-ingredients">
              {hero.lines.map((line) => (
                <li key={line.foodId}>
                  <span className="fuel-v4-food-dot" aria-hidden="true" />
                  <div>
                    <span>{FOOD_BY_ID[line.foodId].label}</span>
                    <small>{householdPortion(line)}</small>
                  </div>
                  <button
                    className="fuel-v4-ingredient-change"
                    aria-label={`Zmień ${FOOD_BY_ID[line.foodId].label}`}
                    onClick={() => openRecipe(hero)}
                  >
                    <RefreshCw size={15} />
                  </button>
                </li>
              ))}
            </ul>
            {pantry.length > 0 && (
              <p className="fuel-v4-meta">
                Do uzupełnienia:{" "}
                {hero.lines
                  .filter((l) => !pantry.includes(l.foodId))
                  .map((l) => FOOD_BY_ID[l.foodId].label)
                  .join(", ") || "masz wszystkie składniki"}
              </p>
            )}
            <div className="fuel-v4-hero-actions">
              <button
                className="fuel-primary"
                disabled={!loaded}
                onClick={() => quickSave(hero, "eaten")}
              >
                <Check size={17} /> Zjadłem
              </button>
              <button className="fuel-secondary" onClick={() => setPanel("swap")}>
                <RefreshCw size={17} /> Zamień
              </button>
            </div>
            <button className="fuel-v4-details-link" onClick={() => openRecipe(hero)}>
              Porcje i przygotowanie <ChevronRight size={15} />
            </button>
          </article>
        ) : (
          <div className="fuel-v4-hero fuel-v4-empty">
            <h3>Brak pasującego zestawu</h3>
            <p>Możesz zmienić preferencje lub opisać własne jedzenie.</p>
            <button className="fuel-secondary" onClick={() => setPanel("preferences")}>
              Zmień preferencje
            </button>
          </div>
        )}
        <div className="fuel-v4-secondary-actions">
          <button
            onClick={() => {
              setProduct(null);
              setStoreOpen(true);
            }}
          >
            <ShoppingBag size={19} />
            <span>W sklepie</span>
          </button>
          <button
            onClick={() => {
              setText("");
              setPanel("own");
            }}
          >
            <Utensils size={19} />
            <span>Mam swoje jedzenie</span>
          </button>
        </div>
        <div className="fuel-v4-reminder">
          <button onClick={() => setPanel("reminders")}>
            <Bell size={19} />
            <span>{native ? "Przypomnij mi" : "Przypomnienie"}</span>
          </button>
          {native ? (
            <button
              role="switch"
              aria-checked={reminders.enabled}
              aria-label="Przypomnienia Fuel"
              className={`fuel-v4-switch ${reminders.enabled ? "is-on" : ""}`}
              disabled={reminderBusy || !loaded}
              onClick={() => void toggleReminders()}
            >
              <span />
            </button>
          ) : (
            <button className="fuel-text-button" onClick={() => setPanel("reminders")}>
              Kalendarz <ChevronRight size={14} />
            </button>
          )}
        </div>
        {selectedEntry && (
          <button className="fuel-v4-next" onClick={() => setPanel("pack")}>
            <PackageCheck size={19} />
            <div>
              <strong>Na później</strong>
              <span>{selectedEntry.title}</span>
            </div>
            <ChevronRight size={17} />
          </button>
        )}
        {tomorrowMatch && (
          <button className="fuel-v4-next" onClick={() => setPanel("pack")}>
            <PackageCheck size={19} />
            <div>
              <strong>Jutro mecz</strong>
              <span>Przygotuj własny zestaw do zabrania</span>
            </div>
            <ChevronRight size={17} />
          </button>
        )}
        <div className="fuel-v4-foot-actions">
          <button onClick={() => setPanel("history")}>
            <History size={15} /> Historia{latest ? " · zapisano dziś" : ""}
          </button>
          {repeat && (
            <button
              onClick={() => {
                setEditingId(null);
                setDraft({
                  id: repeat.recipeId,
                  title: repeat.title,
                  lines: repeat.lines.map((line) => ({ ...line })),
                  recipe: findRecipe(repeat.recipeId),
                  repeated: true,
                  fraction: repeat.fraction,
                });
              }}
            >
              Powtórz zestaw
            </button>
          )}
        </div>
        <p className="fuel-v4-discreet">
          Propozycje do wysiłku. Porcje i miary są orientacyjne; Fuel nie wylicza dawek z masy
          ciała.
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
        packEntry={selectedEntry ?? null}
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
          });
          setPanel(null);
        }}
        onStore={() => {
          setPanel(null);
          setStoreOpen(true);
        }}
        onQuick={() => {
          setQuick(true);
          setRecipeIndex(0);
          setPanel(null);
        }}
        onNext={() => {
          setRecipeIndex((v) => v + 1);
          setPanel(null);
        }}
        onPantry={() => {
          setPantry(parsed.ids);
          setRecipeIndex(0);
          setPanel(null);
        }}
        persistReminders={persistReminders}
        toggleReminders={() => void toggleReminders()}
        onClose={() => {
          speech.current?.stop();
          setPanel(null);
        }}
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
