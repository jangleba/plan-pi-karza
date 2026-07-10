import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/loadwise/auth";
import type { VisionTest } from "@/lib/vision/types";
import { getFlow } from "@/lib/vision/visionFlow";
import { saveFrameResult } from "@/lib/vision/visionResultService";
import { createPendingUpload, getVisionVideoUrl } from "@/lib/vision/visionRepo";
import { analysisToFrameResult } from "@/lib/vision/autoAnalysisBridge";
import { runVideoAnalysis, type AnalysisPhase } from "@/features/vision-analysis/runVideoAnalysis";
import type { VideoAnalysisResult, TestType, CameraSetup } from "@/features/vision-analysis/types";

const PHASE_LABELS: Record<AnalysisPhase, string> = {
  reading_metadata: "Odczyt metadanych filmu",
  decoding_frames: "Dekodowanie klatek i wykrywanie zawodnika",
  detecting_events: "Wykrywanie kluczowych faz ruchu",
  calculating: "Obliczanie wyniku",
  validating: "Weryfikacja jakości nagrania",
  done: "Gotowe",
};

type UiState =
  | { kind: "running" }
  | { kind: "invalid"; analysis: VideoAnalysisResult }
  | { kind: "error"; message: string };

export function VisionAutoAnalysis({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const flow = getFlow(test.id);
  const [phase, setPhase] = useState<AnalysisPhase>("reading_metadata");
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<UiState>({ kind: "running" });
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      // Źródło filmu: lokalny plik (blob) albo świeży signed URL ze storage.
      let source: string | null = null;
      if (flow.file) {
        objectUrl = URL.createObjectURL(flow.file);
        source = objectUrl;
      } else if (flow.videoUrl && flow.uploaded && !flow.videoUrl.startsWith("placeholder://")) {
        // flow.videoUrl to ścieżka w storage — pobierz świeży signed URL (poprzedni mógł wygasnąć).
        source = flow.videoUrl.startsWith("http")
          ? flow.videoUrl
          : await getVisionVideoUrl(flow.videoUrl);
      }

      if (cancelled) return;
      if (!source) {
        navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } });
        return;
      }
      setPreviewSrc(source);

      const analysis = await runVideoAnalysis({
        testType: test.id as TestType,
        videoUrl: source,
        declaredFps: flow.fps || null,
        cameraSetup: (flow.cameraView ?? test.cameraView) as CameraSetup,
        onPhase: (p) => !cancelled && setPhase(p),
        onProgress: (f) => !cancelled && setProgress(f),
      });
      if (cancelled) return;


      if (analysis.status === "completed") {
        // Wynik policzony z filmu — zapis trwały i przejście do raportu.
        const frame = analysisToFrameResult(analysis);
        const saved = await saveFrameResult({
          userId: user?.id ?? null,
          frame,
          videoUrl: flow.videoUrl,
          cameraView: flow.cameraView ?? test.cameraView,
        });
        navigate({ to: "/vision-lab/result/$resultId", params: { resultId: saved.id } });
        return;
      }

      if (analysis.status === "needs_review") {
        // Za mało danych na automatyczny wynik → weryfikacja trenera.
        try {
          if (user) {
            const pending = await createPendingUpload({
              userId: user.id,
              test: { id: test.id, name: test.name, category: test.category },
              videoUrl: flow.videoUrl,
              fps: analysis.videoMetadata.fps || flow.fps || test.recommendedFps,
              cameraView: flow.cameraView ?? test.cameraView,
            });
            navigate({ to: "/vision-lab/result/$resultId", params: { resultId: pending.id } });
            return;
          }
        } catch {
          /* przechodzimy do widoku instrukcji poniżej */
        }
        setState({ kind: "invalid", analysis });
        return;
      }

      // invalid_recording | failed
      setState({ kind: "invalid", analysis });
    })().catch((e) => {
      if (!cancelled) setState({ kind: "error", message: e?.message ?? "Błąd analizy." });
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
            src={previewSrc}
            muted
            playsInline
            preload="metadata"
            controls
            className="w-full rounded-2xl bg-black"
          />
        )}
        {state.kind === "running" && <RunningView phase={phase} progress={progress} />}

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
            </div>
            <Button
              className="w-full"
              onClick={() =>
                navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } })
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Nagraj ponownie
            </Button>
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
          {phase === "decoding_frames" ? `${pct}% klatek przetworzonych` : "Przetwarzanie…"}
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
