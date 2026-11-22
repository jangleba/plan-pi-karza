import { useMemo, useState } from "react";
import { EXTRA_EFFORTS, EXTRA_KINDS, EXTRA_LABEL, MAX_MINUTES, addDays, loadOf, localISO, weekExtraLoad, weekStartOf } from "../engine";
import type { ExtraActivity, ExtraEffort, ExtraKind } from "../engine";
import { addExtra, loadExtras, removeExtra, useExtrasVersion } from "../lib/extras";
import { Sheet } from "../Sheet";
import { Wheel } from "../Wheel";

const MINUTES = Array.from({ length: MAX_MINUTES / 5 }, (_, i) => (i + 1) * 5);
const DAYS: Array<[number, string]> = [[0, "Dziś"], [1, "Wczoraj"], [2, "2 dni temu"]];
const WD = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
const dayLabel = (iso: string, today: string) => (iso === today ? "dziś" : iso === addDays(today, -1) ? "wczoraj" : `${WD[new Date(Date.parse(iso)).getUTCDay()]} ${Number(iso.slice(8))}`);
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

/** Karta „Własna jednostka” na Starcie: krótkie podsumowanie tygodnia i przycisk dodawania; dotknięcie podsumowania otwiera listę. */
export function ExtraCard() {
  const v = useExtrasVersion();
  const [open, setOpen] = useState(false);
  const today = localISO();
  const extras = useMemo(loadExtras, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = weekExtraLoad(extras, weekStartOf(today));
  return (
    <section className="bw-rise mb-3 rounded-3xl border border-hairline bg-card px-5 py-4" aria-label="Własna jednostka">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold">Własna jednostka</h2>
          <p className="mt-0.5 text-sm text-muted">{week.count ? `W tym tygodniu: ${week.count}× · ${hm(week.minutes)}` : "Trening, bieg, rower, basen… wpisz, co zrobiłeś sam, a plan to uwzględni."}</p>
        </div>
        <button onClick={() => setOpen(true)} className="bw-grad shrink-0 rounded-2xl px-4 py-2.5 text-sm font-medium">Dodaj</button>
      </div>
      {open && <ExtraSheet extras={extras} today={today} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ExtraSheet({ extras, today, onClose }: { extras: ExtraActivity[]; today: string; onClose: () => void }) {
  const [ago, setAgo] = useState(0);
  const [kind, setKind] = useState<ExtraKind>("football");
  const [minutes, setMinutes] = useState(60);
  const [effort, setEffort] = useState<ExtraEffort>("medium");
  const [saved, setSaved] = useState(false);
  const recent = [...extras].filter((a) => a.date >= addDays(today, -6)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Sheet title="Własna jednostka" onClose={onClose}>
      <p className="-mt-1 mb-4 text-sm text-muted">Wszystko, co zrobiłeś poza aplikacją. Uwzględnimy to przy doborze dzisiejszej sesji, żeby Cię nie przeciążyć.</p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {DAYS.map(([n, t]) => <button key={n} onClick={() => setAgo(n)} className={`rounded-2xl py-3 text-sm font-medium ${ago === n ? "bw-sel" : "bg-canvas text-ink"}`}>{t}</button>)}
      </div>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {EXTRA_KINDS.map(([k, t]) => <button key={k} onClick={() => setKind(k)} className={`rounded-2xl py-3 text-[13px] font-medium ${kind === k ? "bw-sel" : "bg-canvas text-ink"}`}>{t}</button>)}
      </div>
      <div className="mb-4 w-40"><Wheel values={MINUTES} value={minutes} onChange={setMinutes} format={hm} label="Czas" /></div>
      <div className="mb-5">
        <div className="mb-2 text-sm text-muted">Jak ciężko było?</div>
        <div className="grid grid-cols-3 gap-2">
          {EXTRA_EFFORTS.map(([e, t, hint]) => (
            <button key={e} onClick={() => setEffort(e)} className={`rounded-2xl px-1 py-3 text-sm font-medium ${effort === e ? "bw-sel" : "bg-canvas text-ink"}`}>
              {t}<span className="mt-0.5 block text-[10px] font-normal leading-tight opacity-70">{hint}</span>
            </button>
          ))}
        </div>
      </div>
      <button onClick={() => { addExtra({ date: addDays(today, -ago), kind, minutes, effort }, today); setSaved(true); setTimeout(() => setSaved(false), 1500); }}
        className="bw-grad w-full rounded-2xl py-4 text-base font-medium">{saved ? "Zapisane ✓" : "Zapisz jednostkę"}</button>
      {recent.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Ostatnie 7 dni</h3>
          <ul className="overflow-hidden rounded-2xl border border-hairline">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-0">
                <span className="min-w-0 text-sm"><span className="font-medium">{EXTRA_LABEL[a.kind]}</span> · {hm(a.minutes)} · {EXTRA_EFFORTS.find((e) => e[0] === a.effort)![1].toLowerCase()}
                  <span className="block text-xs text-muted">{dayLabel(a.date, today)} · obciążenie {loadOf(a)}</span></span>
                <button onClick={() => removeExtra(a.id, today)} aria-label="Usuń" className="shrink-0 rounded-full p-2 text-muted">✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
