import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { resolveHowTo } from "@/lib/loadwise/sessionRunner/howTo";
import type { AnimationSelection } from "@/lib/trainingCoach/animationCatalog";
import { boxTouchVariant, parseHoldSeconds } from "@/lib/trainingCoach/exerciseTempo";
import { APP_VERSION } from "@/lib/appVersion";

/**
 * The "Technika" tab: animation and a short instruction. It mounts only while
 * the tab is shown, so nothing is fetched before the athlete asks for it, and
 * switching back to "Trening" unmounts the player, which stops playback. It
 * never touches set entries, completion marks or the rest clock.
 */
export function HowToPanel({ id, exercise }: { id?: string; exercise: TrainingExercise }) {
  const howTo = useMemo(() => resolveHowTo(exercise), [exercise]);
  return (
    <div id={id} className="bw-howto-panel">
      {exercise.displayPrescription && (
        <p className="text-sm font-medium">
          {exercise.displayPrescription}
          {exercise.restAfterExercise ? ` · odpoczynek ${exercise.restAfterExercise}` : ""}
        </p>
      )}
      {howTo.objective && (
        <p className="text-sm leading-relaxed text-muted-foreground">{howTo.objective}</p>
      )}
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
      {howTo.cue && <p className="text-sm font-medium">{howTo.cue}</p>}
      {howTo.stop && <p className="text-xs leading-relaxed text-muted-foreground">{howTo.stop}</p>}
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
      {exercise.engineDose?.speedStage && (
        <p className="text-xs text-muted-foreground">
          Zwolniony pokaz techniki. Tempo animacji nie wyznacza tempa Twojego biegu.
        </p>
      )}
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
