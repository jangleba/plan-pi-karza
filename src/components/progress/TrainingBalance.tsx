import { TRAINING_CATEGORY_LABELS, type TrainingCategoryKey } from "@/lib/progress/progress";

const ORDER: TrainingCategoryKey[] = [
  "gym",
  "speed",
  "endurance",
  "ball",
  "club",
  "match",
  "recovery",
];

/** Rozkład ukończonych jednostek z ostatnich siedmiu dni. */
export function TrainingBalance({
  byCategory,
}: {
  byCategory: Record<TrainingCategoryKey, number>;
}) {
  const rows = ORDER.filter((key) => byCategory[key] > 0);
  const max = Math.max(1, ...rows.map((key) => byCategory[key]));

  return (
    <section className="bw-section space-y-4">
      <h2 className="bw-section-title">Balans · 7 dni</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Brak danych do pokazania rozkładu.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {rows.map((key) => (
            <div
              key={key}
              className="grid grid-cols-[minmax(6.5rem,auto)_1fr_1.5rem] items-center gap-2"
            >
              <span className="truncate text-sm text-muted-foreground">
                {TRAINING_CATEGORY_LABELS[key]}
              </span>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${TRAINING_CATEGORY_LABELS[key]}: ${byCategory[key]} jednostek`}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${(byCategory[key] / max) * 100}%` }}
                />
              </div>
              <span className="text-right text-sm font-semibold">{byCategory[key]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
