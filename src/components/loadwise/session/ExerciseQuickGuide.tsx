import type { TrainingExercise } from "@/lib/loadwise/types";
import { resolveDefinitionForExercise } from "@/lib/loadwise/sessionPresentation";
import { resolveQuickGuide } from "@/lib/courseMeasure/quickGuide";
import { ChevronDown } from "lucide-react";
import "./sprint-session.css";

export function ExerciseQuickGuide({
  exercise,
  className = "",
}: {
  exercise: TrainingExercise;
  className?: string;
}) {
  const guide = resolveQuickGuide(
    exercise,
    resolveDefinitionForExercise(exercise),
  );
  if (!guide.setup && !guide.action && !guide.focus && !guide.error)
    return null;
  return (
    <details className={`bw-quick-guide ${className}`}>
      <summary>
        <span className="bw-guide-heading">
          <span className="bw-guide-badge">Technika</span>
          <ChevronDown className="bw-guide-chevron" aria-hidden="true" />
        </span>
        <span className="bw-guide-focus">
          {guide.focus ?? "Krótka instrukcja"}
        </span>
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
