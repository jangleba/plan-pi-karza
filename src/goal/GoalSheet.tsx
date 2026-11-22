import { useState } from "react";
import { FOCUS, FOCUS_LABEL, LEAGUES, MAX_FOCUS, clearAmbition, loadAmbition, localISO, saveAmbition, type Ambition, type Focus, type League } from "../engine";
import { PASTEL, type Pastel } from "../lib/pastel";
import { Sheet } from "../Sheet";
import { rise } from "../ui";

/** Pastelowy odcień ligi według poziomu rozgrywek (wyżej: fiolet i niebieski, niżej: miętowy i brzoskwiniowy). */
const LEAGUE_TONE = (l: League): Pastel =>
  ["Ekstraklasa", "I liga", "II liga"].includes(l) ? PASTEL.lavender
    : ["III liga", "IV liga", "V liga"].includes(l) ? PASTEL.blue
      : ["Klasa okręgowa", "A-klasa", "B-klasa", "C-klasa"].includes(l) ? PASTEL.mint
        : l.startsWith("Juniorzy") ? PASTEL.peach : PASTEL.aqua;
const FOCUS_TONE: Record<Focus, Pastel> = { regularity: PASTEL.mint, jump: PASTEL.aqua, sprint: PASTEL.peach, strength: PASTEL.rose, endurance: PASTEL.lavender };

/** Wybór: delikatny kolor i obrys w spoczynku, mocniejszy po zaznaczeniu. */
const chipStyle = (t: Pastel, on: boolean) => ({ background: on ? t.c : t.s, color: t.i, boxShadow: `inset 0 0 0 ${on ? 1.5 : 1}px ${on ? t.solid : t.c}` });
const chipCls = (on: boolean) => `rounded-2xl px-3 py-2.5 text-sm transition-[background-color,box-shadow,transform] duration-200 active:scale-95 ${on ? "font-semibold" : ""}`;

/** Ustalanie celu w dwóch krokach: liga jako własna ambicja zawodnika, potem do dwóch rzeczy, nad którymi pracuje w tym cyklu. */
export function GoalSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const cur = loadAmbition();
  const [step, setStep] = useState<0 | 1>(0);
  const [league, setLeague] = useState<League | null>(cur?.league ?? null);
  const [focus, setFocus] = useState<Focus[]>(cur?.focus ?? []);
  const toggle = (f: Focus) => setFocus((x) => (x.includes(f) ? x.filter((y) => y !== f) : x.length >= MAX_FOCUS ? [x[1]!, f] : [...x, f]));
  const empty = !league && !focus.length;
  const save = () => {
    if (empty) clearAmbition();
    else { const a: Ambition = { ...(league ? { league } : {}), focus, setAt: localISO() }; saveAmbition(a); }
    try { navigator.vibrate?.(10); } catch { /* brak wibracji */ }
    onSaved();
    onClose();
  };
  return (
    <Sheet title="Twój cel" onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Krok ${step + 1} z 2`}>
          {[0, 1].map((i) => <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-btn" : i < step ? "w-1.5 bg-btn/60" : "w-1.5 bg-hairline"}`} />)}
        </div>
        <span className="text-xs text-muted">Krok {step + 1} z 2</span>
      </div>

      <div key={step} className={step === 0 ? "bw-step-back" : "bw-step"}>
        {step === 0 ? (
          <>
            <h3 className="mb-3 text-[19px] font-semibold tracking-tight">W jakiej lidze chcesz grać?</h3>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {LEAGUES.map((l, i) => (
                <button key={l} style={{ ...rise(i), ...chipStyle(LEAGUE_TONE(l), league === l) }} onClick={() => setLeague(league === l ? null : l)} className={`bw-rise ${chipCls(league === l)}`}>{l}</button>
              ))}
              <button style={{ ...rise(LEAGUES.length), ...chipStyle(PASTEL.blue, league === null) }} onClick={() => setLeague(null)} className={`bw-rise ${chipCls(league === null)}`}>Jeszcze nie wiem</button>
            </div>
            <button onClick={() => setStep(1)} className="w-full rounded-2xl bw-grad py-4 text-base font-medium">Dalej</button>
          </>
        ) : (
          <>
            <h3 className="mb-1 text-[19px] font-semibold tracking-tight">Nad czym chcesz popracować w tym cyklu?</h3>
            <p className="mb-3 text-sm text-muted">Wybierz do dwóch.</p>
            <div className="mb-6 flex flex-wrap gap-2">
              {FOCUS.map((f, i) => <button key={f} style={{ ...rise(i), ...chipStyle(FOCUS_TONE[f], focus.includes(f)) }} onClick={() => toggle(f)} className={`bw-rise ${chipCls(focus.includes(f))}`}>{FOCUS_LABEL[f]}</button>)}
            </div>
            <button onClick={save} className="w-full rounded-2xl bw-grad py-4 text-base font-medium">{empty && cur ? "Usuń cel" : "Zapisz"}</button>
            <button onClick={() => setStep(0)} className="mx-auto mt-3 block px-4 py-2 text-sm text-muted">Wstecz</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
