import { useState } from "react";
import { Sheet } from "../Sheet";
import type { BagGroup } from "../engine/bag";
import { loadBag, saveBag } from "./store";

/** Torba meczowa: lista kontrolna z zaznaczaniem (zapis lokalny po dacie meczu). */
export function Bag({ groups, date, onChange, onClose }: { groups: BagGroup[]; date: string; onChange: () => void; onClose: () => void }) {
  const [checked, setChecked] = useState<string[]>(() => loadBag(date));
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const done = groups.reduce((s, g) => s + g.items.filter((i) => checked.includes(i.id)).length, 0);
  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    setChecked(next); saveBag(date, next); onChange();
  };
  return (
    <Sheet title="Torba meczowa" onClose={onClose}>
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-muted"><span>Spakowane</span><span className="tabular-nums">{done} z {total}</span></div>
        <div className="h-1.5 rounded-full bg-hairline"><div className="h-1.5 rounded-full bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)] transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="mb-4">
          <h3 className="mb-1 px-1 text-xs uppercase tracking-wide text-muted">{g.title}</h3>
          <div className="rounded-2xl bg-canvas px-4">
            {g.items.map((i) => {
              const on = checked.includes(i.id);
              return (
                <button key={i.id} onClick={() => toggle(i.id)} className="flex w-full items-center gap-3 border-b border-hairline/70 py-3 text-left last:border-0">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${on ? "bw-grad border-transparent" : "border-hairline bg-card"}`}>{on ? "✓" : ""}</span>
                  <span className={`flex-1 text-[15px] ${on ? "text-muted line-through" : ""}`}>{i.label}</span>
                  {i.note && <span className="text-right text-xs text-muted">{i.note}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted">Jedzenie i picie wynikają z planu dnia meczu; reszta to ogólna lista – dopisz, czego wymaga Twój klub.</p>
      <button onClick={() => { setChecked([]); saveBag(date, []); onChange(); }} className="mt-3 text-sm text-accent">Wyczyść zaznaczenia</button>
    </Sheet>
  );
}
