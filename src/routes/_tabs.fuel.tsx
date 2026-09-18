import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUp,
  AudioLines,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Droplets,
  Gauge,
  LockKeyhole,
  Mic,
  ScanLine,
  Settings2,
  Square,
  Utensils,
  Waves,
} from "lucide-react";
import { AdaptiveFuelProtocol } from "@/components/fuel/AdaptiveFuelProtocol";
import { FuelPrecisionSheet } from "@/components/fuel/FuelPrecisionSheet";
import { FuelResultSheet } from "@/components/fuel/FuelResultSheet";
import { MealScannerSheet } from "@/components/fuel/MealScannerSheet";
import { evaluateMeal, TIME_BUCKET_MINUTES } from "@/lib/fuel/engine";
import { parseMeal } from "@/lib/fuel/mealParser";
import { athleteFromProfile, findNextSession, sessionFromPlan } from "@/lib/fuel/planAdapter";
import {
  prepareMealPhoto,
  type MealPhotoAnalysis,
  type PreparedMealPhoto,
} from "@/lib/fuel/photoScanner";
import {
  adaptFuelProtocolForMessage,
  buildFuelProtocol,
  completeFuelProtocolItem,
  fuelProtocolProgress,
  fuelProtocolStorageKey,
  mergeFuelProtocolProgress,
  parseTrainingLeadMinutes,
  type FuelProtocol,
  type FuelProtocolStage,
} from "@/lib/fuel/protocol";
import {
  fuelTargetRange,
  recommendMeals,
  type MealRecommendation,
} from "@/lib/fuel/recommendations";
import type { Portion, TimeBucket } from "@/lib/fuel/types";
import {
  availableFixes,
  fuelSignal,
  smallerPortion,
  withExtras,
  withoutHeavy,
  type FixId,
} from "@/lib/fuel/uiModel";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelScreen,
  head: () => ({
    meta: [
      { title: "Fuel – paliwo dopasowane do treningu | BallWise" },
      {
        name: "description",
        content:
          "Prosty, adaptacyjny plan paliwa przed treningiem z opisem głosowym i prywatnym skanerem posiłku.",
      },
    ],
  }),
});

const WINDOWS: { id: TimeBucket; label: string }[] = [
  { id: "lt30", label: "< 30 min" },
  { id: "30_60", label: "30–60 min" },
  { id: "60_120", label: "1–2 h" },
  { id: "120_240", label: "2–4 h" },
  { id: "gt240", label: "> 4 h" },
];

type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function FuelScreen() {
  const { user } = useAuth();
  const { state, todayIso, saveFuelPrecision } = useLoadwise();
  const profile = state.profile;
  const session = useMemo(
    () => sessionFromPlan(findNextSession(state.plan, todayIso), todayIso),
    [state.plan, todayIso],
  );
  const athlete = useMemo(() => athleteFromProfile(profile), [profile]);

  const [bucket, setBucket] = useState<TimeBucket | null>(null);
  const [manualMinutes, setManualMinutes] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [chosenMealId, setChosenMealId] = useState<string | null>(null);
  const [portion, setPortion] = useState<Portion>("normalna");
  const [extras, setExtras] = useState<string[]>([]);
  const [dropHeavy, setDropHeavy] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const [precisionSaving, setPrecisionSaving] = useState(false);
  const [photo, setPhoto] = useState<PreparedMealPhoto | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanAnalysis, setScanAnalysis] = useState<MealPhotoAnalysis | null>(null);
  const [listening, setListening] = useState(false);
  const [protocol, setProtocol] = useState<FuelProtocol | null>(null);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [safetyConfirmed, setSafetyConfirmed] = useState(athlete.allergyStatus !== "unconfirmed");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const countdown = useCountdown(session.minutesToStart);
  const minutes = countdown ?? manualMinutes ?? (bucket ? TIME_BUCKET_MINUTES[bucket] : null);
  const signal = useMemo(() => fuelSignal(session, minutes), [session, minutes]);
  const target = useMemo(
    () => fuelTargetRange({ session, minutes, profile }),
    [session, minutes, profile],
  );
  const recommendations = useMemo(
    () => recommendMeals({ session, minutes, profile, limit: 4 }),
    [session, minutes, profile],
  );
  const activeRecommendation =
    recommendations.find((recommendation) => recommendation.id === chosenMealId) ??
    recommendations[0] ??
    null;

  const meal = useMemo(() => {
    let parsed = parseMeal(text);
    if (dropHeavy) parsed = withoutHeavy(parsed);
    return withExtras(parsed, extras);
  }, [text, dropHeavy, extras]);
  const hasMeal = meal.items.length > 0 || text.trim().length > 2;
  const evaluationAthlete = useMemo(
    () =>
      athlete.allergyStatus === "unconfirmed" && safetyConfirmed
        ? { ...athlete, allergyStatus: "session_confirmed" as const }
        : athlete,
    [athlete, safetyConfirmed],
  );
  const result = useMemo(() => {
    if (!hasMeal || minutes == null || session.kind === "none") return null;
    return evaluateMeal({
      session,
      athlete: evaluationAthlete,
      meal,
      portion,
      timeBucket: bucket,
      onlyThis: false,
    });
  }, [hasMeal, minutes, session, evaluationAthlete, meal, portion, bucket]);
  const fixes = availableFixes(meal, portion);
  const protocolProgress = protocol ? fuelProtocolProgress(protocol) : { done: 0, total: 4 };

  useEffect(() => {
    setSafetyConfirmed(athlete.allergyStatus !== "unconfirmed");
  }, [athlete.allergyStatus]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
    },
    [],
  );

  useEffect(() => {
    if (!activeRecommendation || minutes == null || session.kind === "none") {
      setProtocol(null);
      return;
    }
    const fresh = buildFuelProtocol({
      session,
      minutes,
      recommendation: activeRecommendation,
      target,
    });
    let persisted: FuelProtocol | null = null;
    try {
      const raw = window.localStorage.getItem(fuelProtocolStorageKey(user?.id ?? "guest", session));
      if (raw) persisted = JSON.parse(raw) as FuelProtocol;
    } catch {
      persisted = null;
    }
    setProtocol((current) => mergeFuelProtocolProgress(fresh, current ?? persisted));
  }, [activeRecommendation, minutes, session, target, user?.id]);

  useEffect(() => {
    if (!protocol) return;
    try {
      window.localStorage.setItem(
        fuelProtocolStorageKey(user?.id ?? "guest", session),
        JSON.stringify(protocol),
      );
    } catch {
      // Brak miejsca lub tryb prywatny: protokół nadal działa do zamknięcia karty.
    }
  }, [protocol, session, user?.id]);

  function selectWindow(next: TimeBucket) {
    setManualMinutes(null);
    setBucket(next);
  }

  function evaluateCurrent() {
    if (minutes == null) {
      toast.info("Najpierw wybierz czas do treningu.");
      return;
    }
    if (!hasMeal) {
      toast.info("Opisz posiłek albo wybierz propozycję.");
      return;
    }
    if (athlete.allergyStatus === "unconfirmed" && !safetyConfirmed) {
      toast.info("Potwierdź, że składniki są dla Ciebie bezpieczne.");
      return;
    }
    setResultOpen(true);
  }

  function selectRecommendation(recommendation: MealRecommendation, openResult = true) {
    setChosenMealId(recommendation.id);
    setText(recommendation.text);
    setPortion(recommendation.portion);
    setExtras([]);
    setDropHeavy(false);
    setScanAnalysis(null);
    if (!openResult) return;
    if (minutes == null) toast.info("Propozycja wybrana. Ustaw jeszcze czas do treningu.");
    else if (athlete.allergyStatus === "unconfirmed" && !safetyConfirmed)
      toast.info("Propozycja wybrana. Potwierdź bezpieczeństwo składników.");
    else setResultOpen(true);
  }

  function openProtocol() {
    if (minutes == null) {
      toast.info("Wybierz czas do treningu, aby uruchomić protokół.");
      return;
    }
    if (activeRecommendation && !chosenMealId) selectRecommendation(activeRecommendation, false);
    setProtocolOpen(true);
  }

  function completeProtocol(id: FuelProtocolStage) {
    setProtocol((current) => (current ? completeFuelProtocolItem(current, id) : current));
  }

  function adaptProtocol(message: string) {
    const changedLead = parseTrainingLeadMinutes(message);
    if (changedLead != null) {
      setProtocol((current) =>
        current
          ? {
              ...current,
              lastResponse: `Przeliczyłem plan dla startu za ${formatLead(changedLead)}. Ukończone kroki zostają zaznaczone.`,
            }
          : current,
      );
      setBucket(null);
      setManualMinutes(changedLead);
      return;
    }
    setProtocol((current) =>
      current ? adaptFuelProtocolForMessage(current, message, target) : current,
    );
  }

  function resetProtocol() {
    if (!activeRecommendation || minutes == null) return;
    const fresh = buildFuelProtocol({
      session,
      minutes,
      recommendation: activeRecommendation,
      target,
    });
    setProtocol(fresh);
    try {
      window.localStorage.removeItem(fuelProtocolStorageKey(user?.id ?? "guest", session));
    } catch {
      // Nic do usunięcia.
    }
  }

  function applyFix(id: FixId) {
    if (id === "add_banana")
      setExtras((items) => (items.includes("banan") ? items : [...items, "banan"]));
    if (id === "add_water")
      setExtras((items) => (items.includes("woda") ? items : [...items, "woda"]));
    if (id === "smaller_portion") setPortion((value) => smallerPortion(value));
    if (id === "drop_heavy") setDropHeavy(true);
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    try {
      const prepared = await prepareMealPhoto(file);
      setPhoto(prepared);
      setScannerOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się otworzyć zdjęcia.");
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function closeScanner() {
    setScannerOpen(false);
    setPhoto(null);
  }

  function useScan(scanText: string, scanPortion: Portion, analysis: MealPhotoAnalysis) {
    setText(scanText);
    setPortion(scanPortion);
    setChosenMealId(null);
    setExtras([]);
    setDropHeavy(false);
    setScanAnalysis(analysis);
    closeScanner();
    if (minutes == null) toast.info("Skład gotowy. Wybierz czas do treningu.");
    else if (athlete.allergyStatus === "unconfirmed" && !safetyConfirmed)
      toast.info("Skład gotowy. Potwierdź bezpieczeństwo składników.");
    else setResultOpen(true);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info("Ta przeglądarka nie obsługuje dyktowania. Wpisz posiłek ręcznie.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "pl-PL";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setText(transcript);
        setChosenMealId(null);
        setExtras([]);
        setDropHeavy(false);
        setScanAnalysis(null);
      }
    };
    recognition.onerror = () => toast.error("Nie udało się rozpoznać mowy. Spróbuj ponownie.");
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function savePrecision(enabled: boolean, weightKg: number | null) {
    setPrecisionSaving(true);
    try {
      await saveFuelPrecision(enabled, weightKg);
      toast.success(
        enabled
          ? "Dokładniejszy zakres jest aktywny."
          : "Tryb dokładniejszy wyłączony. Masa została usunięta.",
      );
      setPrecisionOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać ustawienia.");
    } finally {
      setPrecisionSaving(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="premium-flow fuel-premium pb-[calc(env(safe-area-inset-bottom)+7rem)]">
      <header className="flex items-center justify-between px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> BallWise
          </div>
          <h1 className="mt-1 text-[30px] font-medium leading-none tracking-[-0.05em]">Fuel</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPrecisionOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full border border-border/80 bg-card/60 text-muted-foreground active:scale-95"
            aria-label="Ustawienia dokładności Fuel"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <Link
            to="/start"
            className="grid h-10 w-10 place-items-center rounded-full bg-foreground text-background active:scale-95"
            aria-label="Wróć"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="space-y-4 px-5">
        {session.kind === "none" ? (
          <NoSession />
        ) : (
          <>
            <section className="fuel-intelligence relative overflow-hidden rounded-[2rem] border border-border/55 bg-card/60 px-5 pb-5 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <span className="fuel-live-dot h-1.5 w-1.5 rounded-full bg-primary" />
                  {session.dayLabel ?? "Najbliższa jednostka"} · {sessionLabel(session.kind)}
                </div>
                <span className="rounded-full border border-border/80 bg-background/65 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {minutes == null ? "ustaw czas" : formatLead(minutes)}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-[6.25rem_1fr] items-center gap-4">
                <div className="fuel-orbit relative grid h-[6.25rem] w-[6.25rem] place-items-center rounded-full border border-primary/10">
                  <span className="absolute inset-[0.55rem] rounded-full border border-primary/15" />
                  <span className="absolute inset-[1.15rem] rounded-full border border-primary/20" />
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-15px_oklch(0.31_0.07_158/0.8)]">
                    <Waves className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                    {signal.label}
                  </div>
                  <h2 className="mt-1.5 text-[20px] font-medium leading-tight tracking-[-0.04em]">
                    {minutes == null
                      ? "Najpierw ustaw moment"
                      : guidanceTitle(minutes, signal.demand)}
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {minutes == null
                      ? "Jedno wskazanie czasu wystarczy, aby dopasować posiłek i kolejne kroki."
                      : `${session.durationMin ?? "—"} min · ${intensityLabel(session.intensity)} · plan aktualizuje się na bieżąco`}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 divide-x divide-border/80 border-t border-border/70 pt-4">
                <Metric
                  icon={Utensils}
                  label="Węgle"
                  value={`${target.carbMinG}–${target.carbMaxG} g`}
                />
                <Metric
                  icon={Droplets}
                  label="Płyny"
                  value={`${target.fluidMinMl}–${target.fluidMaxMl} ml`}
                />
                <Metric icon={Gauge} label="Komfort" value={comfortLabel(minutes)} />
              </div>
            </section>

            <section aria-label="Czas do treningu" className="py-1">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Start za
                </div>
                {manualMinutes != null && (
                  <span className="text-[10px] font-medium text-primary">
                    zaktualizowano w protokole
                  </span>
                )}
              </div>
              {countdown == null && (
                <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1">
                  {WINDOWS.map((window) => (
                    <button
                      key={window.id}
                      type="button"
                      onClick={() => selectWindow(window.id)}
                      className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition active:scale-95 ${
                        bucket === window.id && manualMinutes == null
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/85 bg-card/55 text-muted-foreground"
                      }`}
                    >
                      {window.label}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[1.45rem] border border-border/80 bg-card/70 p-2.5 shadow-[0_18px_45px_-40px_oklch(0.2_0.02_155/0.8)] backdrop-blur">
              <div className="flex items-center gap-2">
                <label htmlFor="fuel-meal" className="sr-only">
                  Opisz posiłek
                </label>
                <input
                  id="fuel-meal"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setChosenMealId(null);
                    setExtras([]);
                    setDropHeavy(false);
                    setScanAnalysis(null);
                  }}
                  onKeyDown={(event) => event.key === "Enter" && evaluateCurrent()}
                  placeholder="Opisz posiłek jednym zdaniem"
                  className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/65"
                />
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-95 ${listening ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  aria-label={listening ? "Zatrzymaj nagrywanie" : "Opisz głosem"}
                >
                  {listening ? (
                    <Square className="h-3 w-3 fill-current" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground active:scale-95"
                  aria-label="Zeskanuj posiłek"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={evaluateCurrent}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground active:scale-95"
                  aria-label="Oceń posiłek"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => handlePhoto(event.target.files?.[0])}
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <AudioLines className="h-3 w-3" /> tekst · głos · skan AI
                </span>
                <span className="max-w-[13.5rem] text-right">
                  opis i nagranie nie są zapisywane; głos może przetwarzać usługa urządzenia
                </span>
              </div>
            </section>

            {athlete.allergyStatus === "unconfirmed" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 bg-background/40 p-3">
                <input
                  type="checkbox"
                  checked={safetyConfirmed}
                  onChange={(event) => setSafetyConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                />
                <span className="text-[11px] leading-relaxed text-muted-foreground">
                  Potwierdzam, że wybrane składniki są dla mnie bezpieczne. Fuel nie wykrywa
                  alergenów.
                </span>
              </label>
            )}

            {activeRecommendation && (
              <section className="rounded-[1.65rem] bg-foreground px-5 py-5 text-background shadow-[0_22px_48px_-34px_oklch(0.12_0.02_160/0.8)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.17em] text-background/55">
                    Najlepszy kierunek
                  </span>
                  <span className="rounded-full bg-background/10 px-2.5 py-1 text-[10px] text-background/65">
                    {activeRecommendation.prepMinutes} min
                  </span>
                </div>
                <h2 className="mt-3 text-[19px] font-medium leading-tight tracking-[-0.035em]">
                  {activeRecommendation.title}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-background/58">
                  {activeRecommendation.subtitle}. Dopasowane do czasu i obciążenia najbliższej
                  jednostki.
                </p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-background/10 pt-4">
                  <span className="text-[10px] text-background/50">
                    {target.precise ? "zakres spersonalizowany" : "bez dodatkowych danych"}
                  </span>
                  <button
                    type="button"
                    onClick={() => selectRecommendation(activeRecommendation)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-background px-4 py-2 text-xs font-semibold text-foreground active:scale-95"
                  >
                    Sprawdź porcję <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </section>
            )}

            <button
              type="button"
              onClick={openProtocol}
              className="group flex w-full items-center gap-4 rounded-[1.5rem] border border-primary/18 bg-primary/[0.045] p-4 text-left transition active:scale-[0.99]"
            >
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-primary/20 text-primary">
                <span className="fuel-live-dot absolute h-2 w-2 rounded-full bg-primary" />
                <span className="absolute inset-1.5 rounded-full border border-primary/10" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
                  Adaptive Fuel Protocol
                  {protocolProgress.done > 0 && <Check className="h-3 w-3" />}
                </span>
                <span className="mt-1 block text-[15px] font-medium tracking-[-0.02em]">
                  {protocolProgress.done > 0
                    ? `${protocolProgress.done}/${protocolProgress.total} kroków wykonanych`
                    : "Prowadź paliwo aż do regeneracji"}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Reaguje na niepełny posiłek i zmianę godziny startu.
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5" />
            </button>

            <section className="pt-1">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-medium tracking-[-0.02em]">Inne dobre opcje</h2>
                <span className="text-[10px] text-muted-foreground">z Twoich ograniczeń</span>
              </div>
              <div className="divide-y divide-border/70 rounded-[1.35rem] border border-border/75 bg-card/45 px-4">
                {recommendations.slice(1, 4).map((recommendation) => (
                  <button
                    key={recommendation.id}
                    type="button"
                    onClick={() => selectRecommendation(recommendation)}
                    className="flex w-full items-center gap-3 py-3.5 text-left active:opacity-65"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/[0.07] text-primary">
                      <Utensils className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {recommendation.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {recommendation.highlight} · {recommendation.prepMinutes} min
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => setPrecisionOpen(true)}
              className="flex w-full items-center gap-3 px-1 py-2 text-left"
            >
              <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                {profile.fuelPrecisionEnabled
                  ? "Dokładniejszy zakres aktywny · masę możesz usunąć jednym kliknięciem."
                  : "Dokładniejszy zakres jest opcjonalny. Fuel działa bez masy i wzrostu."}
              </span>
              <span className="text-[11px] font-medium text-primary">Ustaw</span>
            </button>

            <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
              Orientacyjne wsparcie żywieniowe, nie diagnoza ani indywidualna porada medyczna.
            </p>
          </>
        )}
      </main>

      <FuelPrecisionSheet
        open={precisionOpen}
        age={profile.age}
        enabled={Boolean(profile.fuelPrecisionEnabled)}
        currentWeightKg={profile.weightKg ?? null}
        saving={precisionSaving}
        onClose={() => setPrecisionOpen(false)}
        onSave={savePrecision}
      />
      <MealScannerSheet
        open={scannerOpen}
        photo={photo}
        session={session}
        onClose={closeScanner}
        onUse={useScan}
      />
      <FuelResultSheet
        open={resultOpen}
        result={result}
        target={target}
        scan={scanAnalysis}
        fixes={fixes}
        onFix={applyFix}
        onClose={() => setResultOpen(false)}
      />
      <AdaptiveFuelProtocol
        open={protocolOpen}
        protocol={protocol}
        onClose={() => setProtocolOpen(false)}
        onComplete={completeProtocol}
        onMessage={adaptProtocol}
        onReset={resetProtocol}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Droplets;
  label: string;
  value: string;
}) {
  return (
    <div className="px-2 first:pl-0 last:pr-0">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3 w-3" strokeWidth={1.8} /> {label}
      </div>
      <div className="mt-1 truncate text-[12px] font-medium tracking-[-0.01em]">{value}</div>
    </div>
  );
}

function NoSession() {
  return (
    <section className="rounded-[1.5rem] border border-border bg-card/70 p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        <ScanLine className="h-4 w-4" /> Brak jednostki
      </div>
      <h2 className="mt-3 text-xl font-medium tracking-[-0.035em]">
        Fuel potrzebuje najbliższego treningu
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Dodaj jednostkę do planu, a Fuel dopasuje czas, porcję i kolejne kroki.
      </p>
      <Link
        to="/plan"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Przejdź do planu <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

function sessionLabel(kind: string): string {
  if (kind === "match") return "mecz";
  if (kind === "speed") return "szybkość";
  if (kind === "strength") return "siła";
  if (kind === "endurance") return "wytrzymałość";
  if (kind === "recovery") return "regeneracja";
  return "trening piłkarski";
}

function intensityLabel(intensity: string | null): string {
  if (intensity === "wysoka") return "wysoka intensywność";
  if (intensity === "niska") return "niska intensywność";
  return "umiarkowana intensywność";
}

function guidanceTitle(minutes: number, demand: string): string {
  if (minutes < 30) return "Lekko, szybko, bez przeciążenia";
  if (minutes < 90) return "Proste paliwo i spokojny brzuch";
  if (demand === "wysokie") return "Pełny posiłek, czysta energia";
  return "Równa energia na całą jednostkę";
}

function comfortLabel(minutes: number | null): string {
  if (minutes == null) return "po czasie";
  if (minutes < 30) return "bardzo lekko";
  if (minutes < 90) return "lekko";
  return "swobodnie";
}

function useCountdown(startMinutes: number | null): number | null {
  const [left, setLeft] = useState<number | null>(startMinutes);
  useEffect(() => {
    setLeft(startMinutes);
    if (startMinutes == null) return;
    const id = window.setInterval(() => {
      setLeft((value) => (value == null ? value : Math.max(0, value - 1)));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [startMinutes]);
  return left;
}

function formatLead(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${rest ? `${rest} min` : ""}`.trim() : `${rest} min`;
}
