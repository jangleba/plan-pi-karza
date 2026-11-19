import { useState } from "react";
import { Sheet } from "../Sheet";
import { ALLERGENS, ALLERGEN_LABEL, hasDietPrefs, type Allergen, type Diet, type DietPrefs } from "../engine/allergens";

const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "bg-canvas text-ink"}`;

/** Alergeny, dieta i własne wykluczenia. Informacja pomocnicza: nie jest oceną bezpieczeństwa produktu. */
export function DietSheet({ prefs, onChange, onClose }: { prefs: DietPrefs; onChange: (p: DietPrefs) => void; onClose: () => void }) {
  const [word, setWord] = useState("");
  const toggle = (a: Allergen) => onChange({ ...prefs, allergens: prefs.allergens.includes(a) ? prefs.allergens.filter((x) => x !== a) : [...prefs.allergens, a] });
  const addWord = () => {
    const w = word.trim().slice(0, 40);
    if (w.length < 2 || prefs.custom.some((c) => c.toLowerCase() === w.toLowerCase())) { setWord(""); return; }
    onChange({ ...prefs, custom: [...prefs.custom, w].slice(0, 20) });
    setWord("");
  };
  return (
    <Sheet title="Alergeny i ograniczenia" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">Zaznacz, czego unikasz – ukryjemy pomysły, w których znamy taki składnik, i nie dołożymy go automatycznie. Wybór zostaje na tym urządzeniu.</p>

      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Alergeny</h3>
      <div className="mb-5 flex flex-wrap gap-2">
        {ALLERGENS.map((a) => <button key={a} aria-pressed={prefs.allergens.includes(a)} onClick={() => toggle(a)} className={chip(prefs.allergens.includes(a))}>{ALLERGEN_LABEL[a]}</button>)}
      </div>

      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Dieta</h3>
      <div className="mb-5 flex flex-wrap gap-2">
        {([["none", "Bez ograniczeń"], ["vegetarian", "Wegetariańska"], ["vegan", "Wegańska"]] as Array<[Diet, string]>).map(([d, t]) => (
          <button key={d} aria-pressed={prefs.diet === d} onClick={() => onChange({ ...prefs, diet: d })} className={chip(prefs.diet === d)}>{t}</button>
        ))}
      </div>

      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Własne wykluczenia</h3>
      <div className="mb-2 flex gap-2">
        <input value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addWord(); }} placeholder="np. kiwi" aria-label="Własne wykluczenie" className="min-w-0 flex-1 rounded-2xl bg-canvas px-4 py-3 text-base" />
        <button onClick={addWord} className="rounded-2xl bg-canvas px-4 text-sm font-medium">Dodaj</button>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {prefs.custom.map((c) => <button key={c} onClick={() => onChange({ ...prefs, custom: prefs.custom.filter((x) => x !== c) })} className="rounded-full bg-canvas px-3 py-1.5 text-sm" aria-label={`Usuń ${c}`}>{c} ✕</button>)}
      </div>

      <div className="rounded-2xl bg-lemon px-4 py-3 text-xs leading-snug text-lemon-ink" role="note">
        <b>To nie jest ocena bezpieczeństwa.</b> Dane dotyczą ogólnych produktów, a nie konkretnej marki. Skład prawdziwego produktu może się różnić, a brak oznaczenia nie znaczy „bezpieczne”. Przy alergii zawsze czytaj etykietę i pytaj lekarza lub dietetyka.
        {hasDietPrefs(prefs) ? " Produkty spoza naszej bazy (np. własne, z Open Food Facts) oznaczamy jako „brak danych”." : ""}
      </div>
    </Sheet>
  );
}
