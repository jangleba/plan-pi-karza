import { useState } from "react";
import { addEvents, calcMas, formatPace, localISO } from "./engine";
import type { Mas } from "./engine";
import { pushMas } from "./lib/sync";

export function loadMas(): Mas | null {
  try {
    const v = Number(localStorage.getItem("masDistance"));
    return v > 0 ? calcMas(v) : null;
  } catch {
    return null;
  }
}

/** Zapis MAS z dystansu (ręcznie lub z GPS po teście 5 min). */
export function saveMasDistance(d: number): Mas {
  try { localStorage.setItem("masDistance", String(d)); } catch { /* brak pamięci */ }
  const m = calcMas(d);
  addEvents([{ date: localISO(), type: "mas", key: "mas", value: m.kmh }]);
  void pushMas(d);
  return m;
}

/** MAS w jednostce biegowej: wynik testu 5 min i zapis nowego. */
export function MasCard({ mas, onChange }: { mas: Mas | null; onChange: (m: Mas) => void }) {
  const [text, setText] = useState("");
  const save = () => {
    const d = Number(text);
    if (!(d >= 500 && d <= 2500)) return;
    const m = saveMasDistance(d); setText("");
    onChange(m);
  };
  return (
    <section className="mt-4 rounded-2xl border border-hairline bg-canvas p-3">
      <div className="text-sm font-medium">Twoje MAS</div>
      <p className="text-xs text-muted">
        {mas ? `${mas.kmh.toFixed(1)} km/h · tempo ${formatPace(mas.paceSecPerKm)}` : "Wpisz dystans z biegu 5-minutowego, żeby dobrać tempa."}
      </p>
      <div className="mt-2 flex gap-2">
        <input inputMode="numeric" placeholder="dystans w metrach" value={text} onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2 text-sm outline-none" />
        <button onClick={save} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-card">Zapisz</button>
      </div>
    </section>
  );
}
