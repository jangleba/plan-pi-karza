/** IQ 11:11 — one attacking fragment of a full match, played from behind your player with the
 * phone on its side. The lesson is the timing of the pass: offside is judged when the ball
 * leaves the foot. After the fragment the whole picture is shown from above with the rivals'
 * offside line and the story of what happened. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { vibrate } from "@/lib/haptics";
import { backupIqNow, cloudBackupEnabled } from "../iqCloud";
import { LandscapeGate, useLandscape } from "../LandscapeGate";
import { createE11Scene, type E11Scene, type E11SceneEvent, type E11HudMode } from "./e11Scene";
import { E11_ENGINE_VERSION, type E11Input, type SimState } from "./e11Sim";
import { makeVariant, nextVariantSeed, ROLE_LABEL, ROLES, type E11Role } from "./e11Variants";
import { buildDebrief, type E11Debrief } from "./e11Debrief";
import {
  E11_HINTS_KEY,
  E11_RESULT_VERSION,
  e11RoleKey,
  loadE11History,
  MAX_E11_INPUTS,
  saveE11Attempt,
  type E11Attempt,
} from "./e11Store";
import { ElevenDebrief } from "./ElevenReplay";
import "../firstPerson/firstPerson.css";
import "../fiveAside/fiveAside.css";
import "./eleven.css";

type Stage = "loading" | "error" | "intro" | "play" | "debrief";
type ElevenIQProps = {
  historyOwner?: string;
  onBack: () => void;
  /** Tests and QA: start from this picture. */
  initialSeed?: number;
  initialRole?: E11Role;
};

const newId = () => `e11-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const STICK_RADIUS = 56;

function savedRole(owner?: string): E11Role {
  try {
    const raw = localStorage.getItem(e11RoleKey(owner ?? "guest"));
    return ROLES.includes(raw as E11Role) ? (raw as E11Role) : "mid";
  } catch {
    return "mid";
  }
}
function savedHints(): boolean {
  try {
    return localStorage.getItem(E11_HINTS_KEY) !== "off";
  } catch {
    return true;
  }
}
function safeHistory(owner?: string): E11Attempt[] {
  try {
    return loadE11History(owner ?? "guest");
  } catch {
    return [];
  }
}
async function lockLandscape() {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (v: string) => Promise<void> };
    await o.lock?.("landscape");
  } catch {
    /* not supported (iOS): the notice asks to turn the phone */
  }
}
function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* not supported */
  }
}

export function ElevenIQ({ historyOwner, onBack, initialSeed, initialRole }: ElevenIQProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<E11Scene | null>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const stickOrigin = useRef({ x: 0, y: 0 });
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<E11Attempt[]>(() => safeHistory(historyOwner));
  const [role, setRole] = useState<E11Role>(() => initialRole ?? savedRole(historyOwner));
  const [hints, setHints] = useState<boolean>(savedHints);
  const [seed, setSeed] = useState<number>(
    () => initialSeed ?? nextVariantSeed(role, null, safeHistory(historyOwner).length),
  );
  const variant = useMemo(() => makeVariant(seed, role), [seed, role]);
  const [hud, setHud] = useState<E11HudMode>("wait");
  const [through, setThrough] = useState(true);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState<{ sim: SimState; debrief: E11Debrief } | null>(null);
  const savedRun = useRef<SimState | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const landscape = useLandscape();

  const onSceneEvent = useCallback((e: E11SceneEvent) => {
    switch (e.type) {
      case "hud":
        setHud(e.mode);
        if (e.mode === "with") vibrate(12);
        break;
      case "done": {
        unlockOrientation();
        setRun({ sim: e.sim, debrief: buildDebrief(e.sim) });
        inputsRef.current = e.inputs;
        setStage("debrief");
        break;
      }
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
  const inputsRef = useRef<E11Input[]>([]);

  // Scene lifetime: created once, released on unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new AbortController();
    let scene: E11Scene | null = null;
    createE11Scene(host, onSceneEvent, controller.signal)
      .then((created) => {
        scene = created;
        sceneRef.current = created;
        const qa = window as unknown as { __BALLWISE_FP_QA__?: boolean; __e11Scene?: E11Scene };
        if (qa.__BALLWISE_FP_QA__) qa.__e11Scene = created;
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

  // The starting picture while choosing.
  useEffect(() => {
    if (stage === "intro") sceneRef.current?.preview(variant, hints);
  }, [stage, variant, hints]);

  // Save the fragment once, with the result of the debrief.
  useEffect(() => {
    if (stage !== "debrief" || !run || savedRun.current === run.sim) return;
    savedRun.current = run.sim;
    const inputs = inputsRef.current;
    if (inputs.length > MAX_E11_INPUTS) return;
    const attempt: E11Attempt = {
      id: newId(),
      version: E11_RESULT_VERSION,
      engine: E11_ENGINE_VERSION,
      variant: run.sim.variant.id,
      role: run.sim.variant.role,
      inputs,
      outcome: run.debrief.outcome,
      timing: run.debrief.timing.kind,
      choice: run.debrief.choice.grade,
      problem: run.debrief.problem,
      hints,
      createdAt: new Date().toISOString(),
    };
    try {
      setHistory(saveE11Attempt(historyOwner ?? "guest", attempt));
      if (historyOwner && cloudBackupEnabled(historyOwner))
        void backupIqNow(historyOwner).catch(() => undefined);
    } catch {
      /* storage full or blocked: the lesson continues */
    }
  }, [stage, run, hints, historyOwner]);

  // Upright phone: the game waits.
  useEffect(() => {
    if (landscape || stage !== "play") return;
    sceneRef.current?.setPaused(true);
    setPaused(true);
  }, [landscape, stage]);

  const start = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    void lockLandscape();
    scene.startLive(variant, hints);
    scene.setThroughMode(through);
    scene.setPaused(false);
    setHud("wait");
    setPaused(false);
    setRun(null);
    setStage("play");
  };
  const again = () => {
    setRun(null);
    setStage("intro");
    window.setTimeout(start, 0);
  };
  const nextPicture = () => {
    setRun(null);
    setSeed(nextVariantSeed(role, seed, history.length + 1));
    setStage("intro");
  };
  const chooseRole = (next: E11Role) => {
    if (next === role) return;
    setRole(next);
    setSeed(nextVariantSeed(next, null, history.length));
    try {
      localStorage.setItem(e11RoleKey(historyOwner ?? "guest"), next);
    } catch {
      /* private mode */
    }
  };
  const chooseHints = (on: boolean) => {
    setHints(on);
    sceneRef.current?.setHints(on);
    try {
      localStorage.setItem(E11_HINTS_KEY, on ? "on" : "off");
    } catch {
      /* private mode */
    }
  };
  const chooseThrough = (on: boolean) => {
    setThrough(on);
    sceneRef.current?.setThroughMode(on);
  };
  const resume = () => {
    sceneRef.current?.setPaused(false);
    setPaused(false);
  };
  const leavePlay = () => {
    sceneRef.current?.setPaused(true);
    unlockOrientation();
    setPaused(false);
    setStage("intro");
  };

  // --- left thumb: the joystick relative to the view.
  const moveKnob = (dx: number, dy: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onStickDown = (e: React.PointerEvent) => {
    if (stickPointer.current !== null) return;
    stickPointer.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    stickOrigin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    onStickMove(e);
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return;
    const dx = e.clientX - stickOrigin.current.x,
      dy = e.clientY - stickOrigin.current.y;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
    moveKnob(dx * k, dy * k);
    sceneRef.current?.stick({ x: (dx * k) / STICK_RADIUS, y: (-dy * k) / STICK_RADIUS });
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return;
    stickPointer.current = null;
    moveKnob(0, 0);
    sceneRef.current?.stick(null);
  };
  const shoot = () => {
    if (sceneRef.current?.shot()) vibrate(8);
  };

  // --- keyboard fallback for a computer: WASD / arrows to move, Space to shoot, T pass mode.
  useEffect(() => {
    if (stage !== "play") return;
    const keys = new Set<string>();
    const send = () => {
      const x =
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      const y =
        (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      const n = Math.hypot(x, y);
      sceneRef.current?.stick(n ? { x: x / n, y: y / n } : null);
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keys.add(k);
        send();
      } else if (k === " ") {
        e.preventDefault();
        shoot();
      } else if (k === "t") chooseThrough(!through);
    };
    const up = (e: KeyboardEvent) => {
      if (keys.delete(e.key.toLowerCase())) send();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [stage, through]);

  const immersive = stage === "play";
  const played = history.filter((a) => a.role === role);
  return (
    <div
      className={`fp-root e11-root ${immersive ? "is-immersive" : ""}`}
      data-stage={stage}
      data-e11-variant={variant.id}
      data-hud={hud}
    >
      <div ref={hostRef} className="fp-stage" />
      <LandscapeGate active={stage === "play" && !landscape} />

      <header className="fp-top f5-top">
        <div className="f5-pill f5-crumb">
          <button type="button" className="f5-back" aria-label="Wróć" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
          <span>{stage === "debrief" ? "Co się stało" : "11 na 11 · moment podania"}</span>
        </div>
        <span className="fp-spacer" />
        {stage === "play" && (
          <button
            type="button"
            className="fp-icon f5-round"
            aria-label={paused ? "Wznów" : "Pauza"}
            onClick={() => {
              if (paused) resume();
              else {
                sceneRef.current?.setPaused(true);
                setPaused(true);
              }
            }}
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        )}
      </header>

      {stage === "loading" && <div className="fp-center">Ładowanie boiska…</div>}
      {stage === "error" && (
        <div className="fp-card fp-bottom" role="alert">
          <p>{error}</p>
          <button type="button" className="fp-primary" onClick={onBack}>
            Wróć
          </button>
        </div>
      )}

      {stage === "intro" && (
        <div className="fp-card fp-bottom">
          <p className="fp-kicker">11 na 11 · spalony i timing podania</p>
          <div className="e11-roles" role="group" aria-label="Pozycja">
            {ROLES.map((r) => (
              <button key={r} type="button" aria-pressed={r === role} onClick={() => chooseRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="fp-meta">
            Masz piłkę, a partnerzy ruszają za linię obrony. Spalony liczy się w chwili podania:
            zagraj, zanim partner minie linię, ale nie wcześniej, niż ruszy. Dotknij numeru
            partnera, żeby podać. „W wolne miejsce” posyła piłkę przed niego.
          </p>
          <div className="e11-hints" role="group" aria-label="Podpowiedzi">
            <button type="button" aria-pressed={hints} onClick={() => chooseHints(true)}>
              Z podpowiedziami
            </button>
            <button type="button" aria-pressed={!hints} onClick={() => chooseHints(false)}>
              Bez podpowiedzi
            </button>
          </div>
          {played.length > 0 && (
            <p className="fp-meta">
              Rozegrane fragmenty na tej pozycji: {played.length}. W czas:{" "}
              {played.filter((a) => a.timing === "inTime").length}, spalony:{" "}
              {played.filter((a) => a.outcome === "offside").length}.
            </p>
          )}
          <button type="button" className="fp-primary" onClick={start}>
            Start (telefon poziomo)
          </button>
        </div>
      )}

      {stage === "play" && (
        <>
          <div
            ref={stickRef}
            className="e11-stick"
            aria-label="Ruch"
            role="presentation"
            onPointerDown={onStickDown}
            onPointerMove={onStickMove}
            onPointerUp={onStickUp}
            onPointerCancel={onStickUp}
          >
            <div ref={knobRef} className="e11-knob" />
          </div>
          <div className="e11-actions">
            <div className="e11-mode" role="group" aria-label="Rodzaj podania">
              <button type="button" aria-pressed={!through} onClick={() => chooseThrough(false)}>
                Do nogi
              </button>
              <button type="button" aria-pressed={through} onClick={() => chooseThrough(true)}>
                W wolne miejsce
              </button>
            </div>
            <button
              type="button"
              className="e11-shot"
              disabled={paused || hud !== "with"}
              onPointerDown={(e) => {
                e.stopPropagation();
                shoot();
              }}
            >
              Strzał
            </button>
          </div>
          {hud === "with" && (
            <p className="e11-hint">
              Dotknij numeru partnera, żeby podać.{" "}
              {hints ? "Czerwony numer: partner jest teraz na spalonym." : ""}
            </p>
          )}
          {paused && (
            <div className="fp-card fp-bottom" role="dialog" aria-label="Pauza">
              <button type="button" className="fp-primary" onClick={resume}>
                Wróć do gry
              </button>
              <button type="button" className="fp-secondary" onClick={leavePlay}>
                Zakończ fragment
              </button>
            </div>
          )}
        </>
      )}

      {stage === "debrief" && run && (
        <>
          <ElevenDebrief debrief={run.debrief} snapshots={run.sim.snapshots} ty={run.sim.ty} />
          <div className="e11-debrief-actions">
            <button type="button" className="fp-secondary" onClick={nextPicture}>
              <RotateCcw size={16} aria-hidden="true" /> Nowy wariant
            </button>
            <button type="button" className="fp-primary" onClick={again}>
              Zagraj jeszcze raz
            </button>
          </div>
        </>
      )}
    </div>
  );
}
