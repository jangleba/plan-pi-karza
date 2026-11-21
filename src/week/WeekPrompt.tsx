import { useState } from "react";
import { MAX_MATCHES, addDays, matchWord, saveMatchWeek, type Profile, type WeekAsk } from "../engine";
import { Sheet } from "../Sheet";

const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const pl = (iso: string) => `${Number(iso.slice(8))}.${iso.slice(5, 7)}`;

/** Pytanie o termin meczu lub sparingu na tydzień (w niedzielę o kolejny): do dwóch dni albo „Nie mam”. */
export function WeekPrompt({ profile, ask, onClose }: { profile: Profile; ask: WeekAsk; onClose: () => void }) {
  const word = matchWord(profile.season);
  const [days, setDays] = useState<number[]>([]);
  const [touched, setTouched] = useState(false);
  const toggle = (i: number) => {
    setTouched(true);
    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : d.length >= MAX_MATCHES ? [d[1]!, i] : [...d, i].sort((a, b) => a - b)));
  };
  const save = (list: number[]) => { saveMatchWeek(ask.weekStart, list); onClose(); };
  const title = ask.kind === "next" ? "Kolejny tydzień" : "Ten tydzień";
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="-mt-1 mb-4 text-sm text-muted">{pl(ask.weekStart)} – {pl(addDays(ask.weekStart, 6))}</p>
      <h3 className="mb-1 text-[17px] font-semibold">Kiedy {word}?</h3>
      <p className="mb-3 text-xs text-muted">Wybierz do dwóch dni.</p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={`Dni: ${word}`}>
        {DAYS.map((d, i) => {
          const on = days.includes(i);
          return (
            <button key={`${i}-${on}`} onClick={() => toggle(i)} aria-pressed={on} aria-label={`${d} ${pl(addDays(ask.weekStart, i))}${on ? `, ${word}` : ""}`}
              className={`${touched ? "bw-pop" : "bw-tile-in"} flex h-[68px] flex-col items-center justify-center rounded-2xl ${on ? "bw-sel" : "border border-hairline bg-card"}`}
              style={touched ? undefined : { animationDelay: `${120 + i * 55}ms` }}>
              <span className="text-sm font-semibold">{d}</span>
              <span className={`mt-0.5 text-[11px] tabular-nums ${on ? "" : "text-muted"}`}>{Number(addDays(ask.weekStart, i).slice(8))}</span>
            </button>
          );
        })}
      </div>
      <button onClick={() => save(days)} disabled={!days.length} className={`mt-6 w-full rounded-2xl py-4 text-base font-medium transition ${days.length ? "bw-grad" : "bg-hairline text-muted"}`}>Zapisz</button>
      <button onClick={() => save([])} className="mt-2 w-full rounded-2xl py-3 text-sm text-muted">Nie mam {word === "mecz" ? "meczu" : "sparingu"} w tym tygodniu</button>
    </Sheet>
  );
}
