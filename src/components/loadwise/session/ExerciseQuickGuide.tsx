import type { TrainingExercise } from "@/lib/loadwise/types";
import { resolveDefinitionForExercise } from "@/lib/loadwise/sessionPresentation";
import { resolveQuickGuide } from "@/lib/courseMeasure/quickGuide";
import { getSkipGuide, SKIP_LANDING } from "@/lib/loadwise/skipGuides";
import { getExerciseTechniqueImage } from "@/lib/loadwise/exerciseTechniqueImages";
import { ChevronDown } from "lucide-react";
import "./sprint-session.css";

export function ExerciseQuickGuide({
  exercise,
  className = "",
}: {
  exercise: TrainingExercise;
  className?: string;
}) {
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
      </section>
    );
  }
  const guide = resolveQuickGuide(exercise, resolveDefinitionForExercise(exercise));
  if (!guide.setup && !guide.action && !guide.focus && !guide.error) return null;
  return (
    <details className={`bw-quick-guide ${className}`}>
      <summary>
        <span className="bw-guide-heading">
          <span className="bw-guide-badge">Technika</span>
          <ChevronDown className="bw-guide-chevron" aria-hidden="true" />
        </span>
        <span className="bw-guide-focus">{guide.focus ?? "Krótka instrukcja"}</span>
      </summary>
      <dl>
        {guide.setup && (
          <div>
            <dt>Ustaw</dt>
            <dd>{guide.setup}</dd>
          </div>
        )}
        {guide.action && (
          <div>
            <dt>Zrób</dt>
            <dd>{guide.action}</dd>
          </div>
        )}
        {guide.error && (
          <div>
            <dt>Unikaj</dt>
            <dd>{guide.error}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}
