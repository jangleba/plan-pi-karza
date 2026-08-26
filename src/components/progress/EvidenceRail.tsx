import { Link } from "@tanstack/react-router";
import { Trophy, Dumbbell, Video, CheckCircle2, Flag } from "lucide-react";
import type { EvidenceCard, EvidenceKind } from "@/lib/progress/dashboard";

const ICON: Record<EvidenceKind, typeof Trophy> = {
  record: Trophy,
  training: Dumbbell,
  vision: Video,
  regularity: CheckCircle2,
  match: Flag,
};

/** Poziomy pas dowodów rozwoju — tylko realne zdarzenia z aplikacji. */
export function EvidenceRail({
  cards,
  onNavigateTests,
}: {
  cards: EvidenceCard[];
  onNavigateTests: () => void;
}) {
  if (cards.length === 0) {
    return (
      <section className="soft-card p-4">
        <h2 className="text-sm font-semibold">Dowody rozwoju</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tu pojawią się rekordy, ukończone treningi i analizy Vision Lab, gdy zaczniesz
          je zapisywać.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold">Dowody rozwoju</h2>
      <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
        {cards.map((card) => {
          const Icon = ICON[card.kind];
          const body = (
            <div
              className={`soft-card h-full w-[62%] shrink-0 snap-start p-3.5 transition-transform duration-200 active:scale-[0.98] ${
                card.isRecord ? "ring-1 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 text-primary">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">
                  {card.isRecord ? "Rekord" : "Zapisane"}
                </span>
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-snug">{card.title}</div>
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
              <div className="mt-1 text-[11px] text-muted-foreground">{card.detail}</div>
            </div>
          );

          if (card.to === "vision") {
            return (
              <Link key={card.id} to="/vision-lab" className="contents">
                {body}
              </Link>
            );
          }
          if (card.to === "plan") {
            return (
              <Link key={card.id} to="/plan" className="contents">
                {body}
              </Link>
            );
          }
          return (
            <button key={card.id} onClick={onNavigateTests} className="contents">
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}
