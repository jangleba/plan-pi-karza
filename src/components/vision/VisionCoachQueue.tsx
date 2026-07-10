import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Inbox, ShieldAlert } from "lucide-react";
import { VisionHeader, ReviewStatusBadge, ConfidenceBadge } from "./visionUi";
import { useAuth } from "@/lib/loadwise/auth";
import { isCoach, listCoachQueue } from "@/lib/vision/visionRepo";
import {
  CATEGORY_LABELS,
  PAID_REVIEW_STATUS_LABELS,
  REVIEW_TYPE_LABELS,
  type VisionTestResult,
} from "@/lib/vision/types";
import { formatDate } from "@/lib/loadwise/labels";

export function VisionCoachQueue() {
  const { user, loading } = useAuth();
  const [coach, setCoach] = useState<boolean | null>(null);
  const [items, setItems] = useState<VisionTestResult[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    isCoach(user.id).then(async (c) => {
      setCoach(c);
      if (c) {
        try {
          setItems(await listCoachQueue());
        } catch {
          setItems([]);
        }
      }
      setBusy(false);
    });
  }, [user, loading]);

  if (busy || coach === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ładowanie kolejki…
      </div>
    );
  }

  if (!coach) {
    return (
      <div>
        <VisionHeader title="Coach Review Queue" backTo="/vision-lab" />
        <div className="mx-5 soft-card flex flex-col items-center p-8 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Ta sekcja jest dostępna tylko dla trenerów. Skontaktuj się z administratorem,
            aby otrzymać rolę trenera.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <VisionHeader
        title="Coach Review Queue"
        subtitle="Testy zgłoszone przez zawodników do weryfikacji."
        backTo="/vision-lab"
      />
      <div className="space-y-2.5 px-5">
        {items.length === 0 ? (
          <div className="soft-card flex flex-col items-center p-8 text-center">
            <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Brak testów w kolejce.</p>
          </div>
        ) : (
          items.map((it) => (
            <Link
              key={it.id}
              to="/vision-lab/coach/$resultId"
              params={{ resultId: it.id }}
              className="soft-card block p-4 transition-transform active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{it.testName}</h3>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {CATEGORY_LABELS[it.testCategory]} · {formatDate(it.createdAt.slice(0, 10))}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Zawodnik: {it.userId.slice(0, 8)}…
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {it.mainResultValue != null && (
                    <span className="text-base font-bold text-foreground">
                      {it.mainResultValue}
                      <span className="ml-0.5 text-xs text-muted-foreground">{it.mainResultUnit}</span>
                    </span>
                  )}
                  <div className="text-[11px] text-muted-foreground">FPS {it.fps ?? "—"}</div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <ReviewStatusBadge status={it.reviewStatus} />
                <ConfidenceBadge level={it.confidenceScore} />
                {it.reviewType && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {REVIEW_TYPE_LABELS[it.reviewType]}
                  </span>
                )}
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-brand">
                  {PAID_REVIEW_STATUS_LABELS[it.paidReviewStatus]}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
