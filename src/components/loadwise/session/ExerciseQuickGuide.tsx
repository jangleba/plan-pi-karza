import type { TrainingExercise } from "@/lib/loadwise/types";
import { resolveDefinitionForExercise } from "@/lib/loadwise/sessionPresentation";
import { resolveQuickGuide } from "@/lib/courseMeasure/quickGuide";
import { getSkipGuide, SKIP_LANDING } from "@/lib/loadwise/skipGuides";
import { getExerciseTechniqueImage } from "@/lib/loadwise/exerciseTechniqueImages";
import { Lightbulb } from "lucide-react";
import { useId, useState } from "react";
import { techniqueHint } from "@/lib/trainingCoach/coach";
import { ExerciseCoach } from "./ExerciseCoach";
import "./training-coach.css";
import "./sprint-session.css";
import type { ReactNode } from "react";

export function ExerciseQuickGuide({
  exercise,
  className = "",
  compact = false,
  children,
}: {
  exercise: TrainingExercise;
  className?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hint = techniqueHint(exercise);
  const skip = getSkipGuide(exercise.exerciseId);
  if (skip) {
    const image = getExerciseTechniqueImage(skip.exerciseId);
    return (
      <section aria-label={`${skip.title} — jak wykonać`} className={`bw-skip-guide ${className}`}>
        {image && (
          <img
            src={image.src}
            alt={image.alt}
            width={1536}
            height={1024}
            loading="lazy"
            decoding="async"
            className="bw-skip-image"
          />
        )}
        <ol className="bw-skip-steps">
          {skip.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="bw-skip-landing">{SKIP_LANDING}</p>
        <button type="button" className="bw-technique-trigger" aria-expanded={open} aria-controls={panelId}
          onClick={() => setOpen(!open)}><Lightbulb aria-hidden="true" /> Wskazówki</button>
        {open && <div id={panelId}><p>{hint.intent}</p><ExerciseCoach key={exercise.id} exercise={exercise} /></div>}
      </section>
    );
  }
  const guide = resolveQuickGuide(exercise, resolveDefinitionForExercise(exercise));
  if (!guide.setup && !guide.action && !guide.focus && !guide.error && !children) return null;
  return (
    <details className={`bw-quick-guide bw-technique-help ${compact ? "bw-strength-guide" : ""} ${className}`}
      onToggle={event => setOpen(event.currentTarget.open)}>
      <summary aria-label={`Wskazówki: ${exercise.name}`}>
        <Lightbulb aria-hidden="true" /> Wskazówki
      </summary>
      <dl className="bw-technique-hints">
        {guide.setup && <div><dt>Ustawienie</dt><dd>{guide.setup}</dd></div>}
        <div><dt>Intencja</dt><dd>{hint.intent}</dd></div>
        <div><dt>Wykonanie</dt><dd>{hint.action}</dd></div>
        <div><dt>Unikaj</dt><dd>{hint.avoid}</dd></div>
        {guide.action && guide.action !== hint.action && <div><dt>Instrukcja sesji</dt><dd>{guide.action}</dd></div>}
        {guide.error && guide.error !== hint.avoid && <div><dt>Błąd do kontroli</dt><dd>{guide.error}</dd></div>}
      </dl>
      {children}
      {open && <ExerciseCoach key={exercise.id} exercise={exercise} />}
    </details>
  );
}
