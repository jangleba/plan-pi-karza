import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X, ChevronRight } from "lucide-react";
import { getTopic } from "@/lib/football-iq/topics";
import {
  generateSequence,
  stimulusGlyph,
  stimulusLabel,
  type Stimulus,
} from "@/lib/football-iq/stimuli";

export const Route = createFileRoute("/football-iq/field")({
  component: FieldMode,
  validateSearch: (s: Record<string, unknown>) => ({
    topic: typeof s.topic === "string" ? s.topic : "",
  }),
});

const STIMULUS_MS = 4000;

function FieldMode() {
  const { topic: topicId } = Route.useSearch();
  const navigate = useNavigate();
  const topic = getTopic(topicId);

  const total = topic?.fieldReps ?? 6;
  const [sequence, setSequence] = useState<Stimulus[]>(() =>
    generateSequence(total),
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<"ready" | "cue" | "done">("ready");
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const next = useCallback(() => {
    setIndex((i) => {
      const n = i + 1;
      if (n >= total) {
        setPhase("done");
        return i;
      }
      return n;
    });
  }, [total]);

  // Auto-advance while cue is visible.
  useEffect(() => {
    clearTimer();
    if (phase !== "cue" || paused) return;
    timerRef.current = window.setTimeout(() => {
      next();
    }, STIMULUS_MS);
    return clearTimer;
  }, [phase, paused, index, next]);

  useEffect(() => () => clearTimer(), []);

  const exitToSummary = useCallback(
    (repsDone: number) => {
      navigate({
        to: "/football-iq",
        search: {
          topic: topicId,
          step: "summary",
          reps: repsDone,
        },
      });
    },
    [navigate, topicId],
  );

  const handleExit = () => {
    const done = phase === "done" ? total : index;
    exitToSummary(done);
  };

  useEffect(() => {
    if (phase === "done") {
      const t = window.setTimeout(() => exitToSummary(total), 900);
      return () => window.clearTimeout(t);
    }
  }, [phase, total, exitToSummary]);

  if (!topic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Nie znaleziono tematu.
      </div>
    );
  }

  const current = sequence[index];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[color:var(--color-graphite)] text-[color:var(--color-graphite-foreground)]">
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 pb-3 pt-5"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
      >
        <button
          onClick={handleExit}
          aria-label="Zakończ sesję"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold tabular-nums tracking-wide">
          {Math.min(index + (phase === "cue" ? 1 : 0), total)} / {total}
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Wznów" : "Pauza"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 active:scale-95"
          disabled={phase !== "cue"}
        >
          {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 pb-2">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${
              i < index
                ? "w-4 bg-white/80"
                : i === index && phase === "cue"
                  ? "w-6 bg-white"
                  : "w-4 bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {phase === "ready" && (
          <>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              {topic.title}
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-tight">
              Gotowy?
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
              Piłka wychodzi z Twojej stopy. W trakcie ruchu piłki odwróć głowę
              i odczytaj bodziec.
            </p>
            <button
              onClick={() => setPhase("cue")}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[color:var(--color-graphite)] active:scale-95"
            >
              Start <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {phase === "cue" && current && (
          <>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              {stimulusLabel(current)}
            </div>
            <div
              className="mt-4 select-none font-bold leading-none"
              style={{
                fontSize: "min(56vw, 46vh)",
                letterSpacing: "-0.04em",
              }}
            >
              {stimulusGlyph(current)}
            </div>
            {paused && (
              <div className="mt-6 text-xs font-medium uppercase tracking-widest text-white/60">
                Pauza
              </div>
            )}
          </>
        )}

        {phase === "done" && (
          <>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              Koniec sesji
            </div>
            <h1 className="mt-4 text-2xl font-semibold">Świetnie.</h1>
            <p className="mt-3 text-sm text-white/70">Przechodzę do podsumowania…</p>
          </>
        )}
      </div>

      {/* Bottom hint */}
      <div
        className="px-6 pb-6 pt-3 text-center text-[11px] leading-relaxed text-white/50"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        {phase === "cue"
          ? "Ekran pokazuje warunek. Decyzję podejmujesz sam."
          : "Trzymaj telefon stabilnie, poziomo, za sobą."}
      </div>
    </div>
  );
}
