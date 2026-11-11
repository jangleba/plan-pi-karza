import { Flag } from "lucide-react";
import { CycleReviewBody } from "@/components/loadwise/CycleReviewCard";
import { cycleReviewCopy } from "@/lib/loadwise/cycleReview";
import { useCycleReviewHistory } from "@/lib/loadwise/useCycleReview";
import type { CycleStartRecord, SessionDay } from "@/lib/loadwise/types";

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)}.${month}`;
}

function CycleRow({ record, open }: { record: CycleStartRecord; open?: boolean }) {
  const { review } = record;
  const copy = cycleReviewCopy(review);
  return (
    <details className="bw-cycle-review__row" open={open}>
      <summary>
        <span>
          {shortDate(review.startDate)}–{shortDate(review.endDate)}
        </span>
        <small>
          {review.done}/{review.planned} · {copy.recommendationTitle}
        </small>
      </summary>
      <CycleReviewBody review={review} />
    </details>
  );
}

/** Podsumowania cykli w Postępie: ostatnie od razu widoczne, wcześniejsze do rozwinięcia. */
export function CycleReviewHistory({
  ownerId,
  plan,
}: {
  ownerId: string | undefined;
  plan: readonly SessionDay[];
}) {
  const { records, loading } = useCycleReviewHistory(ownerId, plan);
  if (records.length === 0 && !loading) return null;
  const [latest, ...earlier] = records;
  return (
    <section className="bw-cycle-review bw-cycle-review--progress" aria-label="Podsumowania cykli">
      <header>
        <Flag size={18} aria-hidden="true" />
        <h2>Podsumowania cykli</h2>
      </header>
      {!latest && <p className="bw-cycle-review__empty">Wczytuję podsumowania…</p>}
      {latest && <CycleRow record={latest} open />}
      {earlier.map((record) => (
        <CycleRow
          key={record.reviewedCycleId ?? `${record.review.startDate}_${record.review.endDate}`}
          record={record}
        />
      ))}
    </section>
  );
}
