/** Football IQ, first person, 5v5: four outfield players and a keeper per team on a small
 * pitch. You play one position, with and without the ball.
 * Lesson topic: receive and keep the ball under pressure. Loop: short continuous fragment
 * (keeper's distribution, build-up, finish, reaction after a loss) → replay from above →
 * one concrete tip → play the same picture again or a changed variant.
 * Everything runs locally; no AI requests during play. Nothing on screen shows the right
 * move while you play. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crosshair, LayoutGrid, Pause, Play, RotateCcw } from "lucide-react";
import { vibrate } from "@/lib/haptics";
import { backupIqNow, cloudBackupEnabled } from "../iqCloud";
import { createF5Scene, type F5Scene, type F5SceneEvent, type HudState } from "./f5Scene";
import { F5_ENGINE_VERSION, type F5Input, type KickType, type SimState } from "./f5Sim";
import {
  makeVariant,
  nextVariantSeed,
  POSITION_LABEL,
  POSITIONS,
  type Position,
} from "./f5Variants";
import { buildDebrief, type F5Debrief, type Grade } from "./f5Debrief";
import {
  F5_RESULT_VERSION,
  f5Summary,
  loadF5History,
  MAX_F5_INPUTS,
  saveF5Attempt,
  type F5Attempt,
} from "./f5Store";
import type { LookStatus } from "../firstPerson/fpLook";
import "../firstPerson/firstPerson.css";
import "./fiveAside.css";

type Stage = "loading" | "error" | "intro" | "ready" | "play" | "replay" | "debrief";
export type FiveAsideIQProps = {
  historyOwner?: string;
  onBack: () => void;
  onOpenClassic?: () => void;
  onOpenThreeVsTwo?: () => void;
  /** Tests and QA: start from this variant seed and position. */
  initialSeed?: number;
  initialPosition?: Position;
};

const TOUCH_LABEL: Record<Grade, string> = { good: "Czyste", ok: "Niedokładne", poor: "Nieudane" };
const CHOICE_LABEL: Record<Grade, string> = {
  good: "Dobra",
  ok: "Do poprawy",
  poor: "Nietrafiona",
};
const newId = () => `f5-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const positionKey = (owner?: string) => `ballwise:iq:f5:position:v1:${owner ?? "guest"}`;
const HOLD_FULL_MS = 900;

function safeHistory(owner?: string): F5Attempt[] {
  try {
    return loadF5History(owner);
  } catch {
    return [];
  }
}
function savedPosition(owner?: string): Position {
  try {
    const value = localStorage.getItem(positionKey(owner));
    return POSITIONS.includes(value as Position) ? (value as Position) : "left";
  } catch {
    return "left";
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

export function FiveAsideIQ({
  historyOwner,
  onBack,
  onOpenClassic,
  onOpenThreeVsTwo,
  initialSeed,
  initialPosition,
}: FiveAsideIQProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<F5Scene | null>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<F5Attempt[]>(() => safeHistory(historyOwner));
  const [position, setPosition] = useState<Position>(
    () => initialPosition ?? savedPosition(historyOwner),
  );
  const [seed, setSeed] = useState<number>(
    () => initialSeed ?? nextVariantSeed(position, null, safeHistory(historyOwner).length),
  );
  const variant = useMemo(() => makeVariant(seed, position), [seed, position]);
  const [hud, setHud] = useState<HudState["mode"]>("wait");
  const [lookStatus, setLookStatus] = useState<LookStatus>("drag");
  const [paused, setPaused] = useState(false);
  const [charging, setCharging] = useState<KickType | null>(null);
  const [debrief, setDebrief] = useState<F5Debrief | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(true);
  const lastRun = useRef<{ sim: SimState; inputs: F5Input[] } | null>(null);
  const savedRun = useRef<{ sim: SimState; inputs: F5Input[] } | null>(null);
  const holdStart = useRef(0);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const onSceneEvent = useCallback((e: F5SceneEvent) => {
    switch (e.type) {
      case "hud":
        setHud(e.hud.mode);
        if (e.hud.mode === "with") vibrate(12);
        break;
      case "look":
        setLookStatus(e.status);
        break;
      case "done":
        lastRun.current = { sim: e.sim, inputs: e.inputs };
        unlockOrientation();
        setStage("replay");
        break;
      case "playback-end":
        if (stageRef.current === "replay") {
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
    let scene: F5Scene | null = null;
    createF5Scene(host, onSceneEvent, controller.signal)
      .then((created) => {
        scene = created;
        sceneRef.current = created;
        // Browser QA only (scripts/check-iq-five-aside.mjs): drive the scene directly.
        const qa = window as unknown as { __BALLWISE_FP_QA__?: boolean; __f5Scene?: F5Scene };
        if (qa.__BALLWISE_FP_QA__) qa.__f5Scene = created;
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

  // Replay from above and saving the result (once per fragment).
  useEffect(() => {
    if (stage !== "replay" || !lastRun.current) return;
    const run = lastRun.current;
    const result = buildDebrief(run.sim);
    sceneRef.current?.playFrames(run.sim.frames, result.keyTick, 0.9, run.sim.ty);
    setReplayPlaying(true);
    if (savedRun.current === run) return;
    savedRun.current = run;
    const id = window.setTimeout(() => {
      setDebrief(result);
      if (run.inputs.length > MAX_F5_INPUTS) return; // too long to store and check again
      const attempt: F5Attempt = {
        id: newId(),
        version: F5_RESULT_VERSION,
        engine: F5_ENGINE_VERSION,
        variant: run.sim.variant.id,
        position: run.sim.variant.position,
        inputs: run.inputs,
        outcome: result.outcome,
        choice: result.choice.grade,
        execution: result.execution.grade,
        problem: result.problem,
        look: sceneRef.current?.look.status === "motion" ? "motion" : "drag",
        createdAt: new Date().toISOString(),
      };
      try {
        setHistory(saveF5Attempt(historyOwner, attempt));
        if (historyOwner && cloudBackupEnabled(historyOwner))
          void backupIqNow(historyOwner).catch(() => undefined);
      } catch {
        /* storage full or blocked: the lesson continues */
      }
    }, 40);
    return () => window.clearTimeout(id);
  }, [stage, historyOwner]);

  const toReady = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Motion permission must be asked inside a tap (iOS).
    if (scene.look.status !== "motion") void scene.look.enableMotion();
    scene.startLive(variant);
    scene.setPaused(true);
    setHud("wait");
    setPaused(false);
    setDebrief(null);
    setStage("ready");
  }, [variant]);

  const start = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (scene.look.status !== "motion") void scene.look.enableMotion();
    void lockLandscape();
    // Calibration: the way the phone points now is the way to your keeper (the first ball).
    scene.startLive(variant);
    scene.setPaused(false);
    setStage("play");
  };

  // The starting picture from above while choosing.
  useEffect(() => {
    if (stage === "intro") sceneRef.current?.preview(variant);
  }, [stage, variant]);

  const choosePosition = (next: Position) => {
    if (next === position) return;
    setPosition(next);
    setSeed(nextVariantSeed(next, null, history.length));
    try {
      localStorage.setItem(positionKey(historyOwner), next);
    } catch {
      /* private mode: the choice holds for this visit */
    }
  };

  const playAgain = () => {
    lastRun.current = null;
    toReady();
  };
  const nextVariant = () => {
    lastRun.current = null;
    setSeed(nextVariantSeed(position, variant, history.length + 1));
    setStage("intro");
  };
  // After "Nowy wariant" the new variant is ready straight away.
  const pendingReady = useRef(false);
  useEffect(() => {
    if (!pendingReady.current || stage !== "intro") return;
    pendingReady.current = false;
    toReady();
  }, [stage, toReady]);

  const resume = () => {
    sceneRef.current?.recenterForward();
    sceneRef.current?.setPaused(false);
    setPaused(false);
  };
  const leavePlay = () => {
    sceneRef.current?.setPaused(true);
    unlockOrientation();
    setPaused(false);
    setStage("intro");
  };

  // --- joystick (left thumb): direct DOM updates, React is not re-rendered while moving.
  const stickPointer = useRef<number | null>(null);
  const moveKnob = (x: number, y: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${x * 37}px, ${-y * 37}px)`;
  };
  const readStick = (e: React.PointerEvent) => {
    const el = stickRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 14);
    const dy = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2 - 14);
    const l = Math.hypot(dx, dy);
    return l > 1 ? { x: dx / l, y: dy / l } : { x: dx, y: dy };
  };
  const onStickDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    stickPointer.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const v = readStick(e);
    if (v) {
      moveKnob(v.x, v.y);
      sceneRef.current?.stick(v);
    }
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return;
    e.stopPropagation();
    const v = readStick(e);
    if (v) {
      moveKnob(v.x, v.y);
      sceneRef.current?.stick(v);
    }
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return;
    stickPointer.current = null;
    moveKnob(0, 0);
    sceneRef.current?.stick(null);
  };

  // --- right thumb: hold to set the power, release to play where you look.
  const beginKick = (type: KickType) => {
    holdStart.current = performance.now();
    setCharging(type);
  };
  const endKick = (type: KickType) => {
    if (charging !== type) return;
    setCharging(null);
    const power = Math.max(
      0.12,
      Math.min(1, (performance.now() - holdStart.current) / HOLD_FULL_MS),
    );
    if (sceneRef.current?.kick(type, power)) vibrate(8);
  };
  const defend = (kind: "press" | "tackle") => {
    const ok = kind === "press" ? sceneRef.current?.press() : sceneRef.current?.tackle();
    if (ok) vibrate(8);
  };

  // --- keyboard fallback for testing on a computer: WASD/arrows, J/K/L, E, Space, C.
  useEffect(() => {
    if (stage !== "play") return;
    const keys = new Set<string>();
    const kickKeys: Record<string, KickType> = { j: "pass", k: "shot", l: "lofted" };
    const held = new Map<string, number>();
    const send = () => {
      const x =
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      const y =
        (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      const slow = keys.has("shift") ? 0.45 : 1;
      if (!x && !y) sceneRef.current?.stick(null);
      else {
        const l = Math.hypot(x, y);
        sceneRef.current?.stick({ x: (x / l) * slow, y: (y / l) * slow });
      }
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (
        ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)
      ) {
        if (k.startsWith("arrow")) e.preventDefault();
        // A new direction key is a new "thumb down": the run takes the current view.
        if (k !== "shift") sceneRef.current?.stick(null);
        keys.add(k);
        send();
      } else if (kickKeys[k]) {
        held.set(k, performance.now());
        setCharging(kickKeys[k]!);
      } else if (k === "e") defend("press");
      else if (k === " ") {
        e.preventDefault();
        defend("tackle");
      } else if (k === "c") sceneRef.current?.recenterForward();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (keys.delete(k)) send();
      const t = held.get(k);
      if (t !== undefined && kickKeys[k]) {
        held.delete(k);
        setCharging(null);
        sceneRef.current?.kick(
          kickKeys[k]!,
          Math.max(0.12, Math.min(1, (performance.now() - t) / HOLD_FULL_MS)),
        );
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      sceneRef.current?.stick(null);
    };
  }, [stage]);

  const summary = f5Summary(history);
  const immersive = stage === "play" || stage === "ready";
  const withBall = hud === "with" || hud === "attack";
  const kickButton = (type: KickType, slot: "pass" | "shot" | "lob", label: string) => (
    <button
      type="button"
      className={`f5-action ${charging === type ? "is-charging" : ""}`}
      data-slot={slot}
      disabled={!withBall || paused}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        beginKick(type);
      }}
      onPointerUp={() => endKick(type)}
      onPointerCancel={() => setCharging(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          holdStart.current = performance.now() - HOLD_FULL_MS / 2;
          setCharging(type);
          sceneRef.current?.kick(type, 0.5);
          setCharging(null);
        }
      }}
    >
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className={`fp-root ${immersive ? "is-immersive" : ""}`}
      data-stage={stage}
      data-f5-variant={variant.id}
      data-hud={hud}
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
          <small>5 na 5 · przyjęcie i utrzymanie pod presją</small>
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
          <p className="fp-kicker">5 na 5 · twoja pozycja</p>
          <div className="f5-positions" role="group" aria-label="Pozycja">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                className="f5-position"
                aria-pressed={p === position}
                onClick={() => choosePosition(p)}
              >
                {POSITION_LABEL[p]}
              </button>
            ))}
          </div>
          <p className="fp-rule">
            Bramkarz rozpocznie grę podaniem do ciebie. Utrzymaj piłkę dla drużyny, a po stracie od
            razu ją odzyskuj.
          </p>
          <button type="button" className="fp-primary" onClick={toReady}>
            Graj
          </button>
          {summary.played > 0 && (
            <p className="fp-meta">
              Fragmenty: {summary.played} · czyste przyjęcia w ostatnich {summary.recent}:{" "}
              {summary.goodTouches}
            </p>
          )}
          {(onOpenThreeVsTwo || onOpenClassic) && (
            <div className="f5-links">
              {onOpenThreeVsTwo && (
                <button type="button" onClick={onOpenThreeVsTwo}>
                  Lekcja 3 na 2
                </button>
              )}
              {onOpenClassic && (
                <button type="button" onClick={onOpenClassic}>
                  Sytuacje na tablicy
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {stage === "ready" && (
        <div className="fp-card fp-bottom">
          <p className="fp-rule">
            {lookStatus === "motion" || lookStatus === "asking"
              ? "Trzymaj telefon przed sobą i obracaj się z nim, żeby się rozejrzeć."
              : "Przeciągaj palcem po boisku, żeby się rozejrzeć."}
          </p>
          <p className="fp-meta">
            Lewy kciuk: bieg i jego prędkość, w kierunku, w którym patrzysz w chwili dotknięcia.
            Prawy kciuk: Podaj, Strzel, Górą. Im dłużej trzymasz, tym mocniej; piłka leci tam, gdzie
            patrzysz. Bez piłki: Doskok i Odbiór.
          </p>
          <p className="fp-meta">Na komputerze: WASD, J K L, E i spacja, C centruje widok.</p>
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
          <div
            ref={stickRef}
            className="f5-stick"
            aria-label="Ruch"
            role="presentation"
            onPointerDown={onStickDown}
            onPointerMove={onStickMove}
            onPointerUp={onStickUp}
            onPointerCancel={onStickUp}
          >
            <div ref={knobRef} className="f5-knob" />
          </div>
          <div className="f5-side">
            <button
              type="button"
              className="fp-small"
              aria-label="Wyśrodkuj widok w stronę bramki rywala"
              onClick={() => sceneRef.current?.recenterForward()}
            >
              <Crosshair size={18} />
            </button>
          </div>
          {hud === "defend" ? (
            <div className="f5-actions">
              <button
                type="button"
                className="f5-action"
                data-slot="lob"
                disabled={paused}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  defend("press");
                }}
              >
                <span>Doskok</span>
              </button>
              <button
                type="button"
                className="f5-action"
                data-slot="pass"
                disabled={paused}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  defend("tackle");
                }}
              >
                <span>Odbiór</span>
              </button>
            </div>
          ) : (
            <div className="f5-actions">
              {kickButton("lofted", "lob", "Górą")}
              {kickButton("shot", "shot", "Strzel")}
              {kickButton("pass", "pass", "Podaj")}
            </div>
          )}
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
          <p className="fp-result" data-kind={debrief.outcome}>
            Twój fragment
          </p>
          <dl className="fp-grades">
            <div>
              <dt>Przyjęcie</dt>
              <dd>
                <b data-grade={debrief.execution.grade}>{TOUCH_LABEL[debrief.execution.grade]}</b>
                {debrief.execution.text}
              </dd>
            </div>
            <div>
              <dt>Decyzja</dt>
              <dd>
                <b data-grade={debrief.choice.grade}>
                  {debrief.choice.kind ? CHOICE_LABEL[debrief.choice.grade] : "Brak"}
                </b>
                {debrief.choice.text}
              </dd>
            </div>
            <div>
              <dt>Rezultat</dt>
              <dd>{debrief.result.text}</dd>
            </div>
          </dl>
          <p className="fp-tip">{debrief.tip}</p>
          <div className="fp-actions">
            <button type="button" className="fp-secondary" onClick={playAgain}>
              <RotateCcw size={16} /> Zagraj ponownie
            </button>
            <button
              type="button"
              className="fp-primary"
              onClick={() => {
                pendingReady.current = true;
                nextVariant();
              }}
            >
              Nowy wariant
            </button>
          </div>
          <p className="fp-meta">Oceny dotyczą gry w symulatorze.</p>
        </div>
      )}
    </div>
  );
}
