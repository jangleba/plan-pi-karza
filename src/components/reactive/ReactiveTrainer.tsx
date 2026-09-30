import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  Eye,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shuffle,
  Smartphone,
  Sparkles,
  Square,
  Vibrate,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COLORS,
  DEFAULT_REACTIVE_SETTINGS,
  DIRECTIONS,
  createReactiveCue,
  finishReactiveStats,
  initialReactiveStats,
  nextCueDelayMs,
  normalizeReactiveSettings,
  recordReactiveCue,
  shouldChangeDecision,
} from "@/lib/reactive-training/engine";
import {
  loadReactiveCustomSets,
  saveReactiveCustomSets,
} from "@/lib/reactive-training/storage";
import type {
  ReactiveColor,
  ReactiveCue,
  ReactiveCustomAction,
  ReactiveCustomSet,
  ReactiveDirection,
  ReactiveLevel,
  ReactiveMode,
  ReactiveSessionStats,
  ReactiveSettings,
} from "@/lib/reactive-training/types";

type Phase = "setup" | "countdown" | "running" | "paused" | "summary";

interface ReactiveTrainerProps {
  storageKey: string;
  onBack?: () => void;
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

const MODE_OPTIONS: Array<{
  id: ReactiveMode;
  title: string;
  description: string;
}> = [
  { id: "directions", title: "Kierunki", description: "Duża strzałka wyznacza akcję." },
  { id: "colors", title: "Kolory", description: "Każdy kolor oznacza Twoją akcję." },
  { id: "opponent", title: "Przeciwnik", description: "Czerwony sektor jest zamknięty." },
  { id: "combo", title: "Kierunek + kolor", description: "Dwie informacje w jednej decyzji." },
  { id: "flash", title: "Krótki błysk", description: "Strzałka znika po krótkiej chwili." },
  { id: "sequence", title: "Sekwencja", description: "Zapamiętaj kilka kierunków po kolei." },
  { id: "custom", title: "Własne komendy", description: "Zapisz własne znaczenie bodźców." },
];

const LEVEL_OPTIONS: Array<{ id: ReactiveLevel; title: string; note: string }> = [
  { id: "basic", title: "Podstawowy", note: "Zmiana decyzji ok. 5%" },
  { id: "intermediate", title: "Średni", note: "Zmiana decyzji ok. 10%" },
  { id: "advanced", title: "Zaawansowany", note: "Zmiana decyzji ok. 20%" },
];

const DIRECTION_LABELS: Record<ReactiveDirection, string> = {
  left: "Lewo",
  right: "Prawo",
  forward: "Przód",
  back: "Tył",
};

const COLOR_LABELS: Record<ReactiveColor, string> = {
  blue: "Niebieski",
  green: "Zielony",
  yellow: "Żółty",
  red: "Czerwony",
};

const COLOR_HEX: Record<ReactiveColor, string> = {
  blue: "#1877f2",
  green: "#16a34a",
  yellow: "#facc15",
  red: "#ef4444",
};

const COLOR_TEXT: Record<ReactiveColor, string> = {
  blue: "#ffffff",
  green: "#ffffff",
  yellow: "#111827",
  red: "#ffffff",
};

const DIRECTION_SYMBOL: Record<ReactiveDirection, string> = {
  left: "←",
  right: "→",
  forward: "↑",
  back: "↓",
};

function formatTime(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toggleValue<T extends string>(values: T[], value: T, minimum = 2): T[] {
  if (values.includes(value)) {
    return values.length <= minimum ? values : values.filter((item) => item !== value);
  }
  return [...values, value];
}

function DirectionIcon({ direction, className = "h-5 w-5" }: { direction: ReactiveDirection; className?: string }) {
  if (direction === "left") return <ArrowLeft className={className} />;
  if (direction === "right") return <ArrowRight className={className} />;
  if (direction === "forward") return <ArrowUp className={className} />;
  return <ArrowDown className={className} />;
}

function CueDisplay({ cue, visible }: { cue: ReactiveCue; visible: boolean }) {
  const background = cue.color ? COLOR_HEX[cue.color] : "#05070a";
  const foreground = cue.color ? COLOR_TEXT[cue.color] : "#ffffff";

  if (!visible) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white">
        <Eye className="h-12 w-12 opacity-20" />
      </div>
    );
  }

  if (cue.mode === "opponent" && cue.blockedDirection) {
    const sectorClass: Record<ReactiveDirection, string> = {
      left: "left-0 top-0 h-full w-[42%]",
      right: "right-0 top-0 h-full w-[42%]",
      forward: "left-0 top-0 h-[42%] w-full",
      back: "bottom-0 left-0 h-[42%] w-full",
    };
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#05070a] text-white">
        <div className={`absolute ${sectorClass[cue.blockedDirection]} bg-[#ef3131]`} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <X className="h-28 w-28 stroke-[3] drop-shadow-2xl sm:h-40 sm:w-40" />
          <p className="mt-5 text-3xl font-black uppercase tracking-[0.16em] sm:text-5xl">
            Zamknięte
          </p>
          <p className="mt-2 text-lg font-semibold opacity-75">
            {DIRECTION_LABELS[cue.blockedDirection]}
          </p>
        </div>
      </div>
    );
  }

  if (cue.mode === "sequence") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#05070a] px-5 text-white">
        <p className="mb-8 text-sm font-bold uppercase tracking-[0.22em] text-white/55">Sekwencja</p>
        <div className="flex max-w-full flex-wrap items-center justify-center gap-3 sm:gap-5">
          {cue.sequence.map((direction, index) => (
            <div
              key={`${direction}-${index}`}
              className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-white text-5xl font-black text-black sm:h-28 sm:w-28 sm:text-7xl"
            >
              {DIRECTION_SYMBOL[direction]}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cue.mode === "custom" && cue.customAction) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: background, color: foreground }}
      >
        {cue.customAction.direction && (
          <div className="text-[9rem] font-black leading-none sm:text-[13rem]">
            {DIRECTION_SYMBOL[cue.customAction.direction]}
          </div>
        )}
        <p className="max-w-3xl text-5xl font-black uppercase leading-tight tracking-tight sm:text-7xl">
          {cue.customAction.label}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: background, color: foreground }}
    >
      {cue.direction ? (
        <div className="select-none text-[13rem] font-black leading-[0.8] drop-shadow-2xl sm:text-[19rem]">
          {DIRECTION_SYMBOL[cue.direction]}
        </div>
      ) : cue.color ? (
        <div className="h-44 w-44 rounded-full border-[14px] border-current shadow-2xl sm:h-64 sm:w-64" />
      ) : null}
      {cue.isDecisionChange && (
        <p className="mt-8 rounded-full bg-black/25 px-6 py-2 text-2xl font-black uppercase tracking-[0.15em]">
          Zmiana
        </p>
      )}
    </div>
  );
}

function DistributionBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value} · {percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function ReactiveTrainer({ storageKey, onBack }: ReactiveTrainerProps) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [settings, setSettings] = useState<ReactiveSettings>(DEFAULT_REACTIVE_SETTINGS);
  const [customSets, setCustomSets] = useState<ReactiveCustomSet[]>([]);
  const [countdown, setCountdown] = useState(10);
  const [cue, setCue] = useState<ReactiveCue | null>(null);
  const [cueVisible, setCueVisible] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stats, setStats] = useState<ReactiveSessionStats>(() => initialReactiveStats(DEFAULT_REACTIVE_SETTINGS));
  const [setupError, setSetupError] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customDirection, setCustomDirection] = useState<ReactiveDirection | "">("");
  const [customColor, setCustomColor] = useState<ReactiveColor | "">("");
  const [draftActions, setDraftActions] = useState<ReactiveCustomAction[]>([]);
  const startedAtMs = useRef(0);
  const pausedAtSec = useRef(0);
  const statsRef = useRef(stats);
  const cueRef = useRef<ReactiveCue | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    setCustomSets(loadReactiveCustomSets(storageKey));
  }, [storageKey]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    cueRef.current = cue;
  }, [cue]);

  const normalized = useMemo(() => normalizeReactiveSettings(settings), [settings]);
  const activeCustomSet = useMemo(
    () => customSets.find((set) => set.id === normalized.customSetId) ?? null,
    [customSets, normalized.customSetId],
  );

  async function keepScreenAwake() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      wakeLockRef.current = await nav.wakeLock?.request("screen") ?? null;
    } catch {
      wakeLockRef.current = null;
    }
  }

  async function releaseScreen() {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // Sesja jest już zakończona; brak Wake Lock nie wpływa na zapis statystyk.
    }
    wakeLockRef.current = null;
  }

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // iOS może odmówić pełnego ekranu; widok nadal zajmuje całe okno aplikacji.
    }
  }

  async function leaveFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Zakończenie treningu nie zależy od API pełnego ekranu.
    }
  }

  function startCountdown() {
    if (normalized.mode === "custom" && (!activeCustomSet || activeCustomSet.actions.length < 2)) {
      setSetupError("Wybierz zestaw z co najmniej dwiema własnymi komendami.");
      return;
    }
    setSetupError(null);
    setSettings(normalized);
    setCountdown(10);
    setCue(null);
    setElapsedSec(0);
    pausedAtSec.current = 0;
    const nextStats = initialReactiveStats(normalized);
    statsRef.current = nextStats;
    setStats(nextStats);
    setPhase("countdown");
    void enterFullscreen();
    void keepScreenAwake();
  }

  function finishSession() {
    const elapsed = phase === "paused"
      ? pausedAtSec.current
      : Math.max(pausedAtSec.current, Math.round((Date.now() - startedAtMs.current) / 1_000));
    const finalStats = finishReactiveStats(statsRef.current, elapsed);
    statsRef.current = finalStats;
    setStats(finalStats);
    setElapsedSec(elapsed);
    setPhase("summary");
    void releaseScreen();
    void leaveFullscreen();
  }

  function pauseSession() {
    pausedAtSec.current = elapsedSec;
    setPhase("paused");
  }

  function resumeSession() {
    startedAtMs.current = Date.now() - pausedAtSec.current * 1_000;
    setPhase("running");
    void keepScreenAwake();
  }

  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          startedAtMs.current = Date.now();
          setPhase("running");
          return 0;
        }
        return current - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") return;
    let cancelled = false;
    const timers: number[] = [];

    const emitCue = (decisionChange: boolean) => {
      if (cancelled) return;
      const next = createReactiveCue({
        settings: normalized,
        stats: statsRef.current,
        customSet: activeCustomSet,
        previous: cueRef.current,
        decisionChange,
      });
      cueRef.current = next;
      setCue(next);
      setCueVisible(true);
      const nextStats = recordReactiveCue(statsRef.current, next);
      statsRef.current = nextStats;
      setStats(nextStats);
      if (normalized.vibration && typeof navigator.vibrate === "function") navigator.vibrate(60);
      if (normalized.mode === "flash") {
        timers.push(window.setTimeout(() => setCueVisible(false), normalized.flashDurationMs));
      }
    };

    const scheduleWindow = () => {
      const delay = nextCueDelayMs(normalized);
      if (shouldChangeDecision(normalized.level)) {
        timers.push(window.setTimeout(() => emitCue(true), Math.round(delay * 0.62)));
      }
      timers.push(window.setTimeout(() => {
        emitCue(false);
        scheduleWindow();
      }, delay));
    };

    emitCue(false);
    scheduleWindow();
    const elapsedTimer = window.setInterval(() => {
      const nextElapsed = Math.max(0, Math.round((Date.now() - startedAtMs.current) / 1_000));
      setElapsedSec(nextElapsed);
      if (normalized.durationMin != null && nextElapsed >= normalized.durationMin * 60) {
        pausedAtSec.current = nextElapsed;
        const finalStats = finishReactiveStats(statsRef.current, nextElapsed);
        statsRef.current = finalStats;
        setStats(finalStats);
        setPhase("summary");
        void releaseScreen();
        void leaveFullscreen();
      }
    }, 1_000);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(elapsedTimer);
    };
  }, [activeCustomSet, normalized, phase]);

  useEffect(() => () => {
    void releaseScreen();
  }, []);

  function addDraftAction() {
    const label = customLabel.trim();
    if (!label) return;
    setDraftActions((items) => [
      ...items,
      {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${items.length}`,
        label,
        direction: customDirection || null,
        color: customColor || null,
      },
    ]);
    setCustomLabel("");
    setCustomDirection("");
    setCustomColor("");
  }

  function saveCustomSet() {
    const name = customName.trim();
    if (!name || draftActions.length < 2) {
      setSetupError("Nadaj nazwę i dodaj co najmniej dwie komendy.");
      return;
    }
    const nextSet: ReactiveCustomSet = {
      id: crypto.randomUUID?.() ?? `${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      actions: draftActions,
    };
    const nextSets = [...customSets, nextSet];
    setCustomSets(nextSets);
    saveReactiveCustomSets(storageKey, nextSets);
    setSettings((current) => ({ ...current, customSetId: nextSet.id }));
    setCustomName("");
    setDraftActions([]);
    setSetupError(null);
  }

  if (phase === "countdown") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#05070a] px-6 text-center text-white">
        <Smartphone className="h-12 w-12 text-white/55" />
        <p className="mt-5 text-sm font-bold uppercase tracking-[0.22em] text-white/55">Ustaw telefon pionowo</p>
        <div className="mt-3 text-[10rem] font-black leading-none tabular-nums">{countdown}</div>
        <p className="mt-5 max-w-sm text-lg text-white/70">Oprzyj telefon stabilnie, zwiększ jasność ekranu i odejdź na wybraną odległość.</p>
        <button type="button" onClick={() => { setPhase("setup"); void releaseScreen(); void leaveFullscreen(); }} className="mt-10 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/70">
          Anuluj
        </button>
      </div>
    );
  }

  if (phase === "running" || phase === "paused") {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        {cue ? <CueDisplay cue={cue} visible={cueVisible} /> : <div className="h-full bg-black" />}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent px-4 pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
          <div>
            <p className="text-2xl font-black tabular-nums">{formatTime(elapsedSec)}</p>
            <p className="text-xs font-semibold text-white/65">{stats.cueCount} bodźców · {stats.decisionChanges} zmian</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={phase === "paused" ? resumeSession : pauseSession} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              {phase === "paused" ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
            </button>
            <button type="button" onClick={finishSession} className="flex h-12 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black">
              <Square className="h-4 w-4 fill-current" /> Zakończ
            </button>
          </div>
        </div>
        {phase === "paused" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 text-white backdrop-blur-sm">
            <div className="text-center">
              <Pause className="mx-auto h-14 w-14" />
              <p className="mt-4 text-3xl font-black">Pauza</p>
              <button type="button" onClick={resumeSession} className="mt-6 rounded-full bg-white px-8 py-3 font-bold text-black">Wznów</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "summary") {
    const directionTotal = Object.values(stats.directionCounts).reduce((sum, value) => sum + value, 0);
    const colorTotal = Object.values(stats.colorCounts).reduce((sum, value) => sum + value, 0);
    return (
      <div className="app-shell min-h-screen pb-10">
        <div className="px-5 pt-[calc(1.5rem+env(safe-area-inset-top))]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Check className="h-6 w-6" /></div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-primary">Sesja zakończona</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Uczciwe podsumowanie</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Telefon raportuje wyłącznie wygenerowane bodźce. Nie udaje, że zna czas reakcji ani jakość wykonania.</p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 px-5">
          <div className="rounded-2xl bg-secondary/70 p-4"><p className="text-2xl font-black tabular-nums">{formatTime(stats.elapsedSec)}</p><p className="mt-1 text-[11px] text-muted-foreground">czas</p></div>
          <div className="rounded-2xl bg-secondary/70 p-4"><p className="text-2xl font-black tabular-nums">{stats.cueCount}</p><p className="mt-1 text-[11px] text-muted-foreground">bodźce</p></div>
          <div className="rounded-2xl bg-secondary/70 p-4"><p className="text-2xl font-black tabular-nums">{stats.decisionChanges}</p><p className="mt-1 text-[11px] text-muted-foreground">zmiany</p></div>
        </div>

        {directionTotal > 0 && (
          <div className="mx-5 mt-4 rounded-3xl border border-border bg-card p-5">
            <h2 className="text-sm font-bold">Rozkład kierunków</h2>
            <div className="mt-4 space-y-3">
              {DIRECTIONS.map((direction) => <DistributionBar key={direction} label={DIRECTION_LABELS[direction]} value={stats.directionCounts[direction]} total={directionTotal} color="#316fd1" />)}
            </div>
          </div>
        )}

        {colorTotal > 0 && (
          <div className="mx-5 mt-4 rounded-3xl border border-border bg-card p-5">
            <h2 className="text-sm font-bold">Rozkład kolorów</h2>
            <div className="mt-4 space-y-3">
              {COLORS.map((color) => <DistributionBar key={color} label={COLOR_LABELS[color]} value={stats.colorCounts[color]} total={colorTotal} color={COLOR_HEX[color]} />)}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2 px-5">
          <Button className="h-12 flex-1 rounded-2xl" onClick={startCountdown}><RotateCcw className="mr-2 h-4 w-4" /> Powtórz</Button>
          <Button variant="outline" className="h-12 flex-1 rounded-2xl" onClick={() => setPhase("setup")}>Ustawienia</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen pb-12">
      <div className="px-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        {onBack && (
          <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"><ChevronLeft className="h-4 w-4" /> Plan</button>
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">BallWise Lab</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Trener reakcji</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Telefon pokazuje bodziec. Ty przypisujesz mu własną akcję z piłką.</p>
          </div>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
        </div>
      </div>

      <div className="mt-7 space-y-7 px-5">
        <section>
          <div className="mb-3 flex items-end justify-between"><h2 className="text-sm font-bold">1. Wybierz bodziec</h2><span className="text-[11px] text-muted-foreground">7 trybów</span></div>
          <div className="grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((mode) => (
              <button key={mode.id} type="button" onClick={() => setSettings((current) => ({
                ...current,
                mode: mode.id,
                level: mode.id === "combo" && current.level === "basic" ? "intermediate" : current.level,
              }))} className={`min-h-24 rounded-2xl border p-3 text-left transition-colors ${settings.mode === mode.id ? "border-primary bg-primary/8 ring-1 ring-primary/30" : "border-border bg-card"}`}>
                <p className="text-sm font-bold">{mode.title}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{mode.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold">2. Poziom decyzji</h2>
          <div className="grid grid-cols-3 gap-2">
            {LEVEL_OPTIONS.map((level) => (
              <button
                key={level.id}
                type="button"
                disabled={settings.mode === "combo" && level.id === "basic"}
                onClick={() => setSettings((current) => ({ ...current, level: level.id }))}
                className={`rounded-2xl border px-2 py-3 text-center disabled:cursor-not-allowed disabled:opacity-35 ${settings.level === level.id ? "border-primary bg-primary/8" : "border-border bg-card"}`}
              >
                <p className="text-xs font-bold">{level.title}</p><p className="mt-1 text-[10px] leading-tight text-muted-foreground">{level.note}</p>
              </button>
            ))}
          </div>
        </section>

        {(settings.mode === "directions" || settings.mode === "opponent" || settings.mode === "combo" || settings.mode === "flash" || settings.mode === "sequence") && (
          <section>
            <h2 className="mb-3 text-sm font-bold">Aktywne kierunki</h2>
            <div className="grid grid-cols-4 gap-2">
              {DIRECTIONS.map((direction) => {
                const active = settings.activeDirections.includes(direction);
                return <button key={direction} type="button" onClick={() => setSettings((current) => ({ ...current, activeDirections: toggleValue(current.activeDirections, direction) }))} className={`flex flex-col items-center gap-1 rounded-2xl border py-3 ${active ? "border-primary bg-primary/8 text-primary" : "border-border bg-card text-muted-foreground"}`}><DirectionIcon direction={direction} /><span className="text-[10px] font-semibold">{DIRECTION_LABELS[direction]}</span></button>;
              })}
            </div>
          </section>
        )}

        {(settings.mode === "colors" || settings.mode === "combo") && (
          <section>
            <h2 className="mb-3 text-sm font-bold">Aktywne kolory</h2>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((color) => {
                const active = settings.activeColors.includes(color);
                return <button key={color} type="button" onClick={() => setSettings((current) => ({ ...current, activeColors: toggleValue(current.activeColors, color) }))} className={`rounded-2xl border p-2 ${active ? "border-primary bg-primary/8" : "border-border bg-card opacity-45"}`}><span className="mx-auto block h-7 w-7 rounded-full" style={{ backgroundColor: COLOR_HEX[color] }} /><span className="mt-1 block text-[9px] font-semibold">{COLOR_LABELS[color]}</span></button>;
              })}
            </div>
          </section>
        )}

        {settings.mode === "custom" && (
          <section className="rounded-3xl border border-border bg-card p-4">
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold">Własne komendy</h2><span className="text-[10px] text-muted-foreground">zapis tylko na tym urządzeniu</span></div>
            {customSets.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{customSets.map((set) => <button key={set.id} type="button" onClick={() => setSettings((current) => ({ ...current, customSetId: set.id }))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${settings.customSetId === set.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{set.name}</button>)}</div>}
            <div className="mt-4 space-y-2">
              <input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Nazwa zestawu, np. Drybling 1v1" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
              <div className="grid grid-cols-2 gap-2">
                <select value={customDirection} onChange={(event) => setCustomDirection(event.target.value as ReactiveDirection | "")} className="h-11 rounded-xl border border-input bg-background px-3 text-sm"><option value="">Bez strzałki</option>{DIRECTIONS.map((direction) => <option key={direction} value={direction}>{DIRECTION_LABELS[direction]}</option>)}</select>
                <select value={customColor} onChange={(event) => setCustomColor(event.target.value as ReactiveColor | "")} className="h-11 rounded-xl border border-input bg-background px-3 text-sm"><option value="">Bez koloru</option>{COLORS.map((color) => <option key={color} value={color}>{COLOR_LABELS[color]}</option>)}</select>
              </div>
              <div className="flex gap-2"><input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Komenda, np. zwód + wyjście" className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" /><Button type="button" variant="outline" className="h-11 rounded-xl" onClick={addDraftAction}><Plus className="h-4 w-4" /></Button></div>
            </div>
            {draftActions.length > 0 && <div className="mt-3 space-y-1">{draftActions.map((action) => <div key={action.id} className="flex items-center justify-between rounded-xl bg-secondary/65 px-3 py-2 text-xs"><span>{action.label}</span><button type="button" onClick={() => setDraftActions((items) => items.filter((item) => item.id !== action.id))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button></div>)}</div>}
            <Button type="button" variant="outline" className="mt-3 w-full rounded-xl" onClick={saveCustomSet}><Save className="mr-2 h-4 w-4" /> Zapisz zestaw</Button>
          </section>
        )}

        <section className="rounded-3xl bg-secondary/55 p-4">
          <h2 className="text-sm font-bold">3. Rytm</h2>
          <div className="mt-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">Zmiana co</span><span className="text-lg font-black tabular-nums">{settings.intervalSec} s</span></div>
          <input type="range" min={2} max={15} step={1} value={settings.intervalSec} onChange={(event) => setSettings((current) => ({ ...current, intervalSec: Number(event.target.value) }))} className="mt-2 w-full accent-[var(--primary)]" />
          <button type="button" onClick={() => setSettings((current) => ({ ...current, randomTiming: !current.randomTiming }))} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-left"><span className="flex items-center gap-2 text-sm font-semibold"><Shuffle className="h-4 w-4" /> Losowy rytm</span><span className={`h-6 w-10 rounded-full p-1 transition-colors ${settings.randomTiming ? "bg-primary" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${settings.randomTiming ? "translate-x-4" : ""}`} /></span></button>
          {settings.mode === "flash" && <div className="mt-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Widoczność błysku</span><span className="text-sm font-bold">{(settings.flashDurationMs / 1_000).toFixed(1)} s</span></div><input type="range" min={500} max={2000} step={100} value={settings.flashDurationMs} onChange={(event) => setSettings((current) => ({ ...current, flashDurationMs: Number(event.target.value) }))} className="mt-2 w-full accent-[var(--primary)]" /></div>}
          {settings.mode === "sequence" && <div className="mt-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Długość sekwencji</span><span className="text-sm font-bold">{settings.sequenceLength}</span></div><input type="range" min={2} max={8} step={1} value={settings.sequenceLength} onChange={(event) => setSettings((current) => ({ ...current, sequenceLength: Number(event.target.value) }))} className="mt-2 w-full accent-[var(--primary)]" /></div>}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold">4. Czas fragmentu</h2>
          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 15, 20].map((minutes) => <button key={minutes} type="button" onClick={() => setSettings((current) => ({ ...current, durationMin: minutes }))} className={`rounded-2xl border py-3 text-sm font-bold ${settings.durationMin === minutes ? "border-primary bg-primary/8 text-primary" : "border-border bg-card"}`}>{minutes} min</button>)}
            <button type="button" onClick={() => setSettings((current) => ({ ...current, durationMin: null }))} className={`rounded-2xl border py-3 text-sm font-bold ${settings.durationMin === null ? "border-primary bg-primary/8 text-primary" : "border-border bg-card"}`}>Bez limitu</button>
            <label className={`flex items-center justify-center rounded-2xl border px-2 ${settings.durationMin != null && ![5, 10, 15, 20].includes(settings.durationMin) ? "border-primary bg-primary/8" : "border-border bg-card"}`}><input type="number" min={1} max={180} placeholder="własny" value={settings.durationMin != null && ![5, 10, 15, 20].includes(settings.durationMin) ? settings.durationMin : ""} onChange={(event) => setSettings((current) => ({ ...current, durationMin: Number(event.target.value) || 1 }))} className="w-full bg-transparent text-center text-sm font-bold outline-none" /></label>
          </div>
        </section>

        <button type="button" onClick={() => setSettings((current) => ({ ...current, vibration: !current.vibration }))} className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left"><span className="flex items-center gap-2 text-sm font-semibold"><Vibrate className="h-4 w-4" /> Krótka wibracja przy nowym bodźcu</span><span className={`h-6 w-10 rounded-full p-1 transition-colors ${settings.vibration ? "bg-primary" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${settings.vibration ? "translate-x-4" : ""}`} /></span></button>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground"><span className="font-bold text-foreground">Jak używać:</span> ustaw telefon pionowo, wybierz własne ćwiczenie z piłką i reaguj na ekran. Moduł możesz uruchamiać w kilku fragmentach całej, minimum 30-minutowej sesji.</div>

        {setupError && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{setupError}</p>}

        <Button type="button" onClick={startCountdown} className="h-14 w-full rounded-2xl text-base font-bold"><Maximize2 className="mr-2 h-5 w-5" /> Uruchom bodźce</Button>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><Zap className="h-3.5 w-3.5" /> 10 sekund na ustawienie telefonu · bez komend głosowych</div>
      </div>
    </div>
  );
}
