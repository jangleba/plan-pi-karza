import { useEffect, useMemo, useState } from "react";
import { cycleStartOf } from "./cycleReview";
import { loadPastCycleReviews } from "./cycleReviewData";
import type { CycleStartRecord, SessionDay } from "./types";

/** Klucz podsumowania: przegląd dotyczy jednego zakończonego cyklu. */
export function cycleReviewKey(record: CycleStartRecord): string {
  return record.reviewedCycleId ?? `${record.review.startDate}_${record.review.endDate}`;
}

/**
 * Earlier cycle summaries change only when a cycle ends (the newest one also comes from the
 * live plan), so one read per user is kept in memory: opening Postęp again shows them at once,
 * without a loading line or another database query. A stale copy is shown while it refreshes.
 */
const PAST_REVIEWS_FRESH_MS = 5 * 60_000;
const pastReviewsCache = new Map<string, { at: number; rows: CycleStartRecord[] }>();

/** Forgets the remembered summaries (tests). */
export function clearPastCycleReviewsCache() {
  pastReviewsCache.clear();
}

/** Wszystkie podsumowania cykli (najnowsze pierwsze) do zakładki Postęp. */
export function useCycleReviewHistory(
  userId: string | null | undefined,
  plan: readonly SessionDay[],
): { records: CycleStartRecord[]; loading: boolean } {
  const current = useMemo(() => cycleStartOf(plan), [plan]);
  const cached = userId ? pastReviewsCache.get(userId) : undefined;
  const [past, setPast] = useState<CycleStartRecord[]>(cached?.rows ?? []);
  const [loading, setLoading] = useState(Boolean(userId) && !cached);
  useEffect(() => {
    if (!userId) {
      setPast([]);
      setLoading(false);
      return;
    }
    const remembered = pastReviewsCache.get(userId);
    if (remembered) {
      setPast(remembered.rows);
      setLoading(false);
      if (Date.now() - remembered.at < PAST_REVIEWS_FRESH_MS) return;
    } else setLoading(true);
    const controller = new AbortController();
    loadPastCycleReviews(userId, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        pastReviewsCache.set(userId, { at: Date.now(), rows });
        setPast(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId]);
  const records = useMemo(() => {
    const all = current ? [current, ...past] : past;
    const seen = new Set<string>();
    return all
      .filter((record) => {
        const key = cycleReviewKey(record);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.review.endDate.localeCompare(a.review.endDate));
  }, [current, past]);
  return { records, loading };
}
