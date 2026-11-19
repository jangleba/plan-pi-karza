import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "../Sheet";
import { FOOD_BY_ID, amountText, macrosOf, plural, searchLocal, type Food } from "../engine/foods";
import { searchOff } from "../lib/off";
import { loadRecents, pushRecent } from "./store";

const field = "w-full rounded-xl bg-canvas px-3 py-2.5 text-[15px] outline-none";
const POPULAR = ["banana", "rice-cooked", "egg", "pasta-cooked", "bread-rye", "yogurt", "oats", "milk", "apple", "cottage-semi", "roll", "potato"];

export interface NewMeal { name: string; carb: number; protein: number; fat: number }

/** Dodawanie jedzenia: wyszukiwarka (baza wbudowana + Open Food Facts), potem porcja. */
export function AddFood({ onAdd, onClose, title = "Dodaj jedzenie" }: { onAdd: (m: NewMeal) => void; onClose: () => void; title?: string }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ food: Food; g: number } | null>(null);
  const [off, setOff] = useState<{ state: "idle" | "loading" | "ok" | "error"; foods: Food[] }>({ state: "idle", foods: [] });
  const recents = useMemo(loadRecents, []);
  const local = useMemo(() => searchLocal(q), [q]);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setOff({ state: "idle", foods: [] }); return; }
    const id = ++seq.current;
    setOff((o) => ({ ...o, state: "loading" }));
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      searchOff(term, ctl.signal)
        .then((foods) => { if (id === seq.current) setOff({ state: "ok", foods }); })
        .catch(() => { if (id === seq.current && !ctl.signal.aborted) setOff({ state: "error", foods: [] }); });
    }, 400);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q]);

  const pick = (food: Food, g?: number) => setSel({ food, g: g ?? (food.unit && food.unit.g > 0 ? food.unit.g : 100) });

  if (sel) return <Portion sel={sel} setSel={setSel} onAdd={(m) => { pushRecent({ food: sel.food, g: sel.g }); onAdd(m); }} onClose={onClose} />;

  const row = (f: Food, g?: number) => {
    const m = macrosOf(f, 100);
    return (
      <button key={f.id} onClick={() => pick(f, g)} className="flex w-full items-center justify-between gap-3 border-b border-hairline py-3 text-left last:border-0">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{f.name}</span>
          <span className="block truncate text-xs text-muted">{f.brand ? `${f.brand} · ` : ""}{g ? amountText(f, g) + " · " : ""}na 100 g: {m.carb} g węgli · {m.protein} g białka</span>
        </span>
        <span className="text-muted">›</span>
      </button>
    );
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <input autoFocus className={field} placeholder="Szukaj: banan, ryż, jogurt Piątnica…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q.trim() && (
        <>
          {recents.length > 0 && (
            <>
              <h3 className="mb-1 mt-5 text-xs uppercase tracking-wide text-muted">Ostatnio</h3>
              <div>{recents.map((r) => row(r.food, r.g))}</div>
            </>
          )}
          <h3 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Popularne</h3>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((id) => FOOD_BY_ID[id]).filter((f): f is Food => !!f).map((f) => (
              <button key={f.id} onClick={() => pick(f)} className="rounded-full border border-hairline bg-canvas px-3.5 py-2 text-sm">{f.name.replace(/ \(.*\)/, "")}</button>
            ))}
          </div>
        </>
      )}
      {q.trim() && (
        <>
          {local.length > 0 && <div className="mt-3">{local.map((f) => row(f))}</div>}
          {q.trim().length >= 3 && (
            <>
              <h3 className="mb-1 mt-5 text-xs uppercase tracking-wide text-muted">Produkty ze sklepów</h3>
              {off.state === "loading" && <p className="py-3 text-sm text-muted">Szukam…</p>}
              {off.state === "error" && <p className="py-3 text-sm text-muted">Brak połączenia z bazą sklepową. Dostępne są produkty podstawowe.</p>}
              {off.state === "ok" && off.foods.length === 0 && <p className="py-3 text-sm text-muted">Nic nie znaleziono.</p>}
              <div>{off.foods.map((f) => row(f))}</div>
              {off.state === "ok" && off.foods.length > 0 && <p className="mt-3 text-[11px] text-muted">Dane: Open Food Facts (dodawane przez użytkowników – mogą być niedokładne).</p>}
            </>
          )}
          {local.length === 0 && q.trim().length < 3 && <p className="py-3 text-sm text-muted">Wpisz co najmniej 3 litery, by przeszukać produkty ze sklepów.</p>}
        </>
      )}
    </Sheet>
  );
}

function Portion({ sel, setSel, onAdd, onClose }: { sel: { food: Food; g: number }; setSel: (s: { food: Food; g: number } | null) => void; onAdd: (m: NewMeal) => void; onClose: () => void }) {
  const { food, g } = sel;
  const unit = food.unit && food.unit.g > 0 ? food.unit : null;
  const chips: Array<{ label: string; g: number }> = unit
    ? [1, 2, 3].map((n) => ({ label: `${n} ${plural(n, unit)}`, g: n * unit.g }))
    : [50, 100, 150, 200].map((x) => ({ label: `${x} ${food.liquid ? "ml" : "g"}`, g: x }));
  const m = macrosOf(food, g);
  const label = food.brand ? `${food.name} (${food.brand})` : food.name;
  return (
    <Sheet title={food.name} onClose={onClose}>
      <button onClick={() => setSel(null)} className="mb-3 text-sm text-accent">‹ Wróć do wyszukiwania</button>
      {food.brand && <p className="mb-3 text-sm text-muted">{food.brand}</p>}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.label} onClick={() => setSel({ food, g: c.g })} className={`rounded-full border px-4 py-2 text-sm ${Math.round(g) === Math.round(c.g) ? "bw-sel font-medium" : "border-hairline bg-canvas"}`}>{c.label}</button>
        ))}
      </div>
      <label className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
        Własna ilość ({food.liquid ? "ml" : "g"})
        <input inputMode="decimal" value={Number.isFinite(g) ? String(Math.round(g)) : ""} onChange={(e) => setSel({ food, g: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })} className="w-24 rounded-lg bg-canvas px-2 py-1.5 text-right text-ink outline-none" />
      </label>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-canvas py-3"><div className="text-xl font-semibold tabular-nums">{m.carb}</div><div className="text-xs text-muted">g węgli</div></div>
        <div className="rounded-2xl bg-canvas py-3"><div className="text-xl font-semibold tabular-nums">{m.protein}</div><div className="text-xs text-muted">g białka</div></div>
        <div className="rounded-2xl bg-canvas py-3"><div className="text-xl font-semibold tabular-nums">{food.fatUnknown ? "?" : m.fat}</div><div className="text-xs text-muted">g tłuszczu</div></div>
      </div>
      <p className="mt-3 text-[11px] text-muted">{food.source === "off" ? "Dane z Open Food Facts – sprawdź z etykietą." : food.est ? "Szacunek bez pozycji w tabelach USDA – sprawdź z etykietą." : "Dane: USDA FoodData Central (produkty amerykańskie – polskie mogą się różnić)."}</p>
      <button disabled={g <= 0} onClick={() => onAdd({ name: `${label} · ${amountText(food, g)}`, carb: m.carb, protein: m.protein, fat: food.fatUnknown ? 0 : m.fat })} className="mt-5 w-full rounded-2xl bw-grad py-4 text-base font-medium disabled:opacity-40">Dodaj</button>
    </Sheet>
  );
}
