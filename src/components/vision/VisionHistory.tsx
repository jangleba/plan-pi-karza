import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BookmarkCheck,
  Loader2,
  Dumbbell,
  Video,
  VideoOff,
} from "lucide-react";
import {
  VisionHeader,
  ValidityBadge,
  ConfidenceBadge,
} from "./visionUi";
import { useAuth } from "@/lib/loadwise/auth";
import {
  CATEGORY_LABELS,
  GYM_REVIEW_STATUS_LABELS,
  ANALYSIS_STATUS_LABELS,
  type VisionTestResult,
  type VisionTestCategory,
} from "@/lib/vision/types";
import { deriveGymStatus } from "@/lib/vision/visionRepo";
import { listAllResults } from "@/lib/vision/visionResultService";
import { GYM_EXERCISE_TEST_ID } from "@/lib/vision/visionTests";
import { formatDate } from "@/lib/loadwise/labels";

type Filter =
  | "all"
  | VisionTestCategory
  | "last7"
  | "last30"
  | "best";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "jump", label: "Jump Lab" },
  { key: "sprint", label: "Sprint Lab" },
  { key: "cod", label: "COD & Braking" },
  { key: "technique", label: "Gym Technique" },
  { key: "last7", label: "Ostatnie 7 dni" },
  { key: "last30", label: "Ostatnie 30 dni" },
  { key: "best", label: "Najlepsze" },
];

function lowerIsBetter(testType: string): boolean {
  return /sprint|five_ten_five|sprint_to_stop/.test(testType);
}

export function VisionHistory() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<VisionTestResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setBusy(false);
      return;
    }
    listAllResults(user.id)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setBusy(false));
  }, [user, loading]);

  const bestIds = useMemo(() => {
    const bestByType: Record<string, VisionTestResult> = {};
    for (const it of items) {
      if (it.validityStatus === "invalid" || it.mainResultValue == null) continue;
      const cur = bestByType[it.testType];
      if (!cur || cur.mainResultValue == null) {
        bestByType[it.testType] = it;
      } else {
        const better = lowerIsBetter(it.testType)
          ? it.mainResultValue < cur.mainResultValue
          : it.mainResultValue > cur.mainResultValue;
        if (better) bestByType[it.testType] = it;
      }
    }
    return new Set(Object.values(bestByType).map((r) => r.id));
  }, [items]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return items.filter((it) => {
      switch (filter) {
        case "all":
          return true;
        case "jump":
        case "sprint":
        case "cod":
        case "technique":
          return it.testCategory === filter;
        case "last7":
          return now - new Date(it.createdAt).getTime() <= 7 * 864e5;
        case "last30":
          return now - new Date(it.createdAt).getTime() <= 30 * 864e5;
        case "best":
          return bestIds.has(it.id);
        default:
          return true;
      }
    });
  }, [items, filter, bestIds]);

  return (
    <div className="pb-16">
      <VisionHeader
        title="Historia testów"
        subtitle="Wyniki, trendy i progres w czasie."
        backTo="/vision-lab"
      />

      <div className="mb-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5 px-5">
        {busy ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ładowanie…
          </div>
        ) : filtered.length === 0 ? (
          <div className="soft-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Brak wyników dla tego filtra. Wykonaj pierwszy test w Vision Lab.
            </p>
            <Link
              to="/vision-lab"
              className="mt-3 inline-flex text-sm font-medium text-primary"
            >
              Przejdź do testów
            </Link>
          </div>
        ) : (
          filtered.map((it) => <HistoryRow key={it.id} item={it} isBest={bestIds.has(it.id)} />)
        )}
      </div>
    </div>
  );
}

function HistoryRow({ item, isBest }: { item: VisionTestResult; isBest: boolean }) {
  if (item.testType === GYM_EXERCISE_TEST_ID) {
    return <GymHistoryRow item={item} />;
  }
  const label = item.comparisonToPrevious?.label;
  const Trend =
    label === "improvement" ? TrendingUp : label === "regression" ? TrendingDown : Minus;
  const trendTone =
    label === "improvement"
      ? "text-emerald-600"
      : label === "regression"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <Link
      to="/vision-lab/result/$resultId"
      params={{ resultId: item.id }}
      className="soft-card block p-4 transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{item.testName}</h3>
            {isBest && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                Rekord
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {CATEGORY_LABELS[item.testCategory]} · {formatDate(item.createdAt.slice(0, 10))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {item.analysisStatus !== "completed" ||
          item.validityStatus === "invalid" ||
          item.mainResultValue == null ? (
            <span className="text-sm font-semibold text-muted-foreground">—</span>
          ) : (
            <span className="text-lg font-bold text-foreground">
              {item.mainResultValue}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                {item.mainResultUnit}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {item.analysisStatus !== "completed" ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              item.analysisStatus === "invalid_video"
                ? "bg-destructive/12 text-destructive"
                : "bg-primary/12 text-primary"
            }`}
          >
            {ANALYSIS_STATUS_LABELS[item.analysisStatus]}
          </span>
        ) : (
          <>
            <ValidityBadge status={item.validityStatus} />
            <ConfidenceBadge level={item.confidenceScore} />
          </>
        )}
        {item.savedToProgress && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-brand">
            <BookmarkCheck className="h-3 w-3" /> W progresie
          </span>
        )}
        {item.comparisonToPrevious?.vsPrevious && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${trendTone}`}>
            <Trend className="h-3.5 w-3.5" /> {item.comparisonToPrevious.vsPrevious}
          </span>
        )}
      </div>
    </Link>
  );
}

function GymHistoryRow({ item }: { item: VisionTestResult }) {
  const status = deriveGymStatus(item);
  const hasVideo =
    !!item.videoUrl && !item.videoUrl.startsWith("placeholder://");
  return (
    <Link
      to="/vision-lab/result/$resultId"
      params={{ resultId: item.id }}
      className="soft-card block p-4 transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-brand">
          <Dumbbell className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {item.linkedExerciseName ?? item.testName}
          </h3>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Gym Exercise Review · {item.linkedTrainingDay ?? "—"} ·{" "}
            {formatDate(item.createdAt.slice(0, 10))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {GYM_REVIEW_STATUS_LABELS[status]}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {hasVideo ? (
                <>
                  <Video className="h-3 w-3" /> Film: tak
                </>
              ) : (
                <>
                  <VideoOff className="h-3 w-3" /> Film: nie
                </>
              )}
            </span>
          </div>
          {item.techniqueReview?.coach_note && (
            <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
              „{item.techniqueReview.coach_note}”
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
