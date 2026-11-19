import { useMemo, useRef, useState } from "react";
import { Sheet } from "../Sheet";
import { POOL_LABEL, mealToIdea, parseSpoken, topSources, type FavMeal, type Favorites, type Macro, type Parsed } from "../engine/favorites";
import { FOOD_BY_ID, amountText, searchLocal, type Food } from "../engine/foods";
import type { PoolKind } from "../engine/mealplan";

const field = "w-full rounded-xl bg-canvas px-3 py-2.5 text-[15px] outline-none";
type Tab = "fav" | "src";
const MACRO: Array<[Macro, string]> = [["protein", "Białko"], ["carb", "Węgle"], ["fat", "Tłuszcze"]];
const POOLS = Object.keys(POOL_LABEL) as Array<keyof typeof POOL_LABEL>;

/** Rozpoznawanie mowy przeglądarki (dźwięk przetwarza Apple/Google, nie aplikacja) – gdy niedostępne, zostaje pisanie/dyktowanie z klawiatury. */
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
function speechCtor(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Ulubione produkty i posiłki oraz źródła białka, węglowodanów i tłuszczów. */
export function FavoritesSheet({ favs, onChange, onClose }: { favs: Favorites; onChange: (f: Favorites) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("fav");
  const [macro, setMacro] = useState<Macro>("protein");
  const [composer, setComposer] = useState(false);
  const [q, setQ] = useState("");
  const has = (id: string) => favs.foods.includes(id);
  const toggle = (id: string) => onChange({ ...favs, foods: has(id) ? favs.foods.filter((x) => x !== id) : [...favs.foods, id] });
  const found = useMemo(() => searchLocal(q, 6), [q]);
  const sources = useMemo(() => topSources(macro, 12), [macro]);

  if (composer) return <Composer onSave={(items, pool, name) => { onChange({ ...favs, meals: [...favs.meals, { id: uid(), name, pool, items }] }); setComposer(false); }} onFoods={(ids) => onChange({ ...favs, foods: [...new Set([...favs.foods, ...ids])] })} onBack={() => setComposer(false)} onClose={onClose} />;

  const star = (id: string) => (
    <button onClick={() => toggle(id)} aria-label={has(id) ? "Usuń z ulubionych" : "Dodaj do ulubionych"} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${has(id) ? "bw-grad" : "border border-hairline bg-card text-muted"}`}>{has(id) ? "★" : "☆"}</button>
  );

  return (
    <Sheet title="Ulubione i źródła" onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1">
        {([["fav", "Ulubione"], ["src", "Źródła"]] as Array<[Tab, string]>).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-xl py-1.5 text-sm ${tab === k ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
        ))}
      </div>

      {tab === "fav" ? (
        <>
          <h3 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Produkty</h3>
          {favs.foods.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {favs.foods.map((id) => <button key={id} onClick={() => toggle(id)} className="rounded-full bw-sel px-3 py-1.5 text-sm">{FOOD_BY_ID[id]?.name.replace(/ \(.*\)/, "") ?? id} ×</button>)}
            </div>
          ) : <p className="mb-3 text-sm text-muted">Nic jeszcze – dodaj poniżej albo ze źródeł. Posiłki w planie będą z nich korzystać.</p>}
          <input className={field} placeholder="Szukaj produktu do ulubionych…" value={q} onChange={(e) => setQ(e.target.value)} />
          {found.length > 0 && q.trim() && (
            <div className="mt-1">{found.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 border-b border-hairline py-2.5 last:border-0"><span className="text-[15px]">{f.name}</span>{star(f.id)}</div>
            ))}</div>
          )}

          <h3 className="mb-2 mt-6 px-1 text-xs uppercase tracking-wide text-muted">Posiłki</h3>
          {favs.meals.length > 0 ? (
            <div className="flex flex-col gap-3">
              {favs.meals.map((m) => {
                const i = mealToIdea(m);
                return (
                  <section key={m.id} className="rounded-2xl bg-canvas p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h4 className="text-[15px] font-semibold">{m.name}</h4>
                      <button onClick={() => onChange({ ...favs, meals: favs.meals.filter((x) => x.id !== m.id) })} className="text-muted" aria-label="Usuń posiłek">×</button>
                    </div>
                    <p className="text-xs text-muted">{POOL_LABEL[m.pool as keyof typeof POOL_LABEL] ?? m.pool} · ≈ {i.carb} g węgli · {i.protein} g białka · {i.fat} g tł.</p>
                    <p className="mt-1 text-sm">{i.lines.map((l) => `${l.food.name.replace(/ \(.*\)/, "")} ${l.text}`).join(" · ")}</p>
                  </section>
                );
              })}
            </div>
          ) : <p className="text-sm text-muted">Złóż własny posiłek (wpisz lub podyktuj) – pojawi się w pomysłach na odpowiedni posiłek dnia.</p>}
          <button onClick={() => setComposer(true)} className="mt-4 w-full rounded-2xl bw-grad py-3.5 text-[15px] font-medium">Dodaj posiłek</button>
        </>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-hairline/70 p-1">
            {MACRO.map(([k, t]) => <button key={k} onClick={() => setMacro(k)} className={`rounded-xl py-1.5 text-sm ${macro === k ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>)}
          </div>
          <ul className="rounded-2xl bg-canvas px-4">
            {sources.map((s) => (
              <li key={s.food.id} className="flex items-center gap-3 border-b border-hairline/70 py-3 last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{s.food.name}</span>
                  <span className="block text-xs tabular-nums text-muted">{String(s.per100).replace(".", ",")} g {macro === "protein" ? "białka" : macro === "carb" ? "węgli" : "tłuszczu"} na 100 g{s.perUnit !== null ? ` · ${String(s.perUnit).replace(".", ",")} g w ${s.unitText}` : ""}</span>
                  <span className="block text-[11px] tabular-nums text-muted/80">pozostałe na 100 g: {[macro !== "carb" ? `węgle ${String(s.food.carb100).replace(".", ",")}` : null, macro !== "protein" ? `białko ${String(s.food.protein100).replace(".", ",")}` : null, macro !== "fat" ? `tłuszcz ${String(s.food.fat100).replace(".", ",")}` : null].filter(Boolean).join(" · ")} g</span>
                </span>
                {star(s.food.id)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Wartości z USDA FoodData Central (produkty amerykańskie; suche/surowe wg nazwy). Gwiazdka dodaje do ulubionych.</p>
        </>
      )}
    </Sheet>
  );
}

/** Składanie posiłku z tekstu lub głosu: rozpoznane produkty z gramami do poprawy, nazwa i rodzaj posiłku. */
function Composer({ onSave, onFoods, onBack, onClose }: { onSave: (items: FavMeal["items"], pool: PoolKind, name: string) => void; onFoods: (ids: string[]) => void; onBack: () => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Parsed[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [pool, setPool] = useState<keyof typeof POOL_LABEL>("breakfast");
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const Ctor = typeof window !== "undefined" ? speechCtor() : null;

  const recognise = (t: string) => { const r = parseSpoken(t); setItems(r.items); setUnknown(r.unknown); if (!name && t.trim()) setName(t.trim().split(/[,;]| z | i /)[0]!.replace(/^./, (c) => c.toUpperCase()).slice(0, 40)); };
  const dictate = () => {
    if (!Ctor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor();
    r.lang = "pl-PL"; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0]!.transcript).join(" "); const next = `${text}${text ? ", " : ""}${t}`; setText(next); recognise(next); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  const setG = (i: number, g: number) => setItems(items.map((x, k) => (k === i ? { ...x, g } : x)));
  return (
    <Sheet title="Nowy posiłek" onClose={onClose}>
      <button onClick={onBack} className="mb-3 text-sm text-accent">‹ Wróć</button>
      <textarea className={`${field} min-h-[88px] resize-none`} placeholder="np. owsianka z bananem i jogurtem, dwa jajka, ryż 150 g" value={text} onChange={(e) => { setText(e.target.value); recognise(e.target.value); }} />
      <div className="mt-2 flex items-center justify-between">
        {Ctor ? <button onClick={dictate} className={`rounded-full px-4 py-2 text-sm font-medium ${listening ? "bw-sel" : "bw-grad"}`}>{listening ? "Słucham… (dotknij, by zakończyć)" : "🎤 Dyktuj"}</button> : <span className="text-xs text-muted">Dyktowanie: użyj mikrofonu na klawiaturze telefonu.</span>}
        {text && <button onClick={() => { setText(""); setItems([]); setUnknown([]); }} className="text-sm text-muted">Wyczyść</button>}
      </div>
      <p className="mt-2 text-[11px] text-muted">Rozpoznawanie jest proste: rozumiem listę produktów z ilościami (np. „150 g”, „dwa jajka”, „pół banana”). Dyktowanie używa rozpoznawania mowy przeglądarki: dźwięk może być przetwarzany na serwerach jej dostawcy (np. Apple lub Google), a nie tylko na telefonie. Aplikacja go nie zapisuje; możesz wpisać tekst ręcznie.</p>

      {items.length > 0 && (
        <div className="mt-4 rounded-2xl bg-canvas px-4">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-hairline/70 py-2.5 last:border-0">
              <span className="min-w-0 flex-1 text-[15px]">{it.food.name}</span>
              <input inputMode="decimal" value={String(Math.round(it.g))} onChange={(e) => setG(i, Math.max(0, Number(e.target.value.replace(",", ".")) || 0))} className="w-16 rounded-lg bg-card px-2 py-1.5 text-right text-sm outline-none" aria-label="Gramy" />
              <span className="w-8 text-xs text-muted">{it.food.liquid ? "ml" : "g"}</span>
              <button onClick={() => setItems(items.filter((_, k) => k !== i))} className="text-muted" aria-label="Usuń">×</button>
            </div>
          ))}
        </div>
      )}
      {unknown.length > 0 && <p className="mt-2 text-xs text-muted">Nie rozpoznałem: {unknown.join(", ")}. Dodaj je z wyszukiwarki w „Ulubione”.</p>}

      {items.length > 0 && (
        <>
          <input className={`${field} mt-4`} placeholder="Nazwa posiłku" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            {POOLS.map((p) => <button key={p} onClick={() => setPool(p)} className={`rounded-full border px-3.5 py-2 text-sm ${pool === p ? "bw-sel font-medium" : "border-hairline bg-canvas"}`}>{POOL_LABEL[p]}</button>)}
          </div>
          <p className="mt-3 text-xs text-muted">{items.map((i) => `${i.food.name.replace(/ \(.*\)/, "")} ${amountText(i.food, i.g)}`).join(" · ")}</p>
          <button disabled={!name.trim() || items.every((i) => i.g <= 0)} onClick={() => onSave(items.filter((i) => i.g > 0).map((i) => ({ food: i.food.id, g: i.g })), pool, name.trim())} className="mt-4 w-full rounded-2xl bw-grad py-4 text-base font-medium disabled:opacity-40">Zapisz jako ulubiony posiłek</button>
          <button onClick={() => { onFoods(items.map((i) => i.food.id)); onBack(); }} className="mt-2 w-full rounded-xl py-3 text-sm text-accent">Dodaj same produkty do ulubionych</button>
        </>
      )}
    </Sheet>
  );
}

export type { Food };
