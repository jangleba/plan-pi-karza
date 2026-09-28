import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, RotateCcw, ShieldCheck, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bestSideAsymmetry, createLabResult, sideLabel, summarizeResults } from "@/lib/lab/engine";
import { getLabTest } from "@/lib/lab/definitions";
import { deleteLabVideo, recordLabVideo } from "@/lib/lab/nativeCamera";
import { saveLabResult } from "@/lib/lab/storage";
import type { LabAttempt, LabMarkers, LabResult, NativeVideoCapture } from "@/lib/lab/types";
import { validateCaptureTiming } from "@/lib/lab/timing";
import { newLabId } from "@/lib/lab/id";
import { displayLabValue, LabMeasurementDetails } from "./LabMeasurement";
import { FrameAnalyzer } from "./FrameAnalyzer";

type Stage = "setup" | "recording" | "analyze" | "result" | "summary";

export function LabFlow({
  userId,
  attempts,
  onSaved,
  onClose,
}: {
  userId: string;
  attempts: LabAttempt[];
  onSaved: (result: LabResult) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("setup");
  const [index, setIndex] = useState(0);
  const [capture, setCapture] = useState<NativeVideoCapture | null>(null);
  const [currentResult, setCurrentResult] = useState<LabResult | null>(null);
  const [batchResults, setBatchResults] = useState<LabResult[]>([]);
  const batchId = useMemo(newLabId, []);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const captureRef = useRef<NativeVideoCapture | null>(null);
  const pendingResult = useRef<LabResult | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Do not delete a recording whose local save has not completed.
      if (!savingRef.current) void deleteLabVideo(captureRef.current?.path);
    };
  }, []);
  const attempt = attempts[index];
  const test = getLabTest(attempt.testId);
  const side = sideLabel(attempt.side);

  async function cancelCapture() {
    if (savingRef.current) return;
    await deleteLabVideo(capture?.path);
    captureRef.current = null;
    pendingResult.current = null;
    setCapture(null);
    setCurrentResult(null);
    setStage("setup");
  }

  const recordingRef = useRef(false);
  async function record() {
    if (recordingRef.current) return;
    recordingRef.current = true;
    setStage("recording");
    try {
      const recorded = await recordLabVideo(test.maxCaptureSeconds);
      if (!mounted.current) {
        await deleteLabVideo(recorded.path);
        return;
      }
      try {
        validateCaptureTiming(recorded);
      } catch (error) {
        await deleteLabVideo(recorded.path);
        throw error;
      }
      captureRef.current = recorded;
      pendingResult.current = null;
      setCapture(recorded);
      setStage("analyze");
    } catch (error) {
      if (!mounted.current) return;
      setStage("setup");
      const message = error instanceof Error ? error.message : "Nie udało się nagrać próby.";
      if (!/cancel|anul/i.test(message)) toast.error(message);
    } finally {
      recordingRef.current = false;
    }
  }

  async function calculate(markers: LabMarkers) {
    if (
      !capture ||
      markers.firstFrame === null ||
      markers.secondFrame === null ||
      savingRef.current
    )
      return;
    savingRef.current = true;
    setSaving(true);
    try {
      const trialNumber =
        batchResults.filter((row) => row.testId === attempt.testId && row.side === attempt.side)
          .length + 1;
      const result =
        pendingResult.current ??
        createLabResult({
          userId,
          batchId,
          attempt: { ...attempt, trialNumber },
          capture,
          firstFrame: markers.firstFrame,
          secondFrame: markers.secondFrame,
          trimStartFrame: markers.trimStartFrame,
          trimEndFrame: markers.trimEndFrame,
          firstGuidePosition: markers.firstGuidePosition,
          secondGuidePosition: markers.secondGuidePosition,
        });
      pendingResult.current = result;
      const saved = await saveLabResult(result);
      // A durable local write is required before deleting the recording.
      await deleteLabVideo(capture.path);
      captureRef.current = null;
      if (!mounted.current) return;
      setCapture(null);
      setCurrentResult(saved.result);
      setBatchResults((rows) => [
        ...rows.filter((row) => row.id !== saved.result.id),
        saved.result,
      ]);
      onSaved(saved.result);
      setStage("result");
      if (!saved.cloudSaved)
        toast.info("Wynik zapisany w telefonie. Synchronizacja nastąpi później.");
    } catch (error) {
      // No durable write happened: allow corrected markers and retain the video.
      pendingResult.current = null;
      if (mounted.current)
        toast.error(error instanceof Error ? error.message : "Nie udało się zapisać wyniku.");
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function next() {
    setCurrentResult(null);
    if (index + 1 >= attempts.length) {
      setStage("summary");
      return;
    }
    setIndex((value) => value + 1);
    setStage("setup");
  }

  if (stage === "analyze" && capture) {
    return (
      <FrameAnalyzer
        capture={capture}
        saving={saving}
        test={test}
        onCancel={() => void cancelCapture()}
        onComplete={(markers) => void calculate(markers)}
      />
    );
  }

  if (stage === "recording") {
    return (
      <div className="fixed inset-0 z-[110] grid place-items-center bg-[#071426] px-8 text-center text-white">
        <div>
          <div className="mx-auto h-10 w-10 animate-pulse rounded-full border-4 border-white/20 border-t-[#f4c84a]" />
          <p className="mt-5 text-lg font-semibold">Otwieramy kamerę 240 FPS…</p>
        </div>
      </div>
    );
  }

  if (stage === "result" && currentResult) {
    const { metrics } = currentResult;
    return (
      <div className="fixed inset-0 z-[110] overflow-y-auto bg-background px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-lg">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-full bg-secondary"
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Check className="h-7 w-7" />
            </span>
            <p className="mt-5 text-sm font-medium text-muted-foreground">
              {test.title}
              {side ? ` • ${side}` : ""}
            </p>
            <p className="mt-2 text-[52px] font-semibold leading-none tracking-[-0.055em] text-foreground">
              {displayLabValue(metrics.primaryValue, metrics.primaryUnit)}
            </p>
            <LabMeasurementDetails metrics={metrics} />
          </div>
          <div className="soft-card mt-10 space-y-3 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Czas pomiaru</span>
              <strong>{metrics.elapsedSeconds.toFixed(4)} s</strong>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Nagranie</span>
              <strong>{currentResult.fps.toFixed(0)} FPS</strong>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Rozdzielczość czasu</span>
              <strong>{currentResult.quality.frameResolutionMs.toFixed(2)} ms</strong>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" /> Sprawdzono oś czasu nagrania i zakres
              wyniku.
            </div>
          </div>
          <Button className="mt-6 h-12 w-full rounded-full" onClick={next}>
            {index + 1 < attempts.length ? "Następna próba" : "Zobacz podsumowanie"}
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            className="mt-2 h-12 w-full rounded-full"
            variant="outline"
            disabled={
              batchResults.filter(
                (row) => row.testId === attempt.testId && row.side === attempt.side,
              ).length +
                attempts
                  .slice(index + 1)
                  .filter((row) => row.testId === attempt.testId && row.side === attempt.side)
                  .length >=
              10
            }
            onClick={() => setStage("setup")}
          >
            <RotateCcw className="h-4 w-4" /> Powtórz dodatkową próbę
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "summary") {
    const summary = summarizeResults(batchResults, batchId);
    const jumpAsymmetry = bestSideAsymmetry(batchResults, "single_leg_cmj", batchId);
    const codAsymmetry = bestSideAsymmetry(batchResults, "cod_505", batchId);
    return (
      <div className="fixed inset-0 z-[110] overflow-y-auto bg-background px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-lg">
          <p className="text-sm font-semibold text-primary">BALLWISE LAB</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Profil ukończony</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Wyniki zapisano. Filmów roboczych nie wysyłamy do chmury.
          </p>
          <div className="mt-7 space-y-3">
            {summary.map((row) => (
              <div
                key={`${row.testId}-${row.side ?? "both"}`}
                className="soft-card flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-semibold">{row.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {sideLabel(row.side) ?? `${row.attempts} prób`}
                  </p>
                </div>
                <div className="text-right">
                  <strong>{displayLabValue(row.bestValue, row.unit)}</strong>
                  <LabMeasurementDetails metrics={row.metrics} />
                </div>
              </div>
            ))}
          </div>
          {(jumpAsymmetry || codAsymmetry) && (
            <div className="soft-card mt-4 space-y-2 p-4 text-sm">
              {jumpAsymmetry && (
                <div className="flex justify-between">
                  <span>Asymetria skoku</span>
                  <strong>{jumpAsymmetry.asymmetryPercent.toFixed(1)}%</strong>
                </div>
              )}
              {codAsymmetry && (
                <div className="flex justify-between">
                  <span>Asymetria 505</span>
                  <strong>{codAsymmetry.asymmetryPercent.toFixed(1)}%</strong>
                </div>
              )}
              <p className="pt-1 text-xs text-muted-foreground">
                Asymetria opisuje różnicę wyniku. Nie jest diagnozą ani oceną ryzyka kontuzji.
              </p>
            </div>
          )}
          <Button className="mt-6 h-12 w-full rounded-full" onClick={onClose}>
            Gotowe
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-background px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full bg-secondary"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
            240 FPS • wymagane
          </span>
        </div>
        <p className="mt-8 text-sm font-medium text-muted-foreground">
          Próba {attempt.sequenceNumber} z {attempt.sequenceLength}
        </p>
        <h2 className="mt-1 text-[34px] font-semibold tracking-[-0.045em]">{test.title}</h2>
        <p className="mt-2 text-base text-muted-foreground">
          {test.shortDescription}
          {side ? ` • ${side}` : ""} • próba{" "}
          {batchResults.filter((row) => row.testId === attempt.testId && row.side === attempt.side)
            .length + 1}
        </p>

        <div className="soft-card mt-7 p-5">
          <h3 className="text-sm font-semibold">Ustawienie</h3>
          <ol className="mt-4 space-y-3">
            {test.setup.map((item, itemIndex) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
                  {itemIndex + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Po nagraniu zaznaczysz
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {test.markers.map((marker, markerIndex) => (
              <div key={marker.key} className="rounded-xl bg-secondary/65 p-3">
                <p className="text-sm font-semibold">
                  {markerIndex + 1}. {marker.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {marker.instruction}
                </p>
              </div>
            ))}
          </div>
        </div>

        <Button className="mt-6 h-12 w-full rounded-full text-[15px]" onClick={() => void record()}>
          <Video className="h-5 w-5" /> Nagraj w 240 FPS
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          Nagranie służy tylko do pomiaru i po zapisaniu wyniku jest usuwane z pamięci roboczej
          aplikacji.
        </p>
      </div>
    </div>
  );
}
