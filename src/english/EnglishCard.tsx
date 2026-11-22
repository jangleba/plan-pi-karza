import { useEffect, useMemo, useState } from "react";
import { localISO } from "../engine";
import { PASTEL } from "../lib/pastel";
import { rise } from "../ui";
import { summarize } from "./progress";
import { loadDoc, syncCloud } from "./storage";

/**
 * Karta „Piłkarski angielski” na stronie głównej. LEKKA: korzysta wyłącznie ze spisu lekcji i zapisanego postępu;
 * pełne treści i interfejs lekcji ładują się dopiero po dotknięciu przycisku (patrz Start.tsx). Dane pochodzą z rzeczywistego postępu.
 */
export function EnglishCard({ onOpen, refreshKey, tile = false, index = 0 }: { onOpen: () => void; refreshKey: number; /** Mały, biały kafelek do siatki na Starcie. */ tile?: boolean; index?: number }) {
  const [tick, setTick] = useState(0);
  const summary = useMemo(() => summarize(loadDoc(), localISO()), [tick, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Po zalogowaniu postęp z konta (np. z innego urządzenia) dociągamy w tle, po bezczynności, żeby nie spowalniać strony głównej.
  useEffect(() => {
    let alive = true;
    const run = () => { void syncCloud().then((r) => { if (alive && r.state === "ok") setTick((t) => t + 1); }); };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const id = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : (setTimeout(run, 2500) as unknown as number);
    return () => { alive = false; if (w.cancelIdleCallback && w.requestIdleCallback) w.cancelIdleCallback(id); else clearTimeout(id); };
  }, []);

  const { next, dueToday, primary } = summary;
  const title = next ? `Lekcja ${next.order}: ${next.title}` : "Wszystkie lekcje ukończone";
  const label = next ? primary : dueToday > 0 ? "Powtórz" : "Otwórz";
  if (tile) {
    return (
      <button onClick={onOpen} style={rise(index)} className="bw-rise flex min-h-[148px] flex-col justify-between rounded-3xl border border-hairline bg-card p-4 text-left active:scale-[0.98]" aria-label="Piłkarski angielski">
        <div>
          <h2 className="text-[13px] text-muted">Piłkarski angielski</h2>
          <p className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug">{title}</p>
        </div>
        <p className="mt-2 text-[12px] text-muted">{next ? `ok. ${next.minutes} min · ` : ""}powtórki: {dueToday}</p>
      </button>
    );
  }
  return (
    <section className="bw-rise mb-6 rounded-3xl border p-5" style={{ background: `linear-gradient(135deg, ${PASTEL.blue.s} 0%, ${PASTEL.lavender.s} 100%)`, borderColor: PASTEL.blue.c }} aria-label="Piłkarski angielski">
      <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: PASTEL.blue.i }}>Piłkarski angielski</h2>
      <p className="mt-2 text-[15px] leading-snug">{title}</p>
      <p className="mt-1 text-xs text-muted">
        {next ? `ok. ${next.minutes} min · ` : ""}Powtórki na dziś: {dueToday}
      </p>
      <button onClick={onOpen} className="bw-grad mt-4 w-full rounded-2xl py-3.5 text-base font-medium">{label}</button>
    </section>
  );
}
