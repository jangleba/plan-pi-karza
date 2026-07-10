import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Clock,
  Search,
  AlertTriangle,
  History,
  ArrowLeft,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { VisionHeader } from "./visionUi";
import { VisionCoachReviewSheet } from "./VisionCoachReviewSheet";
import { Button } from "@/components/ui/button";
import {
  ANALYSIS_STATUS_DESCRIPTIONS,
  ANALYSIS_STATUS_LABELS,
  CATEGORY_LABELS,
  type VisionTestResult,
} from "@/lib/vision/types";

/**
 * Ekran zawodnika po wysłaniu filmu. Pokazuje status analizy — bez klatek,
 * bez markerów, bez ręcznego liczenia. Wynik pojawi się dopiero po
 * zatwierdzeniu przez trenera/admina.
 */
export function VisionAnalysisStatus({ result: initial }: { result: VisionTestResult }) {
  const [result, setResult] = useState(initial);
  const [reviewOpen, setReviewOpen] = useState(false);
  const invalid = result.analysisStatus === "invalid_video";

  const Icon = invalid ? AlertTriangle : result.analysisStatus === "in_review" ? Search : Clock;
  const tone = invalid ? "text-destructive bg-destructive/12" : "text-primary bg-primary/12";

  return (
    <div className="pb-16">
      <VisionHeader
        title={invalid ? "Powtórz nagranie" : "Film przesłany"}
        subtitle={result.testName}
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        <div className="hero-card flex flex-col items-center p-6 text-center">
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
            <Icon className="h-7 w-7" />
          </span>
          <h1 className="mt-3 text-lg font-bold text-graphite-foreground">
            {invalid ? "Film nie spełnia wymagań" : "Film przesłany do analizy"}
          </h1>
          <p className="mt-1 text-sm text-graphite-muted">
            {ANALYSIS_STATUS_DESCRIPTIONS[result.analysisStatus]}
          </p>
        </div>

        <div className="soft-card p-4">
          <Row label="Test" value={result.testName} />
          <Row label="Kategoria" value={CATEGORY_LABELS[result.testCategory]} />
          <Row label="Status" value={ANALYSIS_STATUS_LABELS[result.analysisStatus]} />
          {result.fps != null && <Row label="FPS" value={`${result.fps}`} />}
        </div>

        {!invalid && (
          <div className="soft-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-foreground">Co teraz?</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Film zostanie przeanalizowany na podstawie kluczowych klatek, FPS i
              protokołu testu. Jeśli film nie spełnia wymagań, poprosimy Cię o
              powtórzenie nagrania.
            </p>
          </div>
        )}

        {result.coachNote && (
          <div className="soft-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-foreground">Notatka trenera</h2>
            <p className="text-sm text-muted-foreground">{result.coachNote}</p>
          </div>
        )}

        {/* Premium: szybsza analiza trenera */}
        {!invalid && !result.paidReviewRequested && (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="soft-card flex w-full items-center gap-3 p-4 text-left transition-transform active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                Poproś o szybszą analizę trenera
              </div>
              <p className="text-xs text-muted-foreground">
                Priorytetowa weryfikacja testu i techniki. Opcja premium.
              </p>
            </div>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Button asChild variant="outline" size="lg">
            <Link to="/vision-lab">
              <ArrowLeft className="mr-1 h-4 w-4" /> Vision Lab
            </Link>
          </Button>
          {invalid ? (
            <Button asChild size="lg">
              <Link to="/vision-lab/test/$testId/setup" params={{ testId: result.testType }}>
                <RotateCcw className="mr-1 h-4 w-4" /> Powtórz test
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="lg">
              <Link to="/vision-lab/history">
                <History className="mr-1 h-4 w-4" /> Historia
              </Link>
            </Button>
          )}
        </div>
      </div>

      <VisionCoachReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        result={result}
        onRequested={setResult}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
