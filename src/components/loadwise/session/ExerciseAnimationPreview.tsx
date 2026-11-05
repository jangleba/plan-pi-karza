import { useEffect, useId, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  resolveExerciseAnimation,
  type AnimationSelection,
} from "@/lib/trainingCoach/animationCatalog";
import { APP_VERSION } from "@/lib/appVersion";
import { boxTouchVariant, parseHoldSeconds } from "@/lib/trainingCoach/exerciseTempo";

export function ExerciseAnimationPreview({
  exercise,
  autoOpen = false,
  mirror = false,
}: {
  exercise: TrainingExercise;
  autoOpen?: boolean;
  mirror?: boolean;
}) {
  const selection = resolveExerciseAnimation(exercise);
  if (!selection) return null;
  return (
    <AnimationCard
      key={`${exercise.id}:${selection.id}:${selection.choices?.map((c) => c.id).join("|") ?? ""}`}
      selection={selection}
      exerciseName={exercise.name}
      autoOpen={autoOpen}
      mirror={mirror}
      tempo={exercise.tempo}
      holdSeconds={parseHoldSeconds(exercise.duration) ?? parseHoldSeconds(exercise.reps)}
      variant={boxTouchVariant(exercise.name, exercise.animationVariant)}
    />
  );
}

function AnimationCard({
  selection,
  exerciseName,
  autoOpen,
  mirror,
  tempo,
  holdSeconds,
  variant,
}: {
  selection: AnimationSelection;
  exerciseName: string;
  autoOpen: boolean;
  mirror: boolean;
  tempo?: string;
  holdSeconds: number | null;
  variant: string | null;
}) {
  const [selected, setSelected] = useState(selection.needsChoice ? "" : selection.id);
  const [opened, setOpened] = useState(autoOpen && !selection.needsChoice);
  const [catalog, setCatalog] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [height, setHeight] = useState(autoOpen ? 430 : 620);
  const frame = useRef<HTMLIFrameElement>(null);
  const card = useRef<HTMLElement>(null);
  const panelId = useId();
  const selectId = useId();
  const frameId = selected || selection.id;
  const src = `/technique/animations/index.html?id=${encodeURIComponent(frameId)}&embed=1&autoplay=1&v=${encodeURIComponent(APP_VERSION)}${mirror ? "&mirror=1" : ""}${tempo?.trim() ? `&tempo=${encodeURIComponent(tempo.trim().slice(0, 48))}` : ""}${holdSeconds !== null ? `&hold=${holdSeconds}` : ""}${variant ? `&variant=${encodeURIComponent(variant)}` : ""}${catalog ? "&catalog=1" : autoOpen ? "&compact=1" : ""}`;

  useEffect(() => {
    if (!opened) return;
    const pause = () =>
      frame.current?.contentWindow?.postMessage(
        { type: "ballwise-animation-pause" },
        window.location.origin,
      );
    const visibility = () => {
      if (document.hidden) pause();
    };
    const message = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      if (event.data?.type === "ballwise-animation-playing") {
        window.dispatchEvent(
          new CustomEvent("ballwise-active-animation", { detail: frame.current?.contentWindow }),
        );
      }
      if (event.data?.type === "ballwise-animation-height" && Number.isFinite(event.data.height)) {
        setHeight(
          Math.max(autoOpen && !catalog ? 280 : 440, Math.min(1200, Math.ceil(event.data.height))),
        );
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("message", message);
    const otherPlayer = (event: Event) => {
      if ((event as CustomEvent).detail !== frame.current?.contentWindow) pause();
    };
    window.addEventListener("ballwise-active-animation", otherPlayer);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            if (!entries[0]?.isIntersecting) pause();
          });
    if (card.current) observer?.observe(card.current);
    return () => {
      pause();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("message", message);
      window.removeEventListener("ballwise-active-animation", otherPlayer);
    };
  }, [opened, autoOpen, catalog]);

  function open(showCatalog = false) {
    if (!showCatalog && !selected) return;
    setCatalog(showCatalog);
    setLoaded(false);
    setOpened(true);
  }

  return (
    <section className="bw-animation-card" ref={card} aria-label={`Animacja: ${exerciseName}`}>
      {Boolean(selection.choices?.length) && (
        <div className="bw-animation-choice">
          <label htmlFor={selectId}>Wariant z Twojej sesji</label>
          <select
            id={selectId}
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setOpened(autoOpen && Boolean(event.target.value));
              setLoaded(false);
              setCatalog(false);
            }}
          >
            {selection.needsChoice && <option value="">Wybierz wariant ruchu</option>}
            {selection.choices?.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {!opened ? (
        <div className="bw-animation-actions">
          <button
            type="button"
            className="bw-animation-open"
            aria-controls={panelId}
            aria-expanded={false}
            disabled={!selected}
            onClick={() => open()}
          >
            <Play aria-hidden="true" />
            Pokaż animację ruchu
          </button>
          <button type="button" className="bw-animation-library" onClick={() => open(true)}>
            Biblioteka animacji
          </button>
        </div>
      ) : (
        <div id={panelId} className="bw-animation-panel">
          {!autoOpen && (
            <div className="bw-animation-panel-heading">
              <strong>Animacja poglądowa</strong>
              <button type="button" aria-label="Zamknij animację" onClick={() => setOpened(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
          )}
          {!loaded && (
            <p role="status" className="bw-animation-loading">
              Wczytuję animację…
            </p>
          )}
          <iframe
            key={src}
            ref={frame}
            src={src}
            title={`Animacja ćwiczenia: ${exerciseName}`}
            style={{ height }}
            onLoad={() => setLoaded(true)}
            className="bw-animation-frame"
          />
        </div>
      )}
      {selection.notes?.map((note) => (
        <p key={note} className="bw-animation-note">
          {note}
        </p>
      ))}
    </section>
  );
}
