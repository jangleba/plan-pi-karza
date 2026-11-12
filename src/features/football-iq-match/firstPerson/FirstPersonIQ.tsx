/** Football IQ, first person: one 3v2 situation (receive under pressure, read the picture,
 * pass) seen from the player's eyes. Lesson loop: short demonstration of one principle →
 * own action → replay from above → one concrete tip → a changed variant.
 * Everything runs locally; no AI requests during the action. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crosshair, LayoutGrid, Pause, Play, RotateCcw } from "lucide-react";
import { vibrate } from "@/lib/haptics";
import { backupIqNow, cloudBackupEnabled } from "../iqCloud";
import { createFpScene, type FpScene, type SceneEvent } from "./fpScene";
import {
  runSim,
  FP_ENGINE_VERSION,
  type FpInput,
  type Frame,
  type Phase,
  type SimState,
} from "./fpSim";
import { makeVariant, nextVariantSeed, siblingSeed, type FpVariant } from "./fpVariants";
import {
  buildDebrief,
  modelInputs,
  PRINCIPLES,
  principleFor,
  type Debrief,
  type Grade,
  type PrincipleKey,
} from "./fpDebrief";
import {
  FP_RESULT_VERSION,
  fpSummary,
  loadFpHistory,
  saveFpAttempt,
  type FpAttempt,
} from "./fpStore";
import type { LookStatus } from "./fpLook";
import "./firstPerson.css";

type Stage = "loading" | "error" | "intro" | "ready" | "play" | "replay" | "debrief";
export type FirstPersonIQProps = {
  historyOwner?: string;
  onBack: () => void;
  onOpenClassic?: () => void;
  /** Tests and QA: start from this variant seed. */
  initialSeed?: number;
};

const CHOICE_LABEL: Record<Grade, string> = { good: "Dobry", ok: "Bezpieczny", poor: "Ryzykowny" };
const EXEC_LABEL: Record<Grade, string> = { good: "Czyste", ok: "Niedokładne", poor: "Nieudane" };
const newId = () => `fp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function safeHistory(owner?: string): FpAttempt[] {
  try {
    return loadFpHistory(owner);
  } catch {
    return [];
  }
}

async function lockLandscape() {
  // Only where the system supports it (Android, some browsers in full screen). iOS ignores it.
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.("landscape");
  } catch {
    /* not supported: both orientations work */
  }
}
function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* not supported */
  }
}

export function FirstPersonIQ({
  historyOwner,
  onBack,
  onOpenClassic,
  initialSeed,
}: FirstPersonIQProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FpScene | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<FpAttempt[]>(() => safeHistory(historyOwner));
  const [seed, setSeed] = useState<number>(
    () => initialSeed ?? nextVariantSeed(null, safeHistory(historyOwner).length),
  );
  const variant = useMemo(() => makeVariant(seed), [seed]);
  const [principle, setPrinciple] = useState<PrincipleKey>(() => principleFor(makeVariant(seed)));
  const [phase, setPhase] = useState<Phase>("build");
  const [lookStatus, setLookStatus] = useState<LookStatus>("drag");
  const [paused, setPaused] = useState(false);
  const [armed, setArmed] = useState(false);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(true);
  const [demoDone, setDemoDone] = useState(false);
  const lastRun = useRef<{ sim: SimState; inputs: FpInput[] } | null>(null);
  const savedRun = useRef<{ sim: SimState; inputs: FpInput[] } | null>(null);
  const [autoReady, setAutoReady] = useState(false);
  const holdStart = useRef(0);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const playDemo = useCallback((forVariant: FpVariant, key: PrincipleKey) => {
    const scene = sceneRef.current;
    if (!scene) return;
    setDemoDone(false);
    // A different variant with the same problem, so the demo does not give away this one.
    const demoSeed = siblingSeed(forVariant.seed, (v) => principleFor(v) === key);
    const demoVariant = makeVariant(demoSeed);
    const demo = runSim(demoVariant, modelInputs(demoVariant, key));
    scene.playFrames(demo.frames, 0, 1);
  }, []);

  const onSceneEvent = useCallback((e: SceneEvent) => {
    switch (e.type) {
      case "phase":
        setPhase(e.phase);
        if (e.phase === "possession") vibrate(12);
        break;
      case "look":
        setLookStatus(e.status);
        break;
      case "done":
        lastRun.current = { sim: e.sim, inputs: e.inputs };
        setStage("replay");
        break;
      case "playback-end":
        if (stageRef.current === "intro") setDemoDone(true);
        else if (stageRef.current === "replay") {
          setReplayPlaying(false);
          setStage("debrief");
        } else setReplayPlaying(false);
        break;
      case "hidden":
        if (stageRef.current === "play") {
          sceneRef.current?.setPaused(true);
          setPaused(true);
        }
        break;
      case "context-lost":
        setError("Widok 3D został przerwany przez system. Wróć do ekranu i otwórz go ponownie.");
        setStage("error");
        break;
      default:
        break;
    }
  }, []);

  // Scene lifetime: created once, released on unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new AbortController();
    let scene: FpScene | null = null;
    createFpScene(host, onSceneEvent, controller.signal)
      .then((created) => {
        scene = created;
        sceneRef.current = created;
        // Browser QA only (scripts/check-iq-first-person.mjs): drive the scene directly.
        const qa = window as unknown as { __BALLWISE_FP_QA__?: boolean; __fpScene?: FpScene };
        if (qa.__BALLWISE_FP_QA__) qa.__fpScene = created;
        setStage("intro");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error && /model/i.test(err.message)
            ? err.message
            : "Nie udało się uruchomić widoku 3D na tym urządzeniu.",
        );
        setStage("error");
      });
    return () => {
      controller.abort();
      scene?.dispose();
      sceneRef.current = null;
      unlockOrientation();
    };
  }, [onSceneEvent]);

  // Demonstration of the principle when a lesson starts.
  useEffect(() => {
    if (stage !== "intro") return;
    const id = window.setTimeout(() => playDemo(variant, principle), 30);
    return () => window.clearTimeout(id);
  }, [stage, variant, principle, playDemo]);

  // Replay from above, from a moment before the decision.
  useEffect(() => {
    if (stage !== "replay" || !lastRun.current) return;
    const { sim, inputs } = lastRun.current;
    const decision =
      sim.events.find((x) => x.type === "pass" && x.from === "ty") ??
      sim.events.find((x) => x.type === "touch");
    sceneRef.current?.playFrames(sim.frames, Math.max(0, (decision?.tick ?? 0) - 90), 0.8);
    setReplayPlaying(true);
    if (savedRun.current === lastRun.current) return;
    savedRun.current = lastRun.current;
    // Debrief and saving after the first paint of the replay.
    const id = window.setTimeout(() => {
      const result = buildDebrief(variant, inputs, sim);
      setDebrief(result);
      const attempt: FpAttempt = {
        id: newId(),
        version: FP_RESULT_VERSION,
        engine: FP_ENGINE_VERSION,
        variant: variant.id,
        principle,
        inputs,
        outcome: result.outcome.kind,
        choice: result.choice.grade,
        execution: result.execution.grade,
        look: sceneRef.current?.look.status === "motion" ? "motion" : "drag",
        createdAt: new Date().toISOString(),
      };
      try {
        setHistory(saveFpAttempt(historyOwner, attempt));
        if (historyOwner && cloudBackupEnabled(historyOwner))
          void backupIqNow(historyOwner).catch(() => undefined);
      } catch {
        /* storage full or blocked: the lesson continues */
      }
    }, 40);
    return () => window.clearTimeout(id);
  }, [stage, variant, principle, historyOwner]);

  const toReady = useCallback(
    (askMotion: boolean) => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (askMotion && scene.look.status !== "motion") void scene.look.enableMotion();
      scene.startLive(variant);
      scene.setPaused(true);
      setArmed(false);
      setPaused(false);
      setStage("ready");
    },
    [variant],
  );

  const start = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (scene.look.status !== "motion") void scene.look.enableMotion();
    void lockLandscape();
    // Calibration: the way the phone points now is the way to the passer.
    const ty = variant.start.ty,
      passer = variant.start.support;
    scene.look.recenter(-Math.atan2(passer.x - ty.x, passer.y - ty.y));
    scene.setPaused(false);
    setStage("play");
  };

  const nextVariant = () => {
    const next = nextVariantSeed(seed, history.length + 1);
    const nextPrinciple = principleFor(makeVariant(next), debrief?.problem ?? null);
    setDebrief(null);
    lastRun.current = null;
    setSeed(next);
    if (nextPrinciple !== principle) {
      setPrinciple(nextPrinciple);
      setStage("intro");
    } else setAutoReady(true); // same principle: straight into the changed variant
  };
  useEffect(() => {
    if (!autoReady) return;
    setAutoReady(false);
    toReady(false);
  }, [autoReady, toReady]);

  const resume = () => {
    sceneRef.current?.look.recenter(0);
    sceneRef.current?.setPaused(false);
    setPaused(false);
  };
  const leavePlay = () => {
    unlockOrientation();
    setPaused(false);
    setStage("intro");
  };

  const pressDown = () => {
    holdStart.current = performance.now();
  };
  const pressUp = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const lofted = performance.now() - holdStart.current > 380;
    const done = scene.primary(lofted && (phase === "possession" || phase === "touch"));
    if (done === "touch") setArmed(true);
    if (done) vibrate(8);
  };

  const summary = fpSummary(history);
  const canTouch = phase === "build" || phase === "incoming";
  const canPass = phase === "possession" || phase === "touch";
  const immersive = stage === "play" || stage === "ready";

  return (
    <div
      className={`fp-root ${immersive ? "is-immersive" : ""}`}
      data-stage={stage}
      data-fp-variant={variant.id}
    >
      <div ref={hostRef} className="fp-stage" />

      <header className="fp-top">
        <button
          type="button"
          className="fp-icon"
          aria-label="Wróć"
          onClick={stage === "play" ? leavePlay : onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="fp-title">
          <span>Football IQ</span>
          <small>3 na 2 · przyjęcie i podanie</small>
        </div>
        {stage === "play" ? (
          <button
            type="button"
            className="fp-icon"
            aria-label="Pauza"
            onClick={() => {
              sceneRef.current?.setPaused(true);
              setPaused(true);
            }}
          >
            <Pause size={18} />
          </button>
        ) : onOpenClassic ? (
          <button
            type="button"
            className="fp-icon"
            aria-label="Sytuacje na tablicy"
            onClick={onOpenClassic}
          >
            <LayoutGrid size={18} />
          </button>
        ) : (
          <span className="fp-icon-space" />
        )}
      </header>

      {stage === "loading" && <div className="fp-center">Ładowanie boiska…</div>}
      {stage === "error" && (
        <div className="fp-card fp-bottom" role="alert">
          <p>{error}</p>
          {onOpenClassic && (
            <button type="button" className="fp-primary" onClick={onOpenClassic}>
              Otwórz sytuacje na tablicy
            </button>
          )}
        </div>
      )}

      {stage === "intro" && (
        <div className="fp-card fp-bottom">
          <p className="fp-kicker">Zasada · {PRINCIPLES[principle].title}</p>
          <p className="fp-rule">{PRINCIPLES[principle].rule}</p>
          <div className="fp-actions">
            {demoDone && (
              <button
                type="button"
                className="fp-secondary"
                onClick={() => playDemo(variant, principle)}
              >
                <RotateCcw size={16} /> Jeszcze raz
              </button>
            )}
            <button type="button" className="fp-primary" onClick={() => toReady(true)}>
              Twoja kolej
            </button>
          </div>
          {summary.played > 0 && (
            <p className="fp-meta">
              Akcje: {summary.played} · dobre wybory w ostatnich {summary.recent}:{" "}
              {summary.goodChoices}
            </p>
          )}
        </div>
      )}

      {stage === "ready" && (
        <div className="fp-card fp-bottom">
          <p className="fp-rule">
            {lookStatus === "motion" || lookStatus === "asking"
              ? "Trzymaj telefon przed sobą i obracaj się z nim, żeby się rozejrzeć. Piłka przyjdzie od partnera przed tobą."
              : "Przeciągaj palcem po ekranie, żeby się rozejrzeć. Piłka przyjdzie od partnera przed tobą."}
          </p>
          <p className="fp-meta">
            Przycisk po prawej: przed piłką ustawia kierunek przyjęcia, z piłką podaje tam, gdzie
            patrzysz. Przytrzymaj go, żeby podać górą.
          </p>
          <button type="button" className="fp-primary" onClick={start}>
            Start
          </button>
        </div>
      )}

      {stage === "play" && (
        <>
          <div className="fp-reticle" aria-hidden="true" />
          {(lookStatus === "unavailable" || lookStatus === "denied") && (
            <p className="fp-chip">
              {lookStatus === "denied"
                ? "Brak zgody na ruch telefonu."
                : "Brak danych z czujnika ruchu."}{" "}
              Przeciągaj palcem.
            </p>
          )}
          <div className="fp-controls">
            <button
              type="button"
              className="fp-small"
              aria-label="Wyśrodkuj widok"
              onClick={() => sceneRef.current?.recenterForward()}
            >
              <Crosshair size={18} />
            </button>
            <button
              type="button"
              className="fp-small"
              disabled={phase !== "possession"}
              onClick={() => sceneRef.current?.carry()}
            >
              Prowadź
            </button>
            <button
              type="button"
              className={`fp-thumb ${armed && canTouch ? "is-armed" : ""}`}
              disabled={!canTouch && !canPass}
              onPointerDown={pressDown}
              onPointerUp={pressUp}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  holdStart.current = performance.now();
                  pressUp();
                }
              }}
            >
              {canTouch ? "Przyjmij" : canPass ? "Podaj" : "…"}
            </button>
          </div>
          {paused && (
            <div className="fp-card fp-bottom">
              <p className="fp-rule">Pauza</p>
              <div className="fp-actions">
                <button type="button" className="fp-secondary" onClick={leavePlay}>
                  Zakończ
                </button>
                <button type="button" className="fp-primary" onClick={resume}>
                  Wróć do gry
                </button>
              </div>
              <p className="fp-meta">Po powrocie widok ustawi się w stronę bramki rywala.</p>
            </div>
          )}
        </>
      )}

      {(stage === "replay" || stage === "debrief") && (
        <div className="fp-replaybar">
          <span className="fp-kicker">Powtórka z góry</span>
          <button
            type="button"
            className="fp-small"
            aria-label={replayPlaying ? "Zatrzymaj powtórkę" : "Odtwórz powtórkę"}
            onClick={() => {
              const next = !replayPlaying;
              sceneRef.current?.setPlaying(next);
              setReplayPlaying(next);
            }}
          >
            {replayPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          {stage === "replay" && (
            <button type="button" className="fp-small" onClick={() => setStage("debrief")}>
              Dalej
            </button>
          )}
        </div>
      )}

      {stage === "debrief" && debrief && (
        <div className="fp-card fp-bottom fp-debrief">
          <p className="fp-result" data-kind={debrief.result.kind}>
            Twoja akcja
          </p>
          <dl className="fp-grades">
            <div>
              <dt>Wybór</dt>
              <dd>
                <b data-grade={debrief.choice.grade}>
                  {debrief.choice.key ? CHOICE_LABEL[debrief.choice.grade] : "Brak"}
                </b>
                {debrief.choice.text}
              </dd>
            </div>
            <div>
              <dt>Wykonanie</dt>
              <dd>
                <b data-grade={debrief.execution.grade}>{EXEC_LABEL[debrief.execution.grade]}</b>
                {debrief.execution.text}
              </dd>
            </div>
            <div>
              <dt>Rezultat</dt>
              <dd>{debrief.result.text}</dd>
            </div>
          </dl>
          <p className="fp-tip">{debrief.tip}</p>
          <div className="fp-actions">
            <button
              type="button"
              className="fp-secondary"
              onClick={() => {
                setStage("replay");
              }}
            >
              <RotateCcw size={16} /> Powtórka
            </button>
            <button type="button" className="fp-primary" onClick={nextVariant}>
              Nowy wariant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Frames of a finished run (for tests and QA). */
export const framesOf = (sim: SimState): Frame[] => sim.frames;
