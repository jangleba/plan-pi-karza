import { useMemo, useState } from "react";
import {
  EXTRA_KINDS, EXTRA_LABEL, EXTRA_PRESET_MINUTES, MAX_MINUTES, RPE_DEFAULT, RPE_MAX, RPE_MIN, addDays, loadHistory, loadNote, loadOf, loadSummary, localISO,
  rpeHint, rpeLabel, weekExtraLoad, weekLevel, weekLoadTotal, weekStartOf,
} from "../engine";
import type { ExtraActivity, ExtraKind } from "../engine";
import { addExtra, loadExtras, removeExtra, useExtrasVersion } from "../lib/extras";
import { PASTEL, type Pastel } from "../lib/pastel";
import { Sheet } from "../Sheet";
import { TileHead } from "../TileIcon";
import { rise } from "../ui";
import { Wheel } from "../Wheel";

/** Pastelowy odcień rodzaju jednostki (w spoczynku delikatne tło i obrys, po zaznaczeniu mocniejsze). */
const KIND_TONE: Record<ExtraKind, Pastel> = { strength: PASTEL.rose, run: PASTEL.peach, football: PASTEL.mint, bike: PASTEL.aqua, swim: PASTEL.blue, walk: PASTEL.lavender, sauna: PASTEL.peach, other: PASTEL.blue };
const toneStyle = (t: Pastel, on: boolean) => ({ background: on ? t.c : t.s, color: t.i, boxShadow: `inset 0 0 0 ${on ? 1.5 : 1}px ${on ? t.solid : t.c}` });
const MINUTES = Array.from({ length: MAX_MINUTES / 5 }, (_, i) => (i + 1) * 5);
const DAYS: Array<[number, string]> = [[0, "Dziś"], [1, "Wczoraj"], [2, "2 dni temu"]];
const WD = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
const dayLabel = (iso: string, today: string) => (iso === today ? "dziś" : iso === addDays(today, -1) ? "wczoraj" : `${WD[new Date(Date.parse(iso)).getUTCDay()]} ${Number(iso.slice(8))}`);
export const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const vibrate = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* brak wibracji */ } };

/** Kafelek „Własna jednostka” w siatce na Starcie: tydzień w liczbach, ostatnia jednostka i duży plus. */
export function ExtraTile({ index = 0 }: { index?: number }) {
  const v = useExtrasVersion();
  const [open, setOpen] = useState(false);
  const today = localISO();
  const extras = useMemo(loadExtras, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = weekExtraLoad(extras, weekStartOf(today));
  const last = [...extras].sort((a, b) => b.date.localeCompare(a.date))[0];
  return (
    <>
      <div style={rise(index)} className="bw-rise relative flex min-h-[148px] flex-col justify-between rounded-3xl border border-hairline bg-card p-4">
        <div>
          <TileHead kind="extra">Własna</TileHead>
          <p key={v} className="bw-pop mt-2.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">{week.count ? `${week.count}×` : "—"}</p>
          <p className="mt-1 text-[13px] text-muted">{week.count ? hm(week.minutes) : "w tym tygodniu"}</p>
        </div>
        <p className="mt-2 max-w-[calc(100%-3rem)] truncate text-[12px] text-muted">
          {last ? `${EXTRA_LABEL[last.kind]} · ${rpeLabel(last.rpe).toLowerCase()} · ${dayLabel(last.date, today)}` : "Co robisz sam?"}
        </p>
        <button onClick={() => setOpen(true)} aria-label="Dodaj własną jednostkę" className="bw-grad absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full text-2xl font-light leading-none active:scale-90">+</button>
      </div>
      {open && <ExtraSheet extras={extras} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

type Step = 0 | 1 | 2 | 3;

function ExtraSheet({ extras, today, onClose }: { extras: ExtraActivity[]; today: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [back, setBack] = useState(false);
  const [ago, setAgo] = useState(0);
  const [kind, setKind] = useState<ExtraKind>("football");
  const [minutes, setMinutes] = useState(60);
  const [rpe, setRpe] = useState(RPE_DEFAULT);
  const [result, setResult] = useState<{ note: string } | null>(null);
  const go = (s: Step, isBack = false) => { setBack(isBack); setStep(s); };
  const recent = [...extras].filter((a) => a.date >= addDays(today, -6)).sort((a, b) => b.date.localeCompare(a.date));
  const load = loadOf({ kind, minutes, rpe });
  const tag = load >= 700 ? "wysokie" : load >= 350 ? "umiarkowane" : "niskie";

  const save = () => {
    const date = addDays(today, -ago);
    const next = addExtra({ date, kind, minutes, rpe }, today);
    const hist = loadHistory();
    const sum = loadSummary(next, hist, today);
    const wk = weekLevel(weekLoadTotal(next, hist, weekStartOf(today), today));
    const parts = [loadNote(sum), wk === "veryHigh" ? "Tydzień jest bardzo ciężki: dodaliśmy dzień regeneracji i lżejsze sesje." : wk === "high" ? "Tydzień jest ciężki: kolejne sesje będą lżejsze." : null].filter(Boolean);
    setResult({ note: parts.length ? parts.join(" ") : "Plan zostaje bez zmian." });
    vibrate(14);
    setTimeout(onClose, 2600);
  };

  const anim = back ? "bw-step-back" : "bw-step";
  return (
    <Sheet title="Własna jednostka" onClose={onClose}>
      {result ? (
        <div className="bw-step flex flex-col items-center py-6 text-center">
          <svg viewBox="0 0 24 24" className="bw-check bw-pop h-16 w-16 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10.2" strokeWidth="1.4" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
          <p className="mt-4 text-lg font-semibold">Zapisane</p>
          <p className="mt-1 max-w-[18rem] text-sm leading-snug text-muted">{result.note}</p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex gap-1.5" aria-label={`Krok ${step + 1} z 3`}>
              {[0, 1, 2].map((i) => <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-btn" : i < step ? "w-1.5 bg-btn/60" : "w-1.5 bg-hairline"}`} />)}
            </div>
            <div className="flex gap-1.5">
              {DAYS.map(([n, t]) => <button key={n} onClick={() => setAgo(n)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${ago === n ? "bw-sel" : "bg-canvas text-muted"}`}>{t}</button>)}
            </div>
          </div>

          <div key={step} className={anim}>
            {step === 0 && (
              <>
                <h3 className="mb-3 text-[19px] font-semibold tracking-tight">Co to było?</h3>
                <div className="grid grid-cols-4 gap-2">
                  {EXTRA_KINDS.map(([k, t], i) => (
                    <button key={k} style={{ ...rise(i), ...toneStyle(KIND_TONE[k], kind === k) }} onClick={() => { setKind(k); vibrate(6); go(1); }} className="bw-rise rounded-2xl py-4 text-[13px] font-medium transition-[background-color,box-shadow] duration-200 active:scale-95" >{t}</button>
                  ))}
                </div>
                {recent.length > 0 && (
                  <div className="mt-6">
                    <h4 className="mb-2 text-xs uppercase tracking-wide text-muted">Ostatnie 7 dni</h4>
                    <ul className="overflow-hidden rounded-2xl border border-hairline">
                      {recent.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-0">
                          <span className="min-w-0 text-sm"><span className="font-medium">{EXTRA_LABEL[a.kind]}</span> · {hm(a.minutes)} · {rpeLabel(a.rpe).toLowerCase()}
                            <span className="block text-xs text-muted">{dayLabel(a.date, today)} · obciążenie {loadOf(a)}</span></span>
                          <button onClick={() => removeExtra(a.id, today)} aria-label="Usuń" className="shrink-0 rounded-full p-2 text-muted">✕</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <h3 className="mb-3 text-[19px] font-semibold tracking-tight">Jak długo? <span className="font-normal text-muted">· {EXTRA_LABEL[kind].toLowerCase()}</span></h3>
                <div className="mb-3 flex flex-wrap gap-2">
                  {EXTRA_PRESET_MINUTES.map((m) => <button key={m} onClick={() => { setMinutes(m); vibrate(5); }} style={toneStyle(KIND_TONE[kind], minutes === m)} className="rounded-full px-4 py-2 text-sm font-medium transition-[background-color,box-shadow] duration-200">{hm(m)}</button>)}
                </div>
                <div className="mx-auto mb-5 w-44"><Wheel key={minutes} values={MINUTES} value={minutes} onChange={setMinutes} format={hm} label="Dokładny czas" /></div>
                <button onClick={() => go(2)} className="bw-grad w-full rounded-2xl py-3.5 text-base font-medium">Dalej</button>
              </>
            )}

            {step === 2 && (
              <>
                <h3 className="mb-1 text-[19px] font-semibold tracking-tight">Jak mocno?</h3>
                <p className="mb-5 text-sm text-muted">{EXTRA_LABEL[kind]} · {hm(minutes)}</p>
                <div key={rpeLabel(rpe)} className="bw-pop mb-1 text-center text-[32px] font-semibold tracking-tight">{rpeLabel(rpe)}</div>
                <p className="mb-4 h-5 text-center text-sm text-muted">{rpeHint(rpe)}</p>
                <input type="range" min={RPE_MIN} max={RPE_MAX} step={1} value={rpe} aria-label="Wysiłek od lekko do mocno" aria-valuetext={`${rpeLabel(rpe)}, ${rpe} z ${RPE_MAX}`}
                  onChange={(e) => { setRpe(Number(e.target.value)); vibrate(4); }} className="bw-range mb-1 w-full" />
                <div className="mb-5 flex justify-between text-[11px] text-muted"><span>lekko</span><span>mocno</span></div>
                <p className="mb-4 text-center text-xs text-muted">Obciążenie dla planu: <span className="font-medium text-ink">{tag}</span></p>
                <button onClick={save} className="bw-grad w-full rounded-2xl py-3.5 text-base font-medium">Zapisz jednostkę</button>
              </>
            )}
          </div>
          {step > 0 && <button onClick={() => go((step - 1) as Step, true)} className="mx-auto mt-3 block px-4 py-2 text-sm text-muted">Wstecz</button>}
        </>
      )}
    </Sheet>
  );
}
