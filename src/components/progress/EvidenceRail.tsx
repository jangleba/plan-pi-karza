import { Dumbbell, CheckCircle2, Flag } from "lucide-react";
import type { EvidenceCard, EvidenceKind } from "@/lib/progress/dashboard";

const ICON: Record<EvidenceKind, typeof Dumbbell> = {
  training: Dumbbell,
  regularity: CheckCircle2,
  match: Flag,
};

/** Dowody oparte wyłącznie na zapisanych sesjach. */
export function EvidenceRail({ cards }: { cards: EvidenceCard[] }) {
  if (cards.length === 0) {
    return (
      <section className="soft-card p-4">
        <h2 className="text-sm font-semibold">Ostatnie wykonanie</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ukończ trening i zapisz RPE, aby pojawiły się pierwsze dane.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold">Ostatnie wykonanie</h2>
      <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
        {cards.map((card) => {
          const Icon = ICON[card.kind];
          return (
            <article
              key={card.id}
              className="soft-card w-[62%] shrink-0 snap-start p-3.5"
            >
              <div className="flex items-center gap-1.5 text-primary">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">
                  Zapisane dane
                </span>
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-snug">
                {card.title}
              </div>
              {card.value != null && (
                <div className="mt-1 text-2xl font-bold leading-none">
                  {card.value}
                  {card.suffix && (
                    <span className="ml-1 text-xs font-medium text-muted-foreground">
                      {card.suffix}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-1 text-[11px] text-muted-foreground">
                {card.detail}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
