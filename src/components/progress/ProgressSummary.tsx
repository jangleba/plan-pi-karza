import { Link } from "@tanstack/react-router";
import { MicrocycleRing } from "@/components/progress/MicrocycleRing";
import { WeekLine } from "@/components/progress/WeekLine";
import { AnimatedChart } from "@/components/progress/AnimatedChart";
import { formatDate } from "@/lib/loadwise/labels";
import {
  METRIC_CATEGORY_LABELS,
  TRAINING_CATEGORY_LABELS,
  changeOf,
  type MetricCategoryKey,
  type MetricSeries,
  type TrainingCategoryKey,
} from "@/lib/progress/progress";
import type { DirectionCard, MicrocycleReport } from "@/lib/progress/center";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronRight,
  Target,
} from "lucide-react";

const PITCH_MEANING: Record<MetricCategoryKey, string> = {
  speed: "Krótsze dojście do pełnej prędkości w akcjach 10–20 m.",
  strength: "Więcej siły w wybiciu, hamowaniu i pojedynku.",
  endurance: "Mniejszy spadek jakości w końcówkach meczu.",
  vision: "Lepsza kontrola wykonania w warunkach testu.",
};

export function ProgressSummary({
  direction,
  micro,
  series,
}: {
  direction: DirectionCard;
  micro: MicrocycleReport;
  series: MetricSeries[];
}) {
  const categories = (Object.keys(METRIC_CATEGORY_LABELS) as MetricCategoryKey[]).filter(
    (c) => series.some((s) => s.category === c),
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Twój kierunek */}
      <section className="soft-card p-4">
        <div className="flex items-start gap-3">
          <MicrocycleRing pct={micro.executionPct} label="mikrocykl" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
              Twój kierunek
            </div>
            <div className="text-sm font-semibold leading-snug">{direction.stage}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {direction.execution}
            </div>
          </div>
        </div>

        <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <Row label="Wykryta zmiana" value={direction.detectedChange} />
          <Row label="Ogranicznik" value={direction.limiter} />
          <Row label="Następny krok" value={direction.nextStep} />
        </dl>

        {direction.cta.to === "session" && direction.cta.date ? (
          <Link
            to="/sesja/$date"
            params={{ date: direction.cta.date }}
            search={{ slot: 1 }}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <Target className="h-4 w-4" /> {direction.cta.label}
          </Link>
        ) : (
          <Link
            to="/vision-lab"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <Target className="h-4 w-4" /> {direction.cta.label}
          </Link>
        )}
      </section>

      {/* Ostatnie 7 dni */}
      <section className="soft-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Ostatnie 7 dni</h2>
          <span className="text-xs text-muted-foreground">
            {micro.totalMinutes} min · {micro.testsCount} testy
          </span>
        </div>
        <WeekLine days={micro.days} />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {(Object.keys(micro.byCategory) as TrainingCategoryKey[]).map((k) => (
            <span
              key={k}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                micro.byCategory[k] > 0
                  ? "bg-accent text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {TRAINING_CATEGORY_LABELS[k]} {micro.byCategory[k]}
            </span>
          ))}
        </div>
      </section>

      {/* Przesuwane karty kategorii */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">Wyniki w skrócie</h2>
        {categories.length === 0 ? (
          <div className="soft-card px-4 py-6 text-center text-sm text-muted-foreground">
            Brak pomiarów. Wykonaj pierwszy test, aby zobaczyć zmiany.
          </div>
        ) : (
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
            {categories.map((cat) => {
              const items = series.filter((s) => s.category === cat);
              const top = items[0]!;
              const c = changeOf(top);
              const best = top.lowerIsBetter
                ? Math.min(...top.points.map((p) => p.value))
                : Math.max(...top.points.map((p) => p.value));
              const Icon =
                c.improved == null ? Minus : c.improved ? ArrowUpRight : ArrowDownRight;
              return (
                <div
                  key={cat}
                  className="soft-card w-[78%] shrink-0 snap-start p-4 transition-transform duration-200 active:scale-[0.99]"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {METRIC_CATEGORY_LABELS[cat]}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold">{top.label}</div>
                  <div className="mt-1 flex items-end justify-between">
                    <div className="text-2xl font-bold leading-none">
                      {c.latest.value}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">
                        {top.unit}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1 text-xs ${
                        c.improved == null
                          ? "text-muted-foreground"
                          : c.improved
                            ? "text-primary"
                            : "text-destructive"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {c.changePct != null
                        ? `${Math.abs(c.changePct).toFixed(1)}%`
                        : "1. pomiar"}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Rekord: {best} {top.unit} · {formatDate(c.latest.date)}
                  </div>
                  <div className="mt-2">
                    <AnimatedChart points={top.points} lowerIsBetter={top.lowerIsBetter} />
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    Co to oznacza na boisku? {PITCH_MEANING[cat]}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Raport mikrocyklu */}
      <section className="soft-card p-4">
        <h2 className="text-sm font-semibold">Raport mikrocyklu</h2>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat
            value={
              micro.executionPct != null ? `${micro.executionPct}%` : "—"
            }
            label="wykonanie"
          />
          <Stat value={`${micro.totalMinutes}`} label="minuty" />
          <Stat
            value={micro.avgRpe != null ? micro.avgRpe.toFixed(1) : "—"}
            label="śr. RPE"
          />
        </div>
        <p className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {micro.nextWeekDirection}
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm leading-snug">{value}</dd>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-muted/50 py-2.5">
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
