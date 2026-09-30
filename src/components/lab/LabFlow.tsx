import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import { Disclosure, MetricGroup } from "@/components/ui/app-ui";
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
  const { requestExit } = useActivityExitGuard({
    dirty: capture !== null,
    busy: saving || stage === "recording",
    description: "Nagranie bieżącej próby zostanie usunięte. Zapisane wyniki pozostaną w historii.",
  });

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
      else if (captureRef.current) {
        await deleteLabVideo(captureRef.current.path);
        captureRef.current = null;
      }
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
        onCancel={() => requestExit(() => void cancelCapture())}
        onComplete={(markers) => void calculate(markers)}
      />
    );
  }

  if (stage === "recording") {
    return (
      <div className="bw-workspace grid place-items-center bg-[#071426] p-6 text-white">
        <p role="status">Otwieranie kamery 240 FPS…</p>
      </div>
    );
  }

  const closeButton = (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => requestExit(onClose)}
      aria-label="Zamknij pomiar"
    >
      <X />
    </Button>
  );

  if (stage === "result" && currentResult) {
    const { metrics } = currentResult;
    return (
      <div className="bw-workspace overflow-y-auto bg-background">
        <div className="bw-page-content bw-stack mx-auto w-full max-w-[var(--bw-content-width)] py-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">
              {test.title}
              {side ? ` · ${side}` : ""}
            </h2>
            {closeButton}
          </div>
          <p className="text-5xl font-semibold tabular-nums">
            {displayLabValue(metrics.primaryValue, metrics.primaryUnit)}
          </p>
          <LabMeasurementDetails metrics={metrics} />
          <Disclosure title="Szczegóły pomiaru">
            <MetricGroup
              items={[
                { label: "Czas pomiaru", value: `${metrics.elapsedSeconds.toFixed(4)} s` },
                { label: "Nagranie", value: `${currentResult.fps.toFixed(0)} FPS` },
                {
                  label: "Rozdzielczość czasu",
                  value: `${currentResult.quality.frameResolutionMs.toFixed(2)} ms`,
                },
              ]}
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Sprawdzono oś czasu nagrania i zakres wyniku.
            </p>
          </Disclosure>
          <div className="space-y-3 sticky bottom-0 bg-background py-3">
            <Button onClick={next}>
              {index + 1 < attempts.length ? "Następna próba" : "Zobacz podsumowanie"}
            </Button>
            <Button
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
              <RotateCcw />
              Powtórz dodatkową próbę
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "summary") {
    const summary = summarizeResults(batchResults, batchId);
    const jumpAsymmetry = bestSideAsymmetry(batchResults, "single_leg_cmj", batchId);
    const codAsymmetry = bestSideAsymmetry(batchResults, "cod_505", batchId);
    return (
      <div className="bw-workspace overflow-y-auto bg-background">
        <div className="bw-page-content bw-stack mx-auto w-full max-w-[var(--bw-content-width)] py-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="bw-page-title">Profil ukończony</h2>
            {closeButton}
          </div>
          <p className="text-muted-foreground">Wyniki zapisano.</p>
          {summary.map((row) => (
            <div key={`${row.testId}-${row.side ?? "both"}`} className="bw-action-row">
              <div>
                <p className="font-semibold">{row.title}</p>
                <p className="text-sm text-muted-foreground">
                  {sideLabel(row.side) ?? `${row.attempts} prób`}
                </p>
              </div>
              <strong className="text-xl font-semibold tabular-nums">
                {displayLabValue(row.bestValue, row.unit)}
              </strong>
              <LabMeasurementDetails metrics={row.metrics} />
            </div>
          ))}
          {(jumpAsymmetry || codAsymmetry) && (
            <section className="bw-section">
              <MetricGroup
                items={[
                  ...(jumpAsymmetry
                    ? [
                        {
                          label: "Asymetria skoku",
                          value: `${jumpAsymmetry.asymmetryPercent.toFixed(1)}%`,
                        },
                      ]
                    : []),
                  ...(codAsymmetry
                    ? [
                        {
                          label: "Asymetria 505",
                          value: `${codAsymmetry.asymmetryPercent.toFixed(1)}%`,
                        },
                      ]
                    : []),
                ]}
              />
              <p className="text-sm text-muted-foreground">
                Asymetria opisuje różnicę wyniku. Nie jest diagnozą ani oceną ryzyka kontuzji.
              </p>
            </section>
          )}
          <Button className="sticky bottom-0" onClick={() => requestExit(onClose)}>
            Gotowe
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bw-workspace overflow-y-auto bg-background">
      <div className="bw-page-content bw-stack mx-auto w-full max-w-[var(--bw-content-width)] py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Próba {attempt.sequenceNumber} z {attempt.sequenceLength}
            </p>
            <h2 className="bw-page-title">{test.title}</h2>
            <p className="text-muted-foreground">
              {test.shortDescription}
              {side ? ` · ${side}` : ""} · próba{" "}
              {batchResults.filter(
                (row) => row.testId === attempt.testId && row.side === attempt.side,
              ).length + 1}
            </p>
          </div>
          {closeButton}
        </div>
        <div className="bw-columns">
          <section className="bw-section space-y-4">
            <h3 className="bw-section-title">Ustawienie</h3>
            <ol className="list-decimal space-y-3 pl-5">
              {test.setup.map((item) => (
                <li key={item} className="pl-1 leading-relaxed text-muted-foreground">
                  {item}
                </li>
              ))}
            </ol>
          </section>
          <section className="bw-section space-y-4">
            <h3 className="bw-section-title">Po nagraniu zaznaczysz</h3>
            {test.markers.map((marker, markerIndex) => (
              <div key={marker.key}>
                <h4 className="font-medium">
                  {markerIndex + 1}. {marker.label}
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {marker.instruction}
                </p>
              </div>
            ))}
          </section>
        </div>
        <div className="space-y-3 sticky bottom-0 bg-background py-3">
          <Button onClick={() => void record()}>
            <Video />
            Nagraj w 240 FPS
          </Button>
          <p className="text-sm text-muted-foreground">
            Nagranie jest usuwane po zapisaniu wyniku.
          </p>
        </div>
      </div>
    </div>
  );
}
