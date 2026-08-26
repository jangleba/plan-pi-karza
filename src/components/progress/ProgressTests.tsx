import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatedChart } from "@/components/progress/AnimatedChart";
import { formatDate } from "@/lib/loadwise/labels";
import {
  METRIC_CATEGORY_LABELS,
  type MetricCategoryKey,
} from "@/lib/progress/progress";
import type { TestSummaryRow, VisionParamRow } from "@/lib/progress/center";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
  RefreshCw,
  Eye,
} from "lucide-react";

export function ProgressTests({
  rows,
  visionParams,
  visionInterpretationText,
  recommendedVisionTest,
}: {
  rows: TestSummaryRow[];
  visionParams: VisionParamRow[];
  visionInterpretationText: string;
  recommendedVisionTest: { id: string; name: string } | null;
}) {
  const groups: MetricCategoryKey[] = ["speed", "strength", "endurance", "vision"];

  return (
    <div className="space-y-5 animate-fade-in">
      {groups.map((g) => {
        const items = rows.filter((r) => r.series.category === g);
        return (
          <section key={g} className="space-y-2">
            <h2 className="px-1 text-sm font-semibold">{METRIC_CATEGORY_LABELS[g]}</h2>
            {items.length === 0 ? (
              <div className="soft-card px-4 py-5 text-center text-xs text-muted-foreground">
                Brak pomiarów w tej kategorii.
              </div>
            ) : (
              items.map((r) => <TestRow key={r.series.id} row={r} />)
            )}
          </section>
        );
      })}

      {/* Vision Lab — podsumowanie mierzonych parametrów */}
      <section className="soft-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4 text-primary" /> Vision Lab — zmierzone parametry
        </h2>
        {visionParams.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{visionInterpretationText}</p>
        ) : (
          <>
            <div className="mt-3 space-y-1.5">
              {visionParams.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{p.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.testName} · {formatDate(p.date)}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold">
                    {p.value} <span className="text-xs font-normal">{p.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-snug text-muted-foreground">
              {visionInterpretationText}
            </p>
          </>
        )}
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Czas reakcji, trafność decyzji, szybkość skanowania i widzenie peryferyjne nie są
          obecnie mierzone przez dostępne testy — nie pokazujemy dla nich wartości.
        </p>
        {recommendedVisionTest && (
          <Link
            to="/vision-lab/test/$testId"
            params={{ testId: recommendedVisionTest.id }}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-primary transition-transform duration-200 active:scale-[0.98]"
          >
            Rekomendowany test: {recommendedVisionTest.name}
          </Link>
        )}
      </section>
    </div>
  );
}

function TestRow({ row }: { row: TestSummaryRow }) {
  const [open, setOpen] = useState(false);
  const c = row.change;
  const Icon = c.improved == null ? Minus : c.improved ? ArrowUpRight : ArrowDownRight;
  const tone =
    c.improved == null
      ? "text-muted-foreground"
      : c.improved
        ? "text-primary"
        : "text-destructive";

  return (
    <div className="soft-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-transform duration-200 active:scale-[0.99]"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{row.series.label}</div>
          <div className="text-xs text-muted-foreground">
            {formatDate(c.latest.date)}
            {row.isPersonalBest ? " · rekord" : ` · rekord ${row.best} ${row.series.unit}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold leading-none">
            {c.latest.value}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              {row.series.unit}
            </span>
          </div>
          <div className={`mt-1 flex items-center justify-end gap-1 text-xs ${tone}`}>
            <Icon className="h-3.5 w-3.5" />
            {c.changePct != null ? `${Math.abs(c.changePct).toFixed(1)}%` : "1. pomiar"}
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </button>

      <div
        className="grid transition-all duration-[220ms] ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 px-4 pb-4">
            <AnimatedChart
              points={row.series.points}
              lowerIsBetter={row.series.lowerIsBetter}
            />
            {c.previous && (
              <div className="text-xs text-muted-foreground">
                Poprzednio: {c.previous.value} {row.series.unit} ·{" "}
                {formatDate(c.previous.date)}
              </div>
            )}
            {row.conditions && (
              <div className="text-xs text-muted-foreground">
                Warunki: {row.conditions}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Zalecane powtórzenie: {formatDate(row.retestDueIso)}
              {row.daysToRetest > 0
                ? ` (za ${row.daysToRetest} dni)`
                : " — termin osiągnięty"}
            </div>
            {row.visionTestId ? (
              <Link
                to="/vision-lab/test/$testId"
                params={{ testId: row.visionTestId }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
              >
                <RefreshCw className="h-4 w-4" /> Powtórz test
              </Link>
            ) : (
              <Link
                to="/vision-lab"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-primary transition-transform duration-200 active:scale-[0.98]"
              >
                <RefreshCw className="h-4 w-4" /> Powtórz test
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
