import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/loadwise/auth";
import { supabase } from "@/integrations/supabase/client";
import type { VisionTest } from "@/lib/vision/types";
import { getFlow } from "@/lib/vision/visionFlow";
import { saveFrameResult } from "@/lib/vision/visionResultService";
import { createPendingUpload } from "@/lib/vision/visionRepo";
import { resolveVideoBlob } from "@/lib/vision/videoSource";
import { analysisToFrameResult } from "@/lib/vision/autoAnalysisBridge";
import { detectDevice } from "@/lib/vision/calibrationStore";
import { VisionVideoCalibration } from "./VisionVideoCalibration";
import { computeVideoHashFromBlob, type CalibrationRecord } from "@/features/vision-analysis/videoCalibration";
import { findVideoCalibration } from "@/lib/vision/videoCalibrationStore";
import { runVideoAnalysis, type AnalysisPhase } from "@/features/vision-analysis/runVideoAnalysis";
import { vlog, vwarn, withTimeout } from "@/features/vision-analysis/devLog";
import { closePoseEngine, FRAME_TIMESTAMP_ORDER_USER_MESSAGE } from "@/features/vision-analysis/poseEngine";
import type { VideoAnalysisResult, TestType, CameraSetup } from "@/features/vision-analysis/types";
import { estimateFallbackHeightCm } from "@/features/vision-analysis/autoCalibration";

const PHASE_LABELS: Record<AnalysisPhase, string> = {
  idle: "Gotowe do startu",
  loading_file: "Wczytywanie filmu",
  metadata_ready: "Metadane filmu odczytane",
  extracting_frames: "Ekstrakcja klatek",
  pose_analysis: "Analiza pozy zawodnika",
  calculating_result: "Obliczanie wyniku",
  completed: "Gotowe",
  error: "Błąd analizy",
};

type UiState =
  | { kind: "running" }
  | { kind: "invalid"; analysis: VideoAnalysisResult }
  | { kind: "calibration_required"; analysis: VideoAnalysisResult }
  | { kind: "technique_only"; analysis: VideoAnalysisResult }
  | { kind: "calibrating"; analysis: VideoAnalysisResult }
  | { kind: "error"; code: string; message: string };

export function VisionAutoAnalysis({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const flow = getFlow(test.id);
  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<UiState>({ kind: "running" });
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);


  const runToken = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const videoHashRef = useRef<string>("");
  const calibrationRecordRef = useRef<CalibrationRecord | null>(null);
  const techniqueOnlyRef = useRef<boolean>(false);

  const runAnalysis = useCallback(async () => {
    // Nowy przebieg — unieważnia poprzedni i sprząta stare źródło.
    const token = ++runToken.current;
    abortRef.current?.abort();
    await closePoseEngine();
    if (runToken.current !== token) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const cancelled = () => runToken.current !== token || controller.signal.aborted;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewSrc(null);
    setPhase("loading_file");
    setProgress(0);
    setState({ kind: "running" });

    try {
      vlog("loading_file", { file: flow.fileName, uploaded: flow.uploaded });
      // 1-8: pozyskaj film jako zwalidowany Blob URL (Safari-friendly).
      const resolved = await withTimeout(
        resolveVideoBlob({
          file: flow.file,
          videoUrl: flow.videoUrl,
          uploaded: flow.uploaded,
        }),
        20_000,
        "Pozyskanie filmu",
      );
      if (cancelled()) {
        URL.revokeObjectURL(resolved.objectUrl);
        return;
      }
      if (flow.file == null && flow.videoUrl == null) {
        navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } });
        return;
      }
      objectUrlRef.current = resolved.objectUrl;
      setPreviewSrc(resolved.objectUrl);
      vlog("file_ready", { size: resolved.size, type: resolved.type });

      // Hash filmu → kalibracja sceny jest powiązana z KONKRETNYM nagraniem.
      try {
        const blob = await (await fetch(resolved.objectUrl)).blob();
        videoHashRef.current = await computeVideoHashFromBlob(blob);
        calibrationRecordRef.current = findVideoCalibration(videoHashRef.current);
        vlog("video_hash", {
          videoHash: videoHashRef.current,
          hasCalibration: !!calibrationRecordRef.current,
        });
      } catch (e) {
        vwarn("video_hash", "nie udało się policzyć hash filmu", (e as Error)?.message);
      }

      // Wzrost zawodnika z profilu → auto-kalibracja skali (sprint / broad jump).
      // Zapytanie z twardym limitem — nie może zablokować startu analizy.
      let athleteHeightCm: number | null = null;
      if (user) {
        try {
          const { data: prof } = await withTimeout(
            (async () =>
              supabase
                .from("athlete_profiles")
                .select("height_optional, age")
                .eq("user_id", user.id)
                .maybeSingle())(),
            6_000,
            "Odczyt profilu zawodnika",
          );
          const h = prof?.height_optional;
          if (typeof h === "number" && h >= 100 && h <= 230) athleteHeightCm = h;
          else {
            athleteHeightCm = estimateFallbackHeightCm(
              typeof prof?.age === "number" ? prof.age : null,
            );
            vlog("height_fallback", { athleteHeightCm, age: prof?.age ?? null });
          }
        } catch (e) {
          vwarn("profile_fetch", "pominięto auto-kalibrację", (e as Error)?.message);
        }
      }
      if (cancelled()) return;

      // 9-10: analiza startuje na gotowym Blob URL.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const analysis = await withTimeout(
        runVideoAnalysis({
          testType: test.id as TestType,
          videoUrl: resolved.objectUrl,
          declaredFps: flow.fps || null,
          cameraSetup: (flow.cameraView ?? test.cameraView) as CameraSetup,
          athleteHeightCm,
          deviceId: detectDevice().deviceId,
          lens: "wide",
          zoom: 1,
          facing: "back",
          cameraStable: true,
          videoHash: videoHashRef.current || null,
          calibrationRecord: calibrationRecordRef.current,
          techniqueOnly: techniqueOnlyRef.current,
          abortSignal: controller.signal,
          onPhase: (p) => {
            vlog("phase", p);
            if (!cancelled()) setPhase(p);
          },
          onProgress: (f) => !cancelled() && setProgress(f),
        }),
        90_000,
        "Pełna analiza filmu",
      );
      if (cancelled()) return;
      vlog("analysis_done", {
        status: analysis.status,
        confidence: analysis.overallConfidence,
        events: analysis.keyEvents.length,
        metrics: analysis.metrics.length,
      });

      if (analysis.status === "completed") {
        const frame = analysisToFrameResult(analysis);
        const saved = await saveFrameResult({
          userId: user?.id ?? null,
          frame,
          videoUrl: flow.videoUrl,
          cameraView: flow.cameraView ?? test.cameraView,
        });
        if (cancelled()) return;
        navigate({ to: "/vision-lab/result/$resultId", params: { resultId: saved.id } });
        return;
      }

      if (analysis.status === "needs_review") {
        try {
          if (user) {
            const pending = await createPendingUpload({
              userId: user.id,
              test: { id: test.id, name: test.name, category: test.category },
              videoUrl: flow.videoUrl,
              fps: analysis.videoMetadata.fps || flow.fps || test.recommendedFps,
              cameraView: flow.cameraView ?? test.cameraView,
            });
            if (cancelled()) return;
            navigate({ to: "/vision-lab/result/$resultId", params: { resultId: pending.id } });
            return;
          }
        } catch {
          /* przechodzimy do widoku instrukcji poniżej */
        }
        setState({ kind: "invalid", analysis });
        return;
      }

      if (analysis.status === "calibration_required") {
        setState({ kind: "calibration_required", analysis });
        return;
      }

      if (analysis.status === "technique_only") {
        setState({ kind: "technique_only", analysis });
        return;
      }

      if (analysis.status === "failed") {
        const code = analysis.qualityIssues[0] ?? "ANALYSIS_FAILED";
        const message =
          code === "FRAME_TIMESTAMP_ORDER_ERROR"
            ? FRAME_TIMESTAMP_ORDER_USER_MESSAGE
            : analysis.retakeInstructions[0] ?? "Nie udało się przeanalizować filmu.";
        setState({ kind: "error", code, message });
        return;
      }

      // invalid_recording | failed
      setState({ kind: "invalid", analysis });
    } catch (e) {
      if (cancelled()) return;
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : null;
      const rawMessage = e instanceof Error ? e.message : "Nie udało się przeanalizować filmu.";
      const message =
        code === "FRAME_TIMESTAMP_ORDER_ERROR" ||
        /INVALID_ARGUMENT|CalculatorGraph|timestamp mismatch|WaitUntilIdle|graph_utils\.cc/i.test(
          rawMessage,
        )
          ? FRAME_TIMESTAMP_ORDER_USER_MESSAGE
          : rawMessage;
      setState({ kind: "error", code: code ?? "UNKNOWN_ERROR", message });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.id]);

  useEffect(() => {
    // Każde (re)zamontowanie startuje świeży przebieg. Poprzedni (jeśli był)
    // jest unieważniany przez token na początku runAnalysis, dzięki czemu
    // strict-mode double-mount nie zostawia martwego loadera bez wyniku/błędu.
    void runAnalysis();
    return () => {
      // Unieważnij bieżący przebieg (cancelled() zacznie zwracać true).
      runToken.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      void closePoseEngine();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  return (
    <div className="pb-28">
      <VisionHeader
        title="Analiza filmu"
        subtitle={`${test.name} · analiza klatka po klatce`}
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        {previewSrc && (
          <video
            key={previewSrc}
            src={previewSrc}
            muted
            playsInline
            preload="auto"
            controls
            webkit-playsinline="true"
            className="w-full rounded-2xl bg-black"
          />
        )}
        {state.kind === "running" && <RunningView phase={phase} progress={progress} />}

        {state.kind === "calibration_required" && (
          <CalibrationRequiredView
            test={test}
            analysis={state.analysis}
            onCalibrate={() => setState({ kind: "calibrating", analysis: state.analysis })}
            onTechniqueOnly={() => {
              techniqueOnlyRef.current = true;
              void runAnalysis();
            }}
          />
        )}

        {state.kind === "calibrating" && previewSrc && (
          <VisionVideoCalibration
            videoSrc={previewSrc}
            videoHash={videoHashRef.current}
            fps={flow.fps || test.recommendedFps || 30}
            onSaved={(record) => {
              calibrationRecordRef.current = record;
              techniqueOnlyRef.current = false;
              void runAnalysis();
            }}
            onCancel={() =>
              setState((s) =>
                s.kind === "calibrating"
                  ? { kind: "calibration_required", analysis: s.analysis }
                  : s,
              )
            }
          />
        )}

        {state.kind === "technique_only" && (
          <TechniqueOnlyView
            test={test}
            analysis={state.analysis}
            onCalibrate={() => setState({ kind: "calibrating", analysis: state.analysis })}
            onRetake={() =>
              navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } })
            }
          />
        )}

        {state.kind === "invalid" && (
          <InvalidView
            analysis={state.analysis}
            onRetake={() =>
              navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } })
            }
          />
        )}

        {state.kind === "error" && (
          <div className="soft-card space-y-4 p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">
                Nie udało się przeanalizować filmu
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
              <div className="mt-2 inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-muted-foreground">
                Kod błędu: {state.code}
              </div>
            </div>
            <div className="space-y-2">
              <Button className="w-full" onClick={() => void runAnalysis()}>
                <RotateCcw className="mr-2 h-4 w-4" /> Spróbuj ponownie
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } })
                }
              >
                Wybierz inny film
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunningView({ phase, progress }: { phase: AnalysisPhase; progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="soft-card space-y-5 p-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-brand">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
      <div>
        <div className="text-base font-semibold text-foreground">{PHASE_LABELS[phase]}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Analiza działa na Twoim urządzeniu. Nie zamykaj ekranu.
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        <div className="text-xs font-medium text-muted-foreground">
          {phase === "extracting_frames" || phase === "pose_analysis"
            ? `${pct}% klatek przetworzonych`
            : "Przetwarzanie…"}
        </div>
      </div>
    </div>
  );
}

function InvalidView({
  analysis,
  onRetake,
}: {
  analysis: VideoAnalysisResult;
  onRetake: () => void;
}) {
  const isReview = analysis.status === "needs_review";
  return (
    <div className="soft-card space-y-4 p-5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            isReview ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive"
          }`}
        >
          {isReview ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
        </div>
        <div>
          <div className="text-base font-semibold text-foreground">
            {isReview ? "Film wymaga weryfikacji trenera" : "Nagranie nie spełnia wymagań"}
          </div>
          <p className="text-sm text-muted-foreground">
            {isReview
              ? "Nie udało się policzyć wyniku automatycznie z wystarczającą pewnością."
              : "Nie możemy policzyć wyniku z tego nagrania."}
          </p>
        </div>
      </div>

      {analysis.retakeInstructions.length > 0 && (
        <div className="rounded-2xl bg-accent/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Co poprawić
          </div>
          <ul className="space-y-1.5">
            {analysis.retakeInstructions.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="text-brand">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button className="w-full" onClick={onRetake}>
        <RotateCcw className="mr-2 h-4 w-4" /> Nagraj ponownie
      </Button>
    </div>
  );
}
