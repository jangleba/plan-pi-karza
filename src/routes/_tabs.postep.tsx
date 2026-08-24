import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { Sparkline } from "@/components/progress/Sparkline";
import { CareerJournal } from "@/components/progress/CareerJournal";
import { formatDate } from "@/lib/loadwise/labels";
import {
  buildTrainingHistory,
  buildMetricSeries,
  bestImprovement,
  changeOf,
  summarizeWindow,
  daysAgoIso,
  TRAINING_CATEGORY_LABELS,
  METRIC_CATEGORY_LABELS,
  type TrainingCategoryKey,
  type MetricCategoryKey,
} from "@/lib/loadwise/progress";
import { listAllResults } from "@/lib/vision/visionResultService";
import type { VisionTestResult } from "@/lib/vision/types";
import {
  CalendarCheck,
  Compass,
  LineChart,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/postep")({
  component: ProgressScreen,
  head: () => ({
    meta: [
      { title: "Postęp zawodnika – rozwój i wyniki testów | BallWise" },
      {
        name: "description",
        content:
          "Podsumowanie ostatnich 30 dni, kierunek rozwoju, wyniki testów, historia treningów i prywatny dziennik kariery.",
      },
      { property: "og:title", content: "Postęp zawodnika – BallWise" },
      {
        property: "og:description",
        content:
          "Realne dane z Twoich treningów i testów: regularność, zmiany wyników i kolejny konkretny cel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SectionTitle({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof LineChart;
  title: string;
  hint?: string;
}) {
  return (
    <div className="px-1">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="soft-card px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ProgressScreen() {
  const { state, todayIso } = useLoadwise();
  const { user } = useAuth();
  const [vision, setVision] = useState<VisionTestResult[]>([]);
  const [filter, setFilter] = useState<TrainingCategoryKey | "all">("all");
  const [metricTab, setMetricTab] = useState<MetricCategoryKey>("speed");

  useEffect(() => {
    let alive = true;
    listAllResults(user?.id ?? null)
      .then((r) => alive && setVision(r))
      .catch(() => alive && setVision([]));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const history = useMemo(
    () => buildTrainingHistory(state.plan, state.completions),
    [state.plan, state.completions],
  );

  const series = useMemo(
    () => buildMetricSeries(state.tests, vision),
    [state.tests, vision],
  );

  const from = daysAgoIso(30);
  const summary = useMemo(
    () =>
      summarizeWindow(
        state.plan,
        history,
        [
          ...state.tests.map((t) => t.date),
          ...vision.map((v) => v.createdAt.slice(0, 10)),
        ],
        from,
        todayIso,
      ),
    [state.plan, history, state.tests, vision, from, todayIso],
  );

  const improvement = useMemo(() => bestImprovement(series), [series]);

  const filtered = useMemo(
    () => (filter === "all" ? history : history.filter((h) => h.category === filter)),
    [history, filter],
  );

  const metricsByCategory = useMemo(
    () => series.filter((s) => s.category === metricTab),
    [series, metricTab],
  );

  const upcoming = useMemo(
    () =>
      state.plan
        .filter((d) => d.date >= todayIso && d.dayType !== "rest")
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null,
    [state.plan, todayIso],
  );

  const scouting = state.scouting;
  const hasAnyData = summary.completedCount > 0 || series.length > 0;

  // Krótkie, faktograficzne podsumowanie — bez punktów i ocen.
  const narrative = (() => {
    if (!hasAnyData)
      return "Brak danych z ostatnich 30 dni. Zapisz wykonane sesje i wykonaj pierwszy test, aby zobaczyć realny obraz rozwoju.";
    const parts: string[] = [];
    parts.push(
      `W ostatnich 30 dniach zapisano ${summary.completedCount} z ${summary.plannedCount} zaplanowanych jednostek.`,
    );
    if (summary.avgRpe != null)
      parts.push(`Średnie odczuwane obciążenie utrzymywało się na poziomie ${summary.avgRpe.toFixed(1)} RPE.`);
    if (summary.testsCount > 0)
      parts.push(`Wykonano ${summary.testsCount} pomiarów kontrolnych.`);
    if (improvement)
      parts.push(
        `Największa zmiana dotyczy: ${improvement.series.label}.`,
      );
    return parts.join(" ");
  })();

  return (
    <div>
      <AppHeader title="Postęp" subtitle="Twój rozwój na podstawie realnych danych." />

      <div className="space-y-6 px-5">
        {/* Ostatnie 30 dni */}
        <section className="space-y-3">
          <SectionTitle icon={CalendarCheck} title="Ostatnie 30 dni" />
          <div className="soft-card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/50 py-3">
                <div className="text-xl font-bold">{summary.completedCount}</div>
                <div className="text-[10px] text-muted-foreground">treningi</div>
              </div>
              <div className="rounded-xl bg-muted/50 py-3">
                <div className="text-xl font-bold">
                  {summary.regularityPct != null ? `${summary.regularityPct}%` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">regularność</div>
              </div>
              <div className="rounded-xl bg-muted/50 py-3">
                <div className="text-xl font-bold">{summary.testsCount}</div>
                <div className="text-[10px] text-muted-foreground">testy</div>
              </div>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Najważniejsza poprawa
              </div>
              <p className="mt-1 text-sm">
                {improvement && improvement.changePct != null ? (
                  <>
                    {improvement.series.label}:{" "}
                    <span className="font-semibold">
                      {improvement.latest.value} {improvement.series.unit}
                    </span>{" "}
                    ({Math.abs(improvement.changePct).toFixed(1)}% lepiej niż
                    poprzednio)
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Za mało pomiarów. Powtórz ten sam test, aby zobaczyć zmianę.
                  </span>
                )}
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {narrative}
            </p>
          </div>
        </section>

        {/* Kierunek rozwoju */}
        <section className="space-y-3">
          <SectionTitle icon={Compass} title="Kierunek rozwoju" />
          <div className="soft-card space-y-3 p-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mocne strony
              </div>
              <p className="mt-1 text-sm">
                {scouting.strengths || (
                  <span className="text-muted-foreground">
                    Uzupełnij mocne strony w profilu, aby doprecyzować kierunek.
                  </span>
                )}
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Obszar do poprawy
              </div>
              <p className="mt-1 text-sm">
                {scouting.priorities || (
                  <span className="text-muted-foreground">
                    Brak zapisanego priorytetu rozwojowego.
                  </span>
                )}
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Następny cel
              </div>
              <p className="mt-1 text-sm">
                {improvement
                  ? `Utrzymać wynik w teście ${improvement.series.label} przy kolejnym pomiarze.`
                  : series.length > 0
                    ? `Powtórzyć test ${series[0]!.label}, aby uzyskać punkt odniesienia.`
                    : "Wykonać pierwszy test w Vision Lab."}
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rekomendowane działanie z planu
              </div>
              {upcoming ? (
                <Link
                  to="/sesja/$date"
                  params={{ date: upcoming.date }}
                  search={{ slot: 1 }}
                  className="mt-1 flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-medium">
                    {formatDate(upcoming.date)} · {upcoming.title}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Brak nadchodzących jednostek w planie.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Wyniki testów */}
        <section className="space-y-3">
          <SectionTitle icon={LineChart} title="Wyniki testów" />
          <div className="-mx-5 overflow-x-auto px-5">
            <div className="flex gap-2">
              {(Object.keys(METRIC_CATEGORY_LABELS) as MetricCategoryKey[]).map(
                (k) => (
                  <button
                    key={k}
                    onClick={() => setMetricTab(k)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      metricTab === k
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {METRIC_CATEGORY_LABELS[k]}
                  </button>
                ),
              )}
            </div>
          </div>
          {metricsByCategory.length === 0 ? (
            <Empty text="Brak wyników w tej kategorii. Wykonaj test w Vision Lab lub zapisz pomiar ręcznie." />
          ) : (
            <div className="space-y-2">
              {metricsByCategory.map((s) => {
                const c = changeOf(s);
                const Icon =
                  c.improved == null
                    ? Minus
                    : c.improved
                      ? ArrowUpRight
                      : ArrowDownRight;
                const tone =
                  c.improved == null
                    ? "text-muted-foreground"
                    : c.improved
                      ? "text-primary"
                      : "text-destructive";
                return (
                  <div key={s.id} className="soft-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{s.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(c.latest.date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold leading-none">
                          {c.latest.value}
                          <span className="ml-1 text-xs font-medium text-muted-foreground">
                            {s.unit}
                          </span>
                        </div>
                        <div className={`mt-1 flex items-center justify-end gap-1 text-xs ${tone}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {c.changePct != null
                            ? `${Math.abs(c.changePct).toFixed(1)}%`
                            : "pierwszy pomiar"}
                        </div>
                      </div>
                    </div>
                    {c.previous && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Poprzednio: {c.previous.value} {s.unit} ·{" "}
                        {formatDate(c.previous.date)}
                      </div>
                    )}
                    <div className="mt-2">
                      <Sparkline points={s.points} lowerIsBetter={s.lowerIsBetter} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Historia treningów */}
        <section className="space-y-3">
          <SectionTitle icon={History} title="Historia treningów" />
          <div className="-mx-5 overflow-x-auto px-5">
            <div className="flex gap-2">
              {(["all", ...(Object.keys(TRAINING_CATEGORY_LABELS) as TrainingCategoryKey[])] as const).map(
                (k) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      filter === k
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {k === "all" ? "Wszystkie" : TRAINING_CATEGORY_LABELS[k]}
                  </button>
                ),
              )}
            </div>
          </div>
          {filtered.length === 0 ? (
            <Empty text="Brak zapisanych sesji. Ukończ trening i zapisz go w szczegółach sesji." />
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 30).map((h) => (
                <Link
                  key={h.key}
                  to="/sesja/$date"
                  params={{ date: h.date }}
                  search={{ slot: 1 }}
                  className="soft-card flex items-center gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{h.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(h.date)} · {TRAINING_CATEGORY_LABELS[h.category]}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{h.durationMin} min</div>
                    <div>{h.rpe != null ? `RPE ${h.rpe}` : "—"}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Dziennik kariery */}
        <CareerJournal />

        {/*
          Punkt odniesienia: sekcja pojawi się dopiero, gdy będą dostępne
          prawdziwe, anonimowe zakresy według wieku i pozycji. Nie generujemy
          średnich, percentyli ani rankingów.
        */}
      </div>

      <Disclaimer />
    </div>
  );
}
