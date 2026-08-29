import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Gauge,
  Camera,
  ThumbsUp,
  AlertTriangle,
  Target,
  RotateCcw,
  BookmarkCheck,
  Bookmark,
  ShieldCheck,
  Info,
} from "lucide-react";
import {
  VisionHeader,
  ValidityBadge,
  ConfidenceBadge,
  ReviewStatusBadge,
} from "./visionUi";
import { VisionInvalidResult } from "./VisionInvalidResult";
import { VisionAnalysisStatus } from "./VisionAnalysisStatus";
import { VisionGymResult } from "./VisionGymResult";
import { GYM_EXERCISE_TEST_ID } from "@/lib/vision/visionTests";
import { VisionProgressComparison } from "./VisionProgressComparison";
import { VisionCalculationBasis } from "./VisionCalculationBasis";
import { SprintScanReport } from "./SprintScanReport";
import { VisionCoachFeedback } from "./VisionCoachFeedback";
import { VisionCoachReviewSheet } from "./VisionCoachReviewSheet";
import { Button } from "@/components/ui/button";
import {
  CAMERA_VIEW_LABELS,
  INVALID_REASON_LABELS,
  REVIEW_STATUS_DESCRIPTIONS,
  COACH_REVIEW_DISCLAIMER,
  type VisionTestResult,
} from "@/lib/vision/types";
import { setSavedToProgress } from "@/lib/vision/visionRepo";

export function VisionResult({ result: initial }: { result: VisionTestResult }) {
  const navigate = useNavigate();
  const [result, setResult] = useState(initial);
  const [saved, setSaved] = useState(initial.savedToProgress);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  if (result.testType === GYM_EXERCISE_TEST_ID) {
    return <VisionGymResult result={result} />;
  }

  // Zawodnik widzi gotowy raport dopiero, gdy analiza jest zakończona i
  // opublikowana. Wcześniej — ekran statusu (bez klatek/markerów).
  if (
    result.analysisStatus !== "completed" ||
    result.visibilityStatus !== "visible_to_player"
  ) {
    return <VisionAnalysisStatus result={result} />;
  }

  if (result.validityStatus === "invalid") {
    return <VisionInvalidResult result={result} />;
  }

  async function toggleSave() {
    setBusy(true);
    try {
      const next = !saved;
      await setSavedToProgress(result.id, next);
      setSaved(next);
      toast.success(next ? "Zapisano do progresu." : "Usunięto z progresu.");
    } catch {
      toast.error("Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  const fb = result.aiFeedback;
  const warnings = result.validityFlags?.reasons ?? [];

  return (
    <div className="pb-28">
      <VisionHeader title={result.testName} subtitle="Raport wydajności" backTo="/vision-lab" />

      <div className="space-y-4 px-5">
        {/* Główny wynik */}
        <div className="hero-card p-5 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.78_0.13_256)]">
            Wynik główny
          </div>
          <div className="mt-1 text-5xl font-bold text-graphite-foreground">
            {result.mainResultValue}
            <span className="ml-1 text-2xl font-semibold text-graphite-muted">
              {result.mainResultUnit}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <ReviewStatusBadge status={result.reviewStatus} />
            <ValidityBadge status={result.validityStatus} />
            <ConfidenceBadge level={result.confidenceScore} />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-graphite-muted">
            {REVIEW_STATUS_DESCRIPTIONS[result.reviewStatus]}
          </p>
        </div>


        {/* Meta */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="soft-card p-3">
            <Gauge className="h-4 w-4 text-primary" />
            <div className="mt-1.5 text-[11px] text-muted-foreground">FPS</div>
            <div className="text-sm font-semibold text-foreground">{result.fps ?? "—"}</div>
          </div>
          <div className="soft-card p-3">
            <Camera className="h-4 w-4 text-primary" />
            <div className="mt-1.5 text-[11px] text-muted-foreground">Ujęcie</div>
            <div className="text-sm font-semibold text-foreground">
              {result.cameraView ? CAMERA_VIEW_LABELS[result.cameraView] : "—"}
            </div>
          </div>
        </div>

        {/* Dokładność */}
        <div className="soft-card p-4">
          <p className="text-xs text-muted-foreground">
            Wynik oznaczony jako{" "}
            <span className="font-semibold text-foreground">
              {fb.accuracy === "accurate"
                ? "dokładny"
                : fb.accuracy === "estimated"
                  ? "estymowany"
                  : "nieważny"}
            </span>
            . Vision Lab nie zawyża dokładności — przy 30/60 FPS wynik jest estymacją.
          </p>
        </div>

        {/* Kluczowe metryki */}
        {result.measuredMetrics.length > 0 && (
          <div className="soft-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Kluczowe metryki</h2>
            <div className="space-y-2.5">
              {result.measuredMetrics.map((m) => (
                <div key={m.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-semibold text-foreground">
                      {m.value}
                      {m.unit}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, Math.max(0, m.value))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback (tylko gdy AI dostarczyło opis — analiza klatkowa go nie ma) */}
        {fb.good && (
          <FeedbackRow icon={ThumbsUp} tone="text-emerald-600" title="Co było dobre" text={fb.good} />
        )}
        {fb.limitingFactor && (
          <FeedbackRow
            icon={AlertTriangle}
            tone="text-amber-600"
            title="Co ogranicza wynik"
            text={fb.limitingFactor}
          />
        )}
        {fb.improve && (
          <FeedbackRow icon={Target} tone="text-primary" title="Jedna rzecz do poprawy" text={fb.improve} />
        )}

        {/* Sprint Performance Scan — tylko gdy silnik go policzył */}
        {result.calculationBasis?.sprintScan && (
          <SprintScanReport scan={result.calculationBasis.sprintScan} />
        )}

        {/* Jak powstał wynik? */}
        <VisionCalculationBasis basis={result.calculationBasis} />

        {/* Analiza trenera (jeśli jest / zamówiona) */}
        <VisionCoachFeedback result={result} />

        {/* Poproś o analizę trenera */}
        {!result.paidReviewRequested && (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="soft-card flex w-full items-center gap-3 p-4 text-left transition-transform active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Poproś o analizę trenera</div>
              <p className="text-xs text-muted-foreground">
                AI liczy wynik. Trener weryfikuje test i technikę. Opcja premium.
              </p>
            </div>
          </button>
        )}

        {/* Porównanie */}
        <VisionProgressComparison comparison={result.comparisonToPrevious} />


        {/* Ostrzeżenia ważności */}
        {warnings.length > 0 && (
          <div className="soft-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-amber-600">Ostrzeżenia ważności</h2>
            <ul className="space-y-1.5">
              {warnings.map((r) => (
                <li key={r} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {INVALID_REASON_LABELS[r]}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Zastrzeżenie */}
        <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{COACH_REVIEW_DISCLAIMER}</span>
        </div>
      </div>

      <VisionCoachReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        result={result}
        onRequested={setResult}
      />


      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto grid w-full max-w-[30rem] grid-cols-2 gap-2.5">
          <Button variant={saved ? "secondary" : "default"} size="lg" disabled={busy} onClick={toggleSave}>
            {saved ? (
              <>
                <BookmarkCheck className="mr-1 h-4 w-4" /> W progresie
              </>
            ) : (
              <>
                <Bookmark className="mr-1 h-4 w-4" /> Zapisz do progresu
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() =>
              navigate({
                to: "/vision-lab/test/$testId/setup",
                params: { testId: result.testType },
              })
            }
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Powtórz test
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeedbackRow({
  icon: Icon,
  tone,
  title,
  text,
}: {
  icon: typeof Target;
  tone: string;
  title: string;
  text: string;
}) {
  return (
    <div className="soft-card flex items-start gap-3 p-4">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} />
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        <p className="mt-0.5 text-sm text-foreground">{text}</p>
      </div>
    </div>
  );
}
