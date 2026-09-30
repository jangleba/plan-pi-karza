import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  Eye,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceGroup, Field, MetricGroup } from "@/components/ui/app-ui";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
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
import { loadReactiveCustomSets, saveReactiveCustomSets } from "@/lib/reactive-training/storage";
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

function DirectionIcon({
  direction,
  className = "h-5 w-5",
}: {
  direction: ReactiveDirection;
  className?: string;
}) {
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
          <X className="h-28 w-28 stroke-[3]  sm:h-40 sm:w-40" />
          <p className="mt-5 text-3xl font-semibold sm:text-5xl">Zamknięte</p>
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
        <p className="mb-8 text-sm font-medium text-white/55">Sekwencja</p>
        <div className="flex max-w-full flex-wrap items-center justify-center gap-3 sm:gap-5">
          {cue.sequence.map((direction, index) => (
            <div
              key={`${direction}-${index}`}
              className="flex h-20 w-20 items-center justify-center rounded-lg bg-white text-5xl font-semibold text-black sm:h-28 sm:w-28 sm:text-7xl"
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
          <div className="text-[clamp(4rem,30vh,13rem)] font-semibold leading-none">
            {DIRECTION_SYMBOL[cue.customAction.direction]}
          </div>
        )}
        <p className="max-w-3xl text-[clamp(1.5rem,6vw,4.5rem)] font-semibold leading-tight">
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
        <div className="select-none text-[clamp(5rem,42vh,19rem)] font-semibold leading-[0.8]">
          {DIRECTION_SYMBOL[cue.direction]}
        </div>
      ) : cue.color ? (
        <div className="h-44 w-44 rounded-full border-[14px] border-current  sm:h-64 sm:w-64" />
      ) : null}
      {cue.isDecisionChange && (
        <p className="mt-8 rounded-full bg-black/25 px-6 py-2 text-2xl font-semibold">Zmiana</p>
      )}
    </div>
  );
}

function DistributionBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value} · {percent}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
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
  const [stats, setStats] = useState<ReactiveSessionStats>(() =>
    initialReactiveStats(DEFAULT_REACTIVE_SETTINGS),
  );
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
  const resumeAfterExitRef = useRef(false);
  const mountedRef = useRef(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

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
      const lock = (await nav.wakeLock?.request("screen")) ?? null;
      if (!mountedRef.current || !["countdown", "running", "paused"].includes(phaseRef.current)) {
        await lock?.release();
        return;
      }
      wakeLockRef.current = lock;
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
      if (!mountedRef.current || !["countdown", "running", "paused"].includes(phaseRef.current))
        await leaveFullscreen();
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
    phaseRef.current = "countdown";
    setPhase("countdown");
    void enterFullscreen();
    void keepScreenAwake();
  }

  function finishSession() {
    const elapsed =
      phase === "paused"
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
      timers.push(
        window.setTimeout(() => {
          emitCue(false);
          scheduleWindow();
        }, delay),
      );
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void releaseScreen();
      void leaveFullscreen();
      navigator.vibrate?.(0);
    };
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

  const { requestExit } = useActivityExitGuard({
    dirty:
      phase === "running" ||
      phase === "paused" ||
      Boolean(customName || customLabel || draftActions.length),
    description:
      phase === "running" || phase === "paused"
        ? "Bieżący fragment treningu zostanie zakończony."
        : "Własne komendy nie zostały zapisane.",
    pause: () => {
      resumeAfterExitRef.current = phase === "running";
      if (resumeAfterExitRef.current) pauseSession();
    },
    resume: () => {
      if (resumeAfterExitRef.current) {
        resumeAfterExitRef.current = false;
        resumeSession();
      }
    },
    dispose: () => {
      void releaseScreen();
      void leaveFullscreen();
      navigator.vibrate?.(0);
    },
  });

  if (phase === "countdown") {
    return (
      <div className="bw-workspace flex flex-col items-center justify-center overflow-y-auto bg-[#05070a] px-6 py-6 text-center text-white">
        <p className="text-base font-medium text-white/55">Ustaw telefon pionowo</p>
        <div className="mt-3 text-[clamp(4rem,20vh,10rem)] font-semibold leading-none tabular-nums">
          {countdown}
        </div>
        <p className="mt-5 max-w-sm text-lg text-white/70">
          Oprzyj telefon stabilnie, zwiększ jasność ekranu i odejdź na wybraną odległość.
        </p>
        <Button
          type="button"
          onClick={() => {
            setPhase("setup");
            void releaseScreen();
            void leaveFullscreen();
          }}
          variant="ghost"
          className="mt-6 text-white/70"
        >
          Anuluj
        </Button>
      </div>
    );
  }

  if (phase === "running" || phase === "paused") {
    return (
      <div className="bw-workspace bg-black">
        {cue ? <CueDisplay cue={cue} visible={cueVisible} /> : <div className="h-full bg-black" />}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent px-4 pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{formatTime(elapsedSec)}</p>
            <p className="text-sm font-semibold text-white/65">
              {stats.cueCount} bodźców · {stats.decisionChanges} zmian
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={phase === "paused" ? resumeSession : pauseSession}
              aria-label={phase === "paused" ? "Wznów" : "Pauza"}
              variant="ghost"
              className="h-12 w-12 bg-white/15 text-white"
            >
              {phase === "paused" ? (
                <Play className="h-5 w-5 fill-current" />
              ) : (
                <Pause className="h-5 w-5 fill-current" />
              )}
            </Button>
            <Button type="button" onClick={finishSession} className="h-12 bg-white text-black">
              <Square className="h-4 w-4 fill-current" /> Zakończ
            </Button>
          </div>
        </div>
        {phase === "paused" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 text-white backdrop-blur-sm">
            <div className="text-center">
              <Pause className="mx-auto h-14 w-14" />
              <p className="mt-4 text-3xl font-semibold">Pauza</p>
              <Button type="button" onClick={resumeSession} className="mt-6 bg-white text-black">
                Wznów
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "summary") {
    const directionTotal = Object.values(stats.directionCounts).reduce(
      (sum, value) => sum + value,
      0,
    );
    const colorTotal = Object.values(stats.colorCounts).reduce((sum, value) => sum + value, 0);
    return (
      <section className="app-shell bw-page-content pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <h1 className="bw-page-title">Podsumowanie</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Zapis obejmuje wygenerowane bodźce, nie czas reakcji ani jakość wykonania.
        </p>
        <MetricGroup
          className="bw-section mt-8"
          items={[
            { label: "Czas", value: formatTime(stats.elapsedSec) },
            { label: "Bodźce", value: stats.cueCount },
            { label: "Zmiany", value: stats.decisionChanges },
          ]}
        />
        <div className="bw-columns bw-section mt-8">
          {directionTotal > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Rozkład kierunków</h2>
              <div className="mt-4 grid gap-4">
                {DIRECTIONS.map((direction) => (
                  <DistributionBar
                    key={direction}
                    label={DIRECTION_LABELS[direction]}
                    value={stats.directionCounts[direction]}
                    total={directionTotal}
                    color="#316fd1"
                  />
                ))}
              </div>
            </section>
          )}
          {colorTotal > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Rozkład kolorów</h2>
              <div className="mt-4 grid gap-4">
                {COLORS.map((color) => (
                  <DistributionBar
                    key={color}
                    label={COLOR_LABELS[color]}
                    value={stats.colorCounts[color]}
                    total={colorTotal}
                    color={COLOR_HEX[color]}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="bw-section mt-8 flex flex-wrap gap-3">
          <Button onClick={startCountdown}>
            <RotateCcw className="h-4 w-4" /> Powtórz
          </Button>
          <Button variant="outline" onClick={() => setPhase("setup")}>
            Ustawienia
          </Button>
        </div>
      </section>
    );
  }

  const durationChoice =
    settings.durationMin === null
      ? "unlimited"
      : [5, 10, 15, 20].includes(settings.durationMin)
        ? String(settings.durationMin)
        : "custom";
  return (
    <section className="app-shell bw-page-content pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      {onBack && (
        <Button variant="ghost" onClick={() => requestExit(onBack, "route")} className="mb-6">
          <ChevronLeft className="h-4 w-4" /> Plan
        </Button>
      )}
      <header>
        <h1 className="bw-page-title">Trener reakcji</h1>
        <p className="mt-3 text-sm text-muted-foreground">Przypisz bodźcom własne akcje z piłką.</p>
      </header>
      <div className="bw-columns bw-section mt-8">
        <div className="bw-stack">
          <ChoiceGroup
            label="Bodziec"
            selectedClassName="bg-primary/8"
            value={settings.mode}
            options={MODE_OPTIONS.map((mode) => ({ value: mode.id, label: mode.title }))}
            onChange={(mode) =>
              setSettings((current) => ({
                ...current,
                mode,
                level:
                  mode === "combo" && current.level === "basic" ? "intermediate" : current.level,
              }))
            }
          />
          <p className="text-sm text-muted-foreground">
            {MODE_OPTIONS.find((mode) => mode.id === settings.mode)?.description}
          </p>
          <ChoiceGroup
            label="Poziom decyzji"
            selectedClassName="bg-primary/8"
            value={settings.level}
            options={LEVEL_OPTIONS.map((level) => ({
              value: level.id,
              label: level.title,
              disabled: settings.mode === "combo" && level.id === "basic",
            }))}
            onChange={(level) => setSettings((current) => ({ ...current, level }))}
          />
          <p className="text-sm text-muted-foreground">
            {LEVEL_OPTIONS.find((level) => level.id === settings.level)?.note}
          </p>
          {["directions", "opponent", "combo", "flash", "sequence"].includes(settings.mode) && (
            <fieldset>
              <legend className="mb-3 text-base font-semibold">Aktywne kierunki</legend>
              <div className="flex flex-wrap gap-3">
                {DIRECTIONS.map((direction) => (
                  <label key={direction} className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox
                      checked={settings.activeDirections.includes(direction)}
                      onCheckedChange={() =>
                        setSettings((current) => ({
                          ...current,
                          activeDirections: toggleValue(current.activeDirections, direction),
                        }))
                      }
                    />
                    <DirectionIcon direction={direction} />
                    {DIRECTION_LABELS[direction]}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Wybierz co najmniej dwa kierunki.
              </p>
            </fieldset>
          )}
          {["colors", "combo"].includes(settings.mode) && (
            <fieldset>
              <legend className="mb-3 text-base font-semibold">Aktywne kolory</legend>
              <div className="flex flex-wrap gap-3">
                {COLORS.map((color) => (
                  <label key={color} className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox
                      checked={settings.activeColors.includes(color)}
                      onCheckedChange={() =>
                        setSettings((current) => ({
                          ...current,
                          activeColors: toggleValue(current.activeColors, color),
                        }))
                      }
                    />
                    <span
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: COLOR_HEX[color] }}
                    />
                    {COLOR_LABELS[color]}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Wybierz co najmniej dwa kolory.</p>
            </fieldset>
          )}
        </div>
        <div className="bw-stack">
          <Field label={`Zmiana co ${settings.intervalSec} s`}>
            <Slider
              aria-label="Czas między bodźcami"
              min={2}
              max={15}
              step={1}
              value={[settings.intervalSec]}
              onValueChange={([intervalSec]) =>
                setSettings((current) => ({ ...current, intervalSec }))
              }
            />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={settings.randomTiming}
              onCheckedChange={(value) =>
                setSettings((current) => ({ ...current, randomTiming: value === true }))
              }
            />{" "}
            Losowy rytm
          </label>
          {settings.mode === "flash" && (
            <Field label={`Czas błysku: ${settings.flashDurationMs} ms`}>
              <Slider
                aria-label="Czas błysku"
                min={150}
                max={1000}
                step={50}
                value={[settings.flashDurationMs]}
                onValueChange={([flashDurationMs]) =>
                  setSettings((current) => ({ ...current, flashDurationMs }))
                }
              />
            </Field>
          )}
          {settings.mode === "sequence" && (
            <Field label={`Długość sekwencji: ${settings.sequenceLength}`}>
              <Slider
                aria-label="Długość sekwencji"
                min={2}
                max={8}
                step={1}
                value={[settings.sequenceLength]}
                onValueChange={([sequenceLength]) =>
                  setSettings((current) => ({ ...current, sequenceLength }))
                }
              />
            </Field>
          )}
          <ChoiceGroup
            label="Czas fragmentu"
            selectedClassName="bg-primary/8 text-primary"
            value={durationChoice}
            options={[5, 10, 15, 20]
              .map((value) => ({ value: String(value), label: `${value} min` }))
              .concat([
                { value: "unlimited", label: "Bez limitu" },
                { value: "custom", label: "Własny czas" },
              ])}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                durationMin: value === "unlimited" ? null : value === "custom" ? 1 : Number(value),
              }))
            }
          />
          {durationChoice === "custom" && (
            <Field label="Czas (min)" htmlFor="reactive-duration">
              <Input
                id="reactive-duration"
                type="number"
                min={1}
                max={180}
                value={settings.durationMin ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    durationMin: Number(event.target.value) || 1,
                  }))
                }
              />
            </Field>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={settings.vibration}
              onCheckedChange={(value) =>
                setSettings((current) => ({ ...current, vibration: value === true }))
              }
            />{" "}
            Wibracja przy nowym bodźcu
          </label>
        </div>
      </div>
      {settings.mode === "custom" && (
        <section className="bw-section bw-stack mt-8">
          <h2 className="text-lg font-semibold">Własne komendy</h2>
          <p className="text-sm text-muted-foreground">
            Zestawy zapisują się tylko na tym urządzeniu.
          </p>
          {customSets.length > 0 && (
            <ChoiceGroup
              label="Zapisany zestaw"
              selectedClassName="bg-primary text-primary-foreground"
              value={settings.customSetId ?? ""}
              options={customSets.map((set) => ({ value: set.id, label: set.name }))}
              onChange={(customSetId) => setSettings((current) => ({ ...current, customSetId }))}
            />
          )}
          <div className="bw-columns">
            <Field label="Nazwa zestawu" htmlFor="reactive-set-name">
              <Input
                id="reactive-set-name"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="np. Drybling 1v1"
              />
            </Field>
            <Field label="Komenda" htmlFor="reactive-command">
              <Input
                id="reactive-command"
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
                placeholder="np. zwód i wyjście"
              />
            </Field>
            <ChoiceGroup
              label="Strzałka"
              value={customDirection}
              options={[
                { value: "", label: "Bez strzałki" },
                ...DIRECTIONS.map((direction) => ({
                  value: direction,
                  label: DIRECTION_LABELS[direction],
                })),
              ]}
              onChange={(value) => setCustomDirection(value as ReactiveDirection | "")}
            />
            <ChoiceGroup
              label="Kolor"
              value={customColor}
              options={[
                { value: "", label: "Bez koloru" },
                ...COLORS.map((color) => ({ value: color, label: COLOR_LABELS[color] })),
              ]}
              onChange={(value) => setCustomColor(value as ReactiveColor | "")}
            />
          </div>
          <Button variant="outline" onClick={addDraftAction} disabled={!customLabel.trim()}>
            <Plus className="h-4 w-4" /> Dodaj komendę
          </Button>
          {draftActions.map((action) => (
            <div key={action.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">{action.label}</span>
              <Button
                variant="ghost"
                aria-label={`Usuń komendę ${action.label}`}
                onClick={() =>
                  setDraftActions((items) => items.filter((item) => item.id !== action.id))
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={saveCustomSet}>
            <Save className="h-4 w-4" /> Zapisz zestaw
          </Button>
        </section>
      )}
      <section className="bw-section bw-stack mt-8">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ustaw telefon pionowo i stabilnie, zwiększ jasność i odejdź na wybraną odległość. Bodźce
          są fragmentem własnego treningu z piłką, który łącznie trwa co najmniej 30 minut.
        </p>
        {setupError && (
          <p role="alert" className="text-sm text-destructive">
            {setupError}
          </p>
        )}
        <Button onClick={startCountdown}>Uruchom bodźce</Button>
        <p className="text-sm text-muted-foreground">
          10 sekund na ustawienie telefonu · bez komend głosowych
        </p>
      </section>
    </section>
  );
}
