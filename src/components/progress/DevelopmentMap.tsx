import { useState } from "react";
import { formatDate } from "@/lib/loadwise/labels";
import {
  AREA_LABELS,
  AREA_STATE_LABELS,
  type AreaNode,
  type AreaState,
} from "@/lib/progress/dashboard";

const STATE_STYLE: Record<AreaState, string> = {
  no_data: "bg-muted text-muted-foreground",
  baseline: "bg-accent text-primary",
  developing: "bg-primary/15 text-primary",
  improved: "bg-primary text-primary-foreground",
  retest_due: "bg-destructive/10 text-destructive",
};

/** Wizualna mapa rozwoju — stany obszarów bez sztucznych ocen liczbowych. */
export function DevelopmentMap({ nodes }: { nodes: AreaNode[] }) {
  const [open, setOpen] = useState<AreaNode | null>(null);

  return (
    <section className="soft-card p-4">
      <h2 className="text-sm font-semibold">Mapa rozwoju</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Stan każdego obszaru wynika z Twoich zapisanych danych.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {nodes.map((n) => (
          <button
            key={n.key}
            onClick={() => setOpen(n)}
            className="rounded-xl border border-border p-3 text-left transition-transform duration-200 active:scale-[0.98]"
          >
            <div className="text-xs font-semibold leading-snug">{AREA_LABELS[n.key]}</div>
            <span
              className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_STYLE[n.state]}`}
            >
              {AREA_STATE_LABELS[n.state]}
            </span>
            {n.date && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {formatDate(n.date)}
              </div>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-foreground/30 animate-fade-in"
          onClick={() => setOpen(null)}
        >
          <div
            className="w-full rounded-t-2xl bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] motion-safe:animate-[slide-in-right_250ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <h3 className="text-base font-semibold">{AREA_LABELS[open.key]}</h3>
            <span
              className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_STYLE[open.state]}`}
            >
              {AREA_STATE_LABELS[open.state]}
            </span>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Na czym opieramy ocenę
                </dt>
                <dd className="leading-snug">
                  {open.evidence ?? "Brak zapisanych danych w tym obszarze."}
                </dd>
              </div>
              {open.change && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Zmiana
                  </dt>
                  <dd className="leading-snug">{open.change}</dd>
                </div>
              )}
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Następny krok
                </dt>
                <dd className="leading-snug">{open.nextAction}</dd>
              </div>
            </dl>
            <button
              onClick={() => setOpen(null)}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
            >
              Zamknij
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
