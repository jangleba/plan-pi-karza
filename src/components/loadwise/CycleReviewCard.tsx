import { Flag } from "lucide-react";
import {
  CYCLE_REVIEW_SOURCES,
  cycleReviewCopy,
  type CycleReview,
} from "@/lib/loadwise/cycleReview";

/** Karta „Koniec cyklu”: wynik, jedna rekomendacja, jeden przycisk. Źródła tylko w „Więcej”. */
export function CycleReviewCard({
  review,
  onDismiss,
}: {
  review: CycleReview;
  onDismiss: () => void;
}) {
  const copy = cycleReviewCopy(review);
  return (
    <section className="bw-cycle-review" aria-label={copy.title}>
      <header>
        <Flag size={18} aria-hidden="true" />
        <h2>{copy.title}</h2>
      </header>
      <ul>
        {copy.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      <div className="bw-cycle-review__next" data-kind={review.recommendation}>
        <strong>{copy.recommendationTitle}</strong>
        <p>{copy.recommendationText}</p>
      </div>
      <details>
        <summary>Więcej</summary>
        <ul>
          {CYCLE_REVIEW_SOURCES.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </details>
      <button type="button" onClick={onDismiss}>
        {copy.button}
      </button>
    </section>
  );
}
