import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { resolveHowTo } from "@/lib/loadwise/sessionRunner/howTo";
import type { AnimationSelection } from "@/lib/trainingCoach/animationCatalog";
import { boxTouchVariant, parseHoldSeconds } from "@/lib/trainingCoach/exerciseTempo";
import { APP_VERSION } from "@/lib/appVersion";

/**
 * "Jak wykonać" under the current exercise. Nothing is resolved or fetched
 * until the athlete opens it; closing it unmounts the animation, which stops
 * playback. It never touches set entries, completion marks or the rest clock.
 */
export function HowToSection({
  exercise,
  defaultOpen = false,
}: {
  exercise: TrainingExercise;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="bw-howto" data-open={open || undefined}>
      <button
        type="button"
        className="bw-howto-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <strong>Jak wykonać</strong>
          <small>Animacja i krótkie instrukcje</small>
        </span>
        <ChevronDown aria-hidden="true" className={open ? "is-open" : undefined} />
      </button>
      {open && <HowToPanel id={panelId} exercise={exercise} />}
    </section>
  );
}

function HowToPanel({ id, exercise }: { id: string; exercise: TrainingExercise }) {
  const howTo = useMemo(() => resolveHowTo(exercise), [exercise]);
  return (
    <div id={id} className="bw-howto-panel">
      {howTo.animation ? (
        <AnimationStage
          key={`${exercise.id}:${howTo.animation.id}`}
          selection={howTo.animation}
          exercise={exercise}
        />
      ) : (
        <p className="bw-howto-gap">{howTo.animationGap}</p>
      )}
      {howTo.steps.length > 0 ? (
        <ol className="bw-howto-steps">
          {howTo.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : (
        <p className="bw-howto-gap">Wykonaj zadanie zgodnie z opisem dawki.</p>
      )}
      {howTo.watch.length > 0 && (
        <div className="bw-howto-watch">
          <h4>Na co uważać</h4>
          <ul>
            {howTo.watch.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type PlayerState = {
  ready: boolean;
  playing: boolean;
  speed: number;
  phases: string[];
  current: number;
};

function AnimationStage({
  selection,
  exercise,
}: {
  selection: AnimationSelection;
  exercise: TrainingExercise;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<PlayerState | null>(null);
  const tempo = exercise.tempo?.trim();
  const hold = parseHoldSeconds(exercise.duration) ?? parseHoldSeconds(exercise.reps);
  const variant = boxTouchVariant(exercise.name, exercise.animationVariant);
  const src =
    `/technique/animations/index.html?id=${encodeURIComponent(selection.id)}` +
    `&embed=1&minimal=1&autoplay=1&v=${encodeURIComponent(APP_VERSION)}` +
    (tempo ? `&tempo=${encodeURIComponent(tempo.slice(0, 48))}` : "") +
    (hold !== null ? `&hold=${hold}` : "") +
    (variant ? `&variant=${encodeURIComponent(variant)}` : "");

  useEffect(() => {
    const target = () => frame.current?.contentWindow ?? null;
    const message = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== target()) return;
      if (event.data?.type === "ballwise-animation-state") {
        const data = event.data as PlayerState;
        setState({
          ready: Boolean(data.ready),
          playing: Boolean(data.playing),
          speed: Number(data.speed) || 1,
          phases: Array.isArray(data.phases) ? data.phases.slice(0, 6).map(String) : [],
          current: Number.isInteger(data.current) ? data.current : -1,
        });
      }
      if (event.data?.type === "ballwise-animation-playing")
        window.dispatchEvent(new CustomEvent("ballwise-active-animation", { detail: target() }));
    };
    const pause = () =>
      target()?.postMessage({ type: "ballwise-animation-pause" }, window.location.origin);
    const otherPlayer = (event: Event) => {
      if ((event as CustomEvent).detail !== target()) pause();
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("message", message);
    window.addEventListener("ballwise-active-animation", otherPlayer);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      pause();
      window.removeEventListener("message", message);
      window.removeEventListener("ballwise-active-animation", otherPlayer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  function command(name: "play" | "pause" | "speed" | "phase", value?: number) {
    frame.current?.contentWindow?.postMessage(
      { type: "ballwise-animation-command", command: name, value },
      window.location.origin,
    );
  }

  const slow = state?.speed === 0.5;
  return (
    <div className="bw-howto-animation" aria-label={`Animacja: ${selection.title}`}>
      <div className="bw-howto-stage">
        {!state?.ready && (
          <p role="status" className="bw-howto-loading">
            Wczytuję animację…
          </p>
        )}
        <iframe
          ref={frame}
          src={src}
          title={`Animacja ćwiczenia: ${selection.title}`}
          className="bw-howto-frame"
        />
      </div>
      <div className="bw-howto-controls">
        <button
          type="button"
          disabled={!state?.ready}
          onClick={() => command(state?.playing ? "pause" : "play")}
          aria-label={state?.playing ? "Pauza animacji" : "Odtwórz animację"}
        >
          {state?.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span>{state?.playing ? "Pauza" : "Odtwórz"}</span>
        </button>
        <button
          type="button"
          disabled={!state?.ready}
          aria-pressed={slow}
          onClick={() => command("speed", slow ? 1 : 0.5)}
        >
          0,5×
        </button>
      </div>
      {state && state.phases.length > 1 && state.phases.every((phase) => phase.length <= 36) && (
        <div className="bw-howto-phases" role="group" aria-label="Etapy ruchu">
          {state.phases.map((phase, index) => (
            <button
              key={`${index}:${phase}`}
              type="button"
              aria-pressed={state.current === index && !state.playing}
              data-current={state.current === index || undefined}
              onClick={() => command("phase", index)}
            >
              {phase}
            </button>
          ))}
        </div>
      )}
      <p className="bw-howto-note">{selection.title} · animacja poglądowa</p>
    </div>
  );
}
