import type { SessionDay, TrainingExercise } from "@/lib/loadwise/types";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { sessionRunningRecipe } from "@/lib/running/recipeSession";
import { TrainingFieldBoard } from "@/components/football/TrainingFieldBoard";
import "./run-tools.css";

/** Optional setup is available before and during the run; it never starts a timer. */
export function RunCourseSetup({ session }: { session: SessionDay }) {
  const protocol = deriveRunningIntervalProtocol(session);
  if (!protocol?.steps.length) return null;
  const recipe = sessionRunningRecipe(session);
  const work = protocol.steps.filter((step) => step.kind === "work");
  const timeOnly = work.length > 0 && work.every((step) => step.target.mode === "time");
  const distances = [
    ...new Set(
      [
        ...(recipe?.blocks.flatMap((block) =>
          block.work.distanceM ? [block.work.distanceM] : [],
        ) ?? []),
        ...protocol.steps.flatMap((step) =>
          step.kind === "work" && step.target.mode === "distance" && step.target.value
            ? [step.target.value]
            : [],
        ),
      ].filter((distance) => Number.isFinite(distance) && distance > 0),
    ),
  ];
  return (
    <details className="bw-run-setup">
      <summary>Przygotuj trasę</summary>
      {distances.length ? (
        distances.map((distanceM) => {
          // Display data only: never changes or saves the session's prescription.
          const exercise: TrainingExercise = {
            id: `run-course-${distanceM}`,
            exerciseId: "running_interval_course",
            name: `Odcinek ${distanceM} m`,
            engineDose: { sets: 1, distanceM, restSeconds: 0, intent: "controlled" },
          };
          return <TrainingFieldBoard key={distanceM} exercise={exercise} compact />;
        })
      ) : (
        <p>
          Wybierz równą, bezpieczną trasę bez ruchu ulicznego.{" "}
          {timeOnly
            ? "Ta sesja jest rozpisana na czas: nie musisz ustawiać odcinka o określonej długości."
            : "Ustaw odcinek zgodnie z opisem sesji. Plan nie podaje dokładnej długości trasy."}
        </p>
      )}
      <p>Licznik prowadzi przez pracę i przerwy zgodnie z planem.</p>
    </details>
  );
}
