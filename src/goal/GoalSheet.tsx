import { useState } from "react";
import { FOCUS, FOCUS_LABEL, LEAGUES, MAX_FOCUS, clearAmbition, loadAmbition, localISO, saveAmbition, type Ambition, type Focus, type League } from "../engine";
import { Sheet } from "../Sheet";

const chip = (on: boolean) => `rounded-2xl px-3 py-2.5 text-sm ${on ? "bw-sel font-medium" : "border border-hairline bg-canvas"}`;

/** Ustalanie celu: liga jako własna ambicja zawodnika i do dwóch rzeczy, nad którymi pracuje w tym cyklu. */
export function GoalSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const cur = loadAmbition();
  const [league, setLeague] = useState<League | null>(cur?.league ?? null);
  const [focus, setFocus] = useState<Focus[]>(cur?.focus ?? []);
  const toggle = (f: Focus) => setFocus((x) => (x.includes(f) ? x.filter((y) => y !== f) : x.length >= MAX_FOCUS ? [x[1]!, f] : [...x, f]));
  const empty = !league && !focus.length;
  const save = () => {
    if (empty) clearAmbition();
    else { const a: Ambition = { ...(league ? { league } : {}), focus, setAt: localISO() }; saveAmbition(a); }
    onSaved();
    onClose();
  };
  return (
    <Sheet title="Twój cel" onClose={onClose}>
      <h3 className="mb-2 text-sm font-semibold">W jakiej lidze chcesz grać?</h3>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {LEAGUES.map((l) => <button key={l} onClick={() => setLeague(league === l ? null : l)} className={chip(league === l)}>{l}</button>)}
        <button onClick={() => setLeague(null)} className={chip(league === null)}>Jeszcze nie wiem</button>
      </div>
      <h3 className="mb-1 text-sm font-semibold">Nad czym chcesz popracować w tym cyklu?</h3>
      <p className="mb-2 text-xs text-muted">Wybierz do dwóch.</p>
      <div className="mb-6 flex flex-wrap gap-2">
        {FOCUS.map((f) => <button key={f} onClick={() => toggle(f)} className={chip(focus.includes(f))}>{FOCUS_LABEL[f]}</button>)}
      </div>
      <button onClick={save} className="w-full rounded-2xl bw-grad py-4 text-base font-medium">{empty && cur ? "Usuń cel" : "Zapisz"}</button>
    </Sheet>
  );
}
