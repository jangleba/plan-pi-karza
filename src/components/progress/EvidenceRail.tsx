import type { EvidenceCard } from "@/lib/progress/dashboard";

export function EvidenceRail({ cards }: { cards: EvidenceCard[] }) {
  if (!cards.length) return null;
  return (
    <section className="bw-section space-y-4">
      <h2 className="bw-section-title">Ostatnie wykonanie</h2>
      <div className="bw-columns">
        {cards.map((card) => (
          <article key={card.id} className="space-y-2">
            <h3 className="font-medium">{card.title}</h3>
            {card.value != null && (
              <p className="text-2xl font-semibold tabular-nums">
                {card.value}
                {card.suffix && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {card.suffix}
                  </span>
                )}
              </p>
            )}
            <p className="text-sm text-muted-foreground">{card.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
