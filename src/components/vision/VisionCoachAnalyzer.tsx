import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, ShieldAlert, XCircle } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { FrameVideoPlayer } from "./FrameVideoPlayer";
import { FrameControls } from "./FrameControls";
import { FrameMarkerPanel } from "./FrameMarkerPanel";
import { FrameResultPreview } from "./FrameResultPreview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/loadwise/auth";
import {
  getVisionResult,
  getVisionVideoUrl,
  isCoach,
  coachMarkInReview,
  coachPublishFrameResult,
  coachRejectVideo,
} from "@/lib/vision/visionRepo";
import { getVisionTest } from "@/lib/vision/visionTests";
import {
  computeFrameResult,
  getTestMarkers,
  timeToFrame,
} from "@/lib/vision/frameAnalysisService";
import {
  ANALYSIS_STATUS_LABELS,
  type VisionTest,
  type VisionTestResult,
  type FrameMarkerKey,
  type FrameManualInputs,
  type FrameAnalysisResult,
} from "@/lib/vision/types";

/**
 * Frame Analyzer — narzędzie WYŁĄCZNIE dla trenera/admina.
 * Otwierane z Coach Review Queue dla konkretnego przesłanego filmu.
 * Trener zaznacza klatki, system liczy wynik, trener publikuje raport zawodnikowi.
 */
export function VisionCoachAnalyzer({ resultId }: { resultId: string }) {
  const { user, loading } = useAuth();
  const [coach, setCoach] = useState<boolean | null>(null);
  const [result, setResult] = useState<VisionTestResult | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      const c = await isCoach(user.id);
      if (cancelled) return;
      setCoach(c);
      if (c) {
        try {
          const r = await getVisionResult(resultId);
          if (cancelled) return;
          setResult(r);
          if (r?.videoUrl) setVideoSrc(await getVisionVideoUrl(r.videoUrl));
          if (r && r.analysisStatus === "waiting_for_analysis") {
            coachMarkInReview(r.id, user.id).catch(() => {});
          }
        } catch {
          setResult(null);
        }
      }
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, resultId]);

  if (busy || coach === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ładowanie…
      </div>
    );
  }

  if (!coach) {
    return (
      <div>
        <VisionHeader title="Frame Analyzer" backTo="/vision-lab/coach" />
        <div className="mx-5 soft-card flex flex-col items-center p-8 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Frame Analyzer jest dostępny tylko dla trenerów i administratorów.
          </p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div>
        <VisionHeader title="Frame Analyzer" backTo="/vision-lab/coach" />
        <p className="px-5 text-sm text-muted-foreground">Nie znaleziono filmu.</p>
      </div>
    );
  }

  const test = getVisionTest(result.testType);
  if (!test) {
    return (
      <div>
        <VisionHeader title="Frame Analyzer" backTo="/vision-lab/coach" />
        <p className="px-5 text-sm text-muted-foreground">Nieznany typ testu.</p>
      </div>
    );
  }

  return (
    <AnalyzerBody
      test={test}
      result={result}
      coachId={user!.id}
      videoSrc={videoSrc}
    />
  );
}

function AnalyzerBody({
  test,
  result,
  coachId,
  videoSrc,
}: {
  test: VisionTest;
  result: VisionTestResult;
  coachId: string;
  videoSrc: string | null;
}) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const markerDefs = useMemo(() => getTestMarkers(test.id), [test.id]);

  const [fps, setFps] = useState<number>(result.fps || test.recommendedFps);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [markers, setMarkers] = useState<Partial<Record<FrameMarkerKey, number>>>(
    result.frameMarkers ?? {},
  );
  const [manual, setManual] = useState<FrameManualInputs>({});
  const [analysis, setAnalysis] = useState<FrameAnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

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
    setAnalysis(null);
  }
  function clearFrame(key: FrameMarkerKey) {
    setMarkers((m) => { const n = { ...m }; delete n[key]; return n; });
    setAnalysis(null);
  }
  function patchManual(patch: Partial<FrameManualInputs>) {
    setManual((m) => ({ ...m, ...patch }));
    setAnalysis(null);
  }
  function compute() {
    const r = computeFrameResult({ testId: test.id, fps, markers, manual, markedBy: "coach" });
    setAnalysis(r);
    if (r.status === "invalid") toast.error(r.error ?? "Nie można obliczyć wyniku.");
    return r;
  }

  async function publish() {
    const r = analysis ?? compute();
    if (!r || r.status === "invalid") return;
    setSaving(true);
    try {
      await coachPublishFrameResult(result, coachId, r);
      toast.success("Wynik opublikowany zawodnikowi (Coach Verified).");
      navigate({ to: "/vision-lab/coach" });
    } catch {
      toast.error("Nie udało się opublikować wyniku.");
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    setSaving(true);
    try {
      await coachRejectVideo(result.id, coachId, rejectNote || null);
      toast.success("Film oznaczony jako nieprawidłowy. Zawodnik dostanie prośbę o powtórkę.");
      navigate({ to: "/vision-lab/coach" });
    } catch {
      toast.error("Nie udało się zapisać.");
    } finally {
      setSaving(false);
    }
  }

  const canSave = analysis != null && analysis.status !== "invalid";

  return (
    <div className="pb-16">
      <VisionHeader
        title="Frame Analyzer"
        subtitle={`${test.name} · zawodnik ${result.userId.slice(0, 8)}…`}
        backTo="/vision-lab/coach"
      />

      <div className="space-y-4 px-5">
        <div className="soft-card p-3 text-xs text-muted-foreground">
          Status: <span className="font-semibold text-foreground">
            {ANALYSIS_STATUS_LABELS[result.analysisStatus]}
          </span>
        </div>

        {videoSrc ? (
          <FrameVideoPlayer
            ref={videoRef}
            src={videoSrc}
            onLoadedMetadata={(d) => setDuration(d)}
            onTimeUpdate={(t) => setCurrentTime(t)}
          />
        ) : (
          <div className="soft-card p-4 text-sm text-muted-foreground">
            Film niedostępny do odtworzenia (brak pliku w chmurze). Możesz oznaczyć
            nagranie jako nieprawidłowe i poprosić o powtórkę.
          </div>
        )}

        <FrameControls
          fps={fps}
          onFpsChange={(f) => { setFps(f); setAnalysis(null); }}
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
          result={analysis}
          onCompute={compute}
          onSave={publish}
          saving={saving}
          canSave={canSave}
        />

        <div className="soft-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground">
              Nagranie nie spełnia wymagań
            </h2>
          </div>
          <Textarea
            placeholder="Notatka dla zawodnika (opcjonalnie)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <Button
            variant="outline"
            className="mt-3 w-full text-destructive"
            disabled={saving}
            onClick={reject}
          >
            Oznacz jako Invalid video i poproś o powtórkę
          </Button>
        </div>
      </div>
    </div>
  );
}
