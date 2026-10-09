import { useEffect, useRef, useState } from "react";
import { Ruler } from "lucide-react";
import {
  explicitCourseDistances,
  validCourseTarget,
  type CourseMeasurement,
} from "@/lib/courseMeasure/model";
import {
  courseMeasureError,
  measureCourse,
  supportsNativeCourseMeasure,
} from "@/lib/courseMeasure/native";

export function CourseSetup({
  exercises,
}: {
  exercises: ReadonlyArray<{
    reps?: string;
    duration?: string;
    displayPrescription?: string;
  }>;
}) {
  const distances = explicitCourseDistances(exercises);
  const [targetText, setTargetText] = useState(String(distances[0] ?? 20));
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
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 text-sm font-semibold text-foreground">
        <Ruler className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="flex-1">Przygotuj odcinek</span>
        <span className="bw-course-badge">Miarka</span>
      </summary>
      <div className="space-y-3 pb-1 pt-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Ustaw znaczniki na początku i końcu odcinka. Zostaw wolne miejsce za
          końcem na wyhamowanie.
        </p>
        {distances.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Dystanse z planu:
            </span>
            {distances.map((distance) => (
              <button
                key={distance}
                type="button"
                disabled={busy}
                onClick={() => changeTarget(String(distance))}
                aria-pressed={target === distance}
                className="min-h-11 rounded-md border border-border px-3 text-xs font-semibold text-primary disabled:opacity-50"
              >
                {distance} m
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          Dystans do ustawienia
          <input
            type="number"
            min={1}
            max={30}
            step="0.1"
            inputMode="decimal"
            value={targetText}
            disabled={busy}
            onChange={(event) => changeTarget(event.target.value)}
            className="min-h-11 w-24 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
          m
        </label>
        {!validCourseTarget(target) && (
          <p className="text-xs text-destructive">
            Wpisz dystans od 1 do 30 m.
          </p>
        )}
        {native ? (
          <button
            type="button"
            disabled={busy || !validCourseTarget(target)}
            onClick={() => void openMeasure()}
            className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Miarka otwarta…" : "Wyznacz kamerą"}
          </button>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Miarka kamery jest dostępna w aplikacji iPhone. Tutaj odcinek
            odmierz taśmą.
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
            {result.measuredMeters.toLocaleString("pl-PL", {
              maximumFractionDigits: 1,
            })}{" "}
            m. Cel: {result.targetMeters} m. Ustaw fizyczne znaczniki przed
            rozpoczęciem biegu.
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Prototyp. Pomiar orientacyjny do ustawienia treningu. Do dokładnego
          odmierzenia użyj taśmy.
        </p>
      </div>
    </details>
  );
}
