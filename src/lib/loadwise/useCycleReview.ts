import { useEffect, useMemo, useState } from "react";
import { addIsoDays } from "@/lib/isoDate";
import { cycleStartOf } from "./cycleReview";
import { CYCLE_REVIEW_MAX_AGE_DAYS, loadPastCycleReviews } from "./cycleReviewData";
import type { CycleStartRecord, SessionDay } from "./types";

const STORAGE_KEY = (userId: string) => `ballwise:cycle-review:v1:${userId}`;

type Store = Pick<Storage, "getItem" | "setItem">;

function safeStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Klucz podsumowania: przegląd dotyczy jednego zakończonego cyklu. */
export function cycleReviewKey(record: CycleStartRecord): string {
  return record.reviewedCycleId ?? `${record.review.startDate}_${record.review.endDate}`;
}

export function dismissedCycles(userId: string, store: Store | null = safeStore()): string[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(STORAGE_KEY(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function dismissCycle(userId: string, cycleId: string, store: Store | null = safeStore()) {
  try {
    const next = [...dismissedCycles(userId, store).filter((id) => id !== cycleId), cycleId];
    store?.setItem(STORAGE_KEY(userId), JSON.stringify(next.slice(-12)));
  } catch {
    // Prywatna karta / pełna pamięć: karta zniknie do końca sesji ekranu.
  }
}

/** Czy pokazać kartę na Start: świeże podsumowanie, jeszcze nie zamknięte. */
export function shouldShowCycleCard(
  record: CycleStartRecord | null,
  todayIso: string,
  dismissed: readonly string[],
): boolean {
  if (!record) return false;
  if (todayIso > addIsoDays(record.review.endDate, CYCLE_REVIEW_MAX_AGE_DAYS)) return false;
  return !dismissed.includes(cycleReviewKey(record));
}

/**
 * Karta „Koniec cyklu” na Start — raz na cykl, do kliknięcia przycisku.
 * Podsumowanie jest zapisane w planie nowego cyklu (to samo, którego użył silnik).
 */
export function useCycleReviewCard(
  userId: string | null | undefined,
  plan: readonly SessionDay[],
  todayIso: string,
): { record: CycleStartRecord | null; dismiss: () => void } {
  const record = useMemo(() => cycleStartOf(plan), [plan]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    setDismissed(userId ? dismissedCycles(userId) : []);
  }, [userId]);
  const visible = userId && shouldShowCycleCard(record, todayIso, dismissed) ? record : null;
  return {
    record: visible,
    dismiss: () => {
      if (!userId || !record) return;
      const key = cycleReviewKey(record);
      dismissCycle(userId, key);
      setDismissed((current) => [...current, key]);
    },
  };
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
