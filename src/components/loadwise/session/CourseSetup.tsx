import { useEffect, useRef, useState } from "react";
import { ChevronDown, Ruler } from "lucide-react";
import { validCourseTarget, type CourseMeasurement } from "@/lib/courseMeasure/model";
import {
  courseMeasureError,
  measureCourse,
  supportsNativeCourseMeasure,
} from "@/lib/courseMeasure/native";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { TrainingFieldBoard } from "@/components/football/TrainingFieldBoard";
import "./sprint-tools.css";

type CourseExercise = Pick<
  TrainingExercise,
  "reps" | "duration" | "displayPrescription" | "engineDose"
> &
  Partial<Pick<TrainingExercise, "id" | "name" | "exerciseId">>;
const physicalTarget = (value: number) => Number.isFinite(value) && value >= 1 && value <= 400;
const COMPOUND_COURSES = new Set([
  "planned_505",
  "planned_cut",
  "cut_and_reaccelerate",
  "deceleration_lateral_exit",
  "reactive_180_turn",
  "accel_decel_reaccel",
]);
const compoundCourse = (exercise: CourseExercise) =>
  COMPOUND_COURSES.has(exercise.exerciseId ?? "");

function declaredDistances(exercise: CourseExercise): number[] {
  const distances = new Set<number>();
  for (const distance of [
    exercise.engineDose?.distanceM,
    exercise.engineDose?.runInM,
    exercise.engineDose?.runOutM,
  ])
    if (typeof distance === "number" && physicalTarget(distance)) distances.add(distance);
  for (const text of [exercise.reps, exercise.duration, exercise.displayPrescription]) {
    if (!text || /\d\s*(?:[-–—+]|do)\s*\d/i.test(text)) continue;
    for (const match of text.matchAll(/(?<![\p{L}\d.,+\-–—])(\d+(?:[.,]\d+)?)\s*m\b(?!\s*\/)/giu)) {
      const distance = Number(match[1].replace(",", "."));
      if (physicalTarget(distance)) distances.add(distance);
    }
  }
  return [...distances];
}

/** Physical markers may be farther apart than the camera's 30 m limit. */
export function courseSetupDistances(exercises: ReadonlyArray<CourseExercise>): number[] {
  const distances = new Set<number>();
  for (const exercise of exercises) {
    const declared = declaredDistances(exercise);
    if (compoundCourse(exercise)) {
      // The known 5-0-5 contract is 5 m out + 5 m back. Other total distances
      // do not say where their turn or brake marker belongs.
      const known505 =
        exercise.exerciseId === "planned_505" &&
        (exercise.engineDose !== undefined
          ? exercise.engineDose.distanceM === 10
          : declared.length === 1 && declared[0] === 10);
      if (known505) distances.add(5);
      continue;
    }
    for (const distance of declared) distances.add(distance);
  }
  return [...distances];
}

export function CourseSetup({ exercises }: { exercises: ReadonlyArray<CourseExercise> }) {
  const scope = JSON.stringify(
    exercises.map((exercise) => [
      exercise.id,
      exercise.exerciseId,
      exercise.name,
      exercise.reps,
      exercise.duration,
      exercise.displayPrescription,
      exercise.engineDose?.distanceM,
      exercise.engineDose?.runInM,
      exercise.engineDose?.runOutM,
    ]),
  );
  return <CourseSetupContent key={scope} exercises={exercises} />;
}

/** A changed course owns a fresh target and ignores the previous camera request. */
function CourseSetupContent({ exercises }: { exercises: ReadonlyArray<CourseExercise> }) {
  const distances = courseSetupDistances(exercises);
  const compound = exercises.some(compoundCourse);
  const known505 =
    exercises.length === 1 && exercises[0].exerciseId === "planned_505" && distances[0] === 5;
  const [targetText, setTargetText] = useState(String(distances[0] ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CourseMeasurement | null>(null);
  const [native, setNative] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const target = Number(targetText.replace(",", "."));

  useEffect(() => {
    mounted.current = true;
    setNative(supportsNativeCourseMeasure());
    return () => {
      mounted.current = false;
    };
  }, []);

  function changeTarget(text: string) {
    setTargetText(text);
    setResult(null);
    setError(null);
  }

  async function openMeasure() {
    if (inFlight.current || !validCourseTarget(target)) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const measurement = await measureCourse(target);
      if (mounted.current) setResult(measurement);
    } catch (caught) {
      if (mounted.current) setError(courseMeasureError(caught));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <details className="bw-course-setup">
      <summary className="bw-course-summary">
        <Ruler className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>Ustawienie odcinka</span>
        {distances.length > 0 && (
          <small>{distances.map((distance) => `${distance} m`).join(" · ")}</small>
        )}
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="bw-course-content">
        {exercises.length === 1 &&
          typeof exercises[0].id === "string" &&
          typeof exercises[0].name === "string" && (
            <TrainingFieldBoard exercise={exercises[0] as TrainingExercise} compact />
          )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {known505
            ? "Odmierz taśmą 5 m od startu do linii zwrotu. Bieg tam i z powrotem daje 10 m pracy."
            : compound
              ? "Dystans z planu jest sumą części. Odmierz każdy fragment osobno taśmą, według opisu ustawienia."
              : "Odmierz odległości taśmą przed ustawieniem znaczników."}
        </p>
        {native && (
          <details className="bw-course-camera">
            <summary>Odmierz kamerą</summary>
            <div>
              {distances.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Części do odmierzenia:</span>
                  {distances.map((distance) => (
                    <button
                      key={distance}
                      type="button"
                      disabled={busy}
                      onClick={() => changeTarget(String(distance))}
                      aria-pressed={target === distance}
                      className="min-h-11 px-3 text-xs font-semibold"
                    >
                      {distance} m
                    </button>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-3 text-xs text-muted-foreground">
                {compound ? "Dystans jednej części" : "Dystans do ustawienia"}
                <input
                  type="number"
                  min={1}
                  max={400}
                  step="0.1"
                  inputMode="decimal"
                  value={targetText}
                  placeholder={compound ? "Część z instrukcji" : "Dystans"}
                  disabled={busy}
                  onChange={(event) => changeTarget(event.target.value)}
                  className="min-h-11 w-24 rounded-md bg-background px-3 text-sm text-foreground"
                />
                m
              </label>
              {targetText && !physicalTarget(target) && (
                <p className="text-xs text-destructive">Wpisz dystans od 1 do 400 m.</p>
              )}
              <button
                type="button"
                disabled={busy || !validCourseTarget(target)}
                onClick={() => void openMeasure()}
                className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Miarka otwarta…" : "Wyznacz kamerą"}
              </button>
              {physicalTarget(target) && !validCourseTarget(target) && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Miarka kamery obsługuje odcinki do 30 m. Ten dystans odmierz taśmą.
                </p>
              )}
              {error && (
                <p role="alert" className="text-xs leading-relaxed text-destructive">
                  {error}
                </p>
              )}
              {result && (
                <p role="status" className="text-xs leading-relaxed text-foreground">
                  Wyznaczony odcinek: około{" "}
                  {result.measuredMeters.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} m.
                  Cel: {result.targetMeters} m. Ustaw fizyczne znaczniki przed rozpoczęciem biegu.
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Miarka kamery daje wynik orientacyjny. Dokładne odległości sprawdź taśmą.
              </p>
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
