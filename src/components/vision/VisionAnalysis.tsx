import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, CheckCircle2 } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { useAuth } from "@/lib/loadwise/auth";
import type { VisionTest } from "@/lib/vision/types";
import { getFlow } from "@/lib/vision/visionFlow";
import {
  analyzeVisionTestDemo,
  VISION_ANALYSIS_STEPS,
} from "@/lib/vision/visionAnalysisService";
import { saveVisionResult } from "@/lib/vision/visionRepo";

export function VisionAnalysis({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || loading) return;
    started.current = true;

    let cancelled = false;
    const flow = getFlow(test.id);

    // Animowany postęp kroków.
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, VISION_ANALYSIS_STEPS.length - 1));
    }, 550);

    (async () => {
      try {
        const analysis = await analyzeVisionTestDemo(test.id, {
          videoUrl: flow.videoUrl,
          fileName: flow.fileName,
          fps: flow.fps || test.recommendedFps,
          cameraView: flow.cameraView || test.cameraView,
          captureMode: "upload",
          setup: flow.setup,
        });

        // Poczekaj aż kroki dobiegną końca dla dobrego UX.
        await new Promise((r) => setTimeout(r, VISION_ANALYSIS_STEPS.length * 550));

        if (!user) {
          throw new Error("Musisz być zalogowany, aby zapisać wynik.");
        }
        const saved = await saveVisionResult(user.id, analysis);
        if (cancelled) return;
        navigate({ to: "/vision-lab/result/$resultId", params: { resultId: saved.id } });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Analiza nie powiodła się.");
      } finally {
        clearInterval(interval);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [test, user, loading, navigate]);

  return (
    <div className="pb-16">
      <VisionHeader title="Analiza" subtitle={test.name} backTo="/vision-lab" />

      <div className="space-y-3 px-5">
        {error ? (
          <div className="soft-card p-4">
            <p className="text-sm font-medium text-destructive">{error}</p>
            <button
              type="button"
              onClick={() =>
                navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } })
              }
              className="mt-3 text-sm font-medium text-primary"
            >
              Wróć do uploadu
            </button>
          </div>
        ) : (
          VISION_ANALYSIS_STEPS.map((label, i) => {
            const done = i < stepIndex;
            const activeStep = i === stepIndex;
            return (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
                  activeStep ? "border-primary bg-accent" : "border-border bg-card"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                  {done ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  ) : activeStep ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <span className="h-3 w-3 rounded-full bg-border" />
                  )}
                </span>
                <span
                  className={`text-sm ${
                    done || activeStep ? "font-medium text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
