import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { VisionHeader } from "./visionUi";
import { FrameVideoPlayer } from "./FrameVideoPlayer";
import { FrameControls } from "./FrameControls";
import { FrameMarkerPanel } from "./FrameMarkerPanel";
import { FrameResultPreview } from "./FrameResultPreview";
import { useAuth } from "@/lib/loadwise/auth";
import type {
  VisionTest,
  FrameMarkerKey,
  FrameManualInputs,
  FrameAnalysisResult,
} from "@/lib/vision/types";
import { getFlow } from "@/lib/vision/visionFlow";
import {
  computeFrameResult,
  getTestMarkers,
  timeToFrame,
  frameToTime,
} from "@/lib/vision/frameAnalysisService";
import { saveFrameResult } from "@/lib/vision/visionResultService";

export function VisionFrameAnalyzer({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const flow = getFlow(test.id);
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = useMemo(() => (flow.file ? URL.createObjectURL(flow.file) : null), [flow.file]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const markerDefs = useMemo(() => getTestMarkers(test.id), [test.id]);

  const [fps, setFps] = useState<number>(flow.fps || test.recommendedFps);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [markers, setMarkers] = useState<Partial<Record<FrameMarkerKey, number>>>({});
  const [manual, setManual] = useState<FrameManualInputs>({});
  const [result, setResult] = useState<FrameAnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);

  const currentFrame = timeToFrame(currentTime, fps);

  function step(deltaFrames: number) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
    const next = Math.min(Math.max(0, v.currentTime + deltaFrames / fps), duration || v.duration || 0);
    v.currentTime = next;
    setCurrentTime(next);
  }

  function playPause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  function markFrame(key: FrameMarkerKey) {
    setMarkers((m) => ({ ...m, [key]: currentFrame }));
    setResult(null);
  }
  function clearFrame(key: FrameMarkerKey) {
    setMarkers((m) => { const n = { ...m }; delete n[key]; return n; });
    setResult(null);
  }
  function patchManual(patch: Partial<FrameManualInputs>) {
    setManual((m) => ({ ...m, ...patch }));
    setResult(null);
  }

  function compute() {
    const r = computeFrameResult({ testId: test.id, fps, markers, manual });
    setResult(r);
    if (r.status === "invalid") toast.error(r.error ?? "Nie można obliczyć wyniku.");
    return r;
  }

  async function save() {
    const r = result ?? compute();
    if (!r || r.status === "invalid") return;
    setSaving(true);
    try {
      const { id, storedIn } = await saveFrameResult({
        userId: user?.id ?? null,
        frame: r,
        videoUrl: flow.videoUrl,
        cameraView: flow.cameraView ?? test.cameraView,
      });
      toast.success(storedIn === "supabase" ? "Zapisano wynik." : "Zapisano lokalnie (offline).");
      navigate({ to: "/vision-lab/result/$resultId", params: { resultId: id } });
    } catch {
      toast.error("Nie udało się zapisać wyniku.");
    } finally {
      setSaving(false);
    }
  }

  const canSave = result != null && result.status !== "invalid";

  return (
    <div className="pb-16">
      <VisionHeader
        title="Frame Analyzer"
        subtitle={`${test.name} · analiza klatka po klatce`}
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        {!src ? (
          <div className="soft-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Brak wgranego filmu w tej sesji. Wgraj film, aby rozpocząć analizę.
            </p>
            <Link
              to="/vision-lab/test/$testId/upload"
              params={{ testId: test.id }}
              className="mt-3 inline-flex text-sm font-medium text-primary"
            >
              Przejdź do uploadu
            </Link>
          </div>
        ) : (
          <>
            <FrameVideoPlayer
              ref={videoRef}
              src={src}
              onLoadedMetadata={(d) => setDuration(d)}
              onTimeUpdate={(t) => setCurrentTime(t)}
            />
            <FrameControls
              fps={fps}
              onFpsChange={(f) => { setFps(f); setResult(null); }}
              playing={playing}
              onPlayPause={playPause}
              onStep={step}
              currentTime={currentTime}
              currentFrame={currentFrame}
            />
            <FrameMarkerPanel
              testId={test.id}
              markerDefs={markerDefs}
              markers={markers}
              currentFrame={currentFrame}
              onMark={markFrame}
              onClear={clearFrame}
              manual={manual}
              onManual={patchManual}
            />
            <FrameResultPreview
              result={result}
              onCompute={compute}
              onSave={save}
              saving={saving}
              canSave={canSave}
            />
          </>
        )}
      </div>
    </div>
  );
}

export { frameToTime };
