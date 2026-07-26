import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionHeader } from "@/components/vision/visionUi";
import { Button } from "@/components/ui/button";
import { runVideoAnalysis, type AnalysisPhase } from "@/features/vision-analysis/runVideoAnalysis";
import type { TestType, VideoAnalysisResult } from "@/features/vision-analysis/types";
import { SUPPORTED_VISION_TESTS } from "@/lib/vision/supportedTests";
import { getVisionTest } from "@/lib/vision/visionTests";
import { downloadAnalysisJson } from "@/components/vision/VisionAutoAnalysis";

export const Route = createFileRoute("/vision-lab/acceptance")({
  component: () => (
    <VisionGuard withNav>
      <AcceptanceScreen />
    </VisionGuard>
  ),
});

function AcceptanceScreen() {
  const [testId, setTestId] = useState<TestType>(SUPPORTED_VISION_TESTS[0] as TestType);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState<VideoAnalysisResult | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const testMeta = getVisionTest(testId);

  async function run() {
    if (!file) return;
    setRunning(true);
    setAnalysis(null);
    setProgress(0);
    setPhase("loading_file");
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    try {
      const result = await runVideoAnalysis({
        testType: testId,
        videoUrl: url,
        declaredFps: null,
        cameraSetup: (testMeta?.cameraView ?? "side") as "side" | "front" | "top",
        athleteHeightCm: null,
        deviceId: null,
        lens: "wide",
        zoom: 1,
        facing: "back",
        cameraStable: true,
        videoHash: null,
        calibrationRecord: null,
        techniqueOnly: false,
        onPhase: setPhase,
        onProgress: setProgress,
      });
      setAnalysis(result);
    } catch (e) {
      // Zbuduj minimalny obiekt błędu do zrzutu.
      setAnalysis({
        analysisId: `acc-${Date.now()}`,
        testType: testId,
        status: "failed",
        videoMetadata: { fps: 0, durationSeconds: 0, frameCount: 0, width: 0, height: 0 },
        keyEvents: [],
        metrics: [],
        overallConfidence: 0,
        qualityIssues: ["ACCEPTANCE_EXCEPTION"],
        retakeInstructions: [e instanceof Error ? e.message : String(e)],
        analyzerVersion: "acceptance",
      });
    } finally {
      setRunning(false);
    }
  }

  const trace = analysis?.pipelineTrace ?? [];

  return (
    <div className="pb-28">
      <VisionHeader
        title="Test akceptacyjny"
        subtitle="Wgraj film, uruchom realny pipeline i pobierz log JSON"
        backTo="/vision-lab"
      />
      <div className="space-y-4 px-5">
        <div className="soft-card space-y-3 p-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Wybrany test (selectedTestType)
          </label>
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={testId}
            onChange={(e) => setTestId(e.target.value as TestType)}
            disabled={running}
          >
            {SUPPORTED_VISION_TESTS.map((id) => (
              <option key={id} value={id}>
                {getVisionTest(id)?.name ?? id}
              </option>
            ))}
          </select>

          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Film do analizy
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={running}
            className="block w-full text-sm"
          />

          <Button className="w-full" onClick={run} disabled={!file || running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uruchamiam pipeline…
              </>
            ) : (
              "Uruchom pełny pipeline"
            )}
          </Button>
          {running && (
            <div className="text-xs text-muted-foreground">
              Etap: <span className="font-mono">{phase}</span> · {Math.round(progress * 100)}%
            </div>
          )}
        </div>

        {analysis && (
          <div className="soft-card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Wynik pipeline'u</div>
                <div className="text-xs text-muted-foreground">
                  status: <span className="font-mono">{analysis.status}</span> · testType:{" "}
                  <span className="font-mono">{analysis.testType}</span>
                </div>
              </div>
              <Button size="sm" onClick={() => downloadAnalysisJson(analysis)}>
                Pobierz log analizy JSON
              </Button>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Info k="analysisRunId" v={analysis.analysisId} />
              <Info k="decodedFrames" v={analysis.decodedFrames} />
              <Info k="analyzedFrames" v={analysis.analyzedFrames} />
              <Info k="keyEvents" v={analysis.keyEvents.length} />
              <Info k="detectedTestType" v={analysis.recognition?.detectedTestType} />
              <Info k="detectedSignature" v={analysis.recognition?.detectedSignature} />
              <Info k="detectedRepetitions" v={analysis.recognition?.detectedRepetitions} />
              <Info k="requiredRepetitions" v={analysis.recognition?.requiredRepetitions} />
              <Info k="protocolMatch" v={String(analysis.recognition?.protocolMatch ?? "—")} />
              <Info k="finalErrorCode" v={analysis.recognition?.errorCode ?? analysis.qualityIssues[0] ?? "—"} />
            </dl>

            {trace.length > 0 && (
              <div className="rounded-xl bg-accent/60 p-3 text-xs">
                <div className="mb-1 font-semibold text-foreground">Pipeline trace</div>
                <ul className="space-y-1 font-mono">
                  {trace.map((s, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{s.stage}</span>
                      <span
                        className={
                          s.status === "success"
                            ? "text-emerald-600"
                            : s.status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {s.status}
                        {s.reason ? ` · ${s.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="rounded-lg bg-accent/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="break-all font-mono text-[11px] text-foreground">
        {v === null || v === undefined || v === "" ? "—" : String(v)}
      </div>
    </div>
  );
}
