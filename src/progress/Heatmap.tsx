import { addDays, weekStartOf } from "../engine";
import type { Cell } from "../engine";

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

/** Mapa realizacji planu: kolumny = tygodnie (od najstarszego), wiersze = dni tygodnia. */
export function Heatmap({ cells, today, weeks = 12 }: { cells: Map<string, Cell>; today: string; weeks?: number }) {
  const first = weekStartOf(addDays(today, -7 * (weeks - 1)));
  const cols = Array.from({ length: weeks }, (_, w) => addDays(first, w * 7));
  const cell = (date: string) => {
    const c = cells.get(date);
    const future = date > today;
    const base = "h-[18px] w-[18px] rounded-[5px]";
    if (c?.state === "done") return <span key={date} title={`${date} · wykonane`} className={`${base} bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)]`} />;
    if (c?.state === "missed") return <span key={date} title={`${date} · pominięte`} className={`${base} border border-dashed border-muted/60 bg-card`} />;
    if (c?.state === "planned") return <span key={date} title={`${date} · zaplanowane`} className={`${base} bg-canvas shadow-[inset_0_0_0_1px_var(--color-hairline)]`} />;
    return <span key={date} className={`${base} ${future ? "" : "bg-hairline/35"}`} />;
  };
  return (
    <div>
      <div className="flex gap-1.5">
        <div className="flex flex-col justify-between pt-[18px] text-[9px] leading-[18px] text-muted">
          {DAYS.map((d, i) => <span key={d} className={i % 2 ? "opacity-0" : ""}>{d}</span>)}
        </div>
        <div className="flex flex-1 justify-between">
          {cols.map((w, ci) => {
            const mark = ci === 0 || MONTHS[Number(w.slice(5, 7)) - 1] !== MONTHS[Number(cols[ci - 1]!.slice(5, 7)) - 1];
            return (
              <div key={w} className="flex flex-col items-center gap-[3px]">
                <span className="h-[15px] text-[9px] leading-[15px] text-muted">{mark ? MONTHS[Number(w.slice(5, 7)) - 1] : ""}</span>
                {Array.from({ length: 7 }, (_, d) => cell(addDays(w, d)))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px] bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)]" />wykonane</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px] border border-dashed border-muted/60" />pominięte</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px] bg-canvas shadow-[inset_0_0_0_1px_var(--color-hairline)]" />przed nami</span>
      </div>
    </div>
  );
}
