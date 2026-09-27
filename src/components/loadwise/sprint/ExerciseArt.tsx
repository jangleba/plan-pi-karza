import { resolveSprintVisual } from "@/lib/loadwise/sprint/visualRegistry";
import type { SprintExercise } from "@/lib/loadwise/sprint/types";

interface ExerciseArtProps {
  exercise: SprintExercise;
  compact?: boolean;
  decorative?: boolean;
}

export function ExerciseArt({ exercise, compact = false, decorative = false }: ExerciseArtProps) {
  const src = resolveSprintVisual(exercise);
  if (!src) return null;

  return (
    <img
      src={src}
      alt={decorative ? "" : `${exercise.title} — sekwencja techniczna`}
      aria-hidden={decorative || undefined}
      loading={compact ? "lazy" : "eager"}
      decoding="async"
      className={compact ? "h-16 w-28 shrink-0 object-contain" : "mx-auto h-auto max-h-[38vh] w-full object-contain"}
    />
  );
}

