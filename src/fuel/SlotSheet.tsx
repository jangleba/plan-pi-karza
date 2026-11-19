import { useState } from "react";
import { Sheet } from "../Sheet";
import { avoidFor, filterIdeas, hasDietPrefs, type DietPrefs } from "../engine/allergens";
import { ideasWithFavorites, type Favorites } from "../engine/favorites";
import { fmtTime, type ScaledIdea, type Slot } from "../engine/mealplan";

/** Karta posiłku z planu: cel w gramach i kilka pomysłów z gramaturą; jedno dotknięcie = zjedzone. */
export function SlotSheet({ slot, dayIndex, favs, diet, eaten, onEat, onOther, onUndo, onDiet, onClose }: {
  slot: Slot; dayIndex: number; favs: Favorites; diet: DietPrefs; eaten: boolean; onEat: (idea: ScaledIdea) => void; onOther: () => void; onUndo: () => void; onDiet: () => void; onClose: () => void;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const { shown, hidden } = filterIdeas(ideasWithFavorites(slot, dayIndex, favs, avoidFor(diet)), diet);
  const ideas = shown.map((x) => x.idea);
  const unknownOf = new Map(shown.map((x) => [x.idea.id, x.unknownFoods]));
  return (
    <Sheet title={slot.title} onClose={onClose}>
      <p className="text-sm text-muted">
        <span className="tabular-nums">{fmtTime(slot.at)}</span> · cel ok. <span className="tabular-nums">{slot.carb}</span> g węglowodanów{slot.protein > 0 ? <>, <span className="tabular-nums">{slot.protein}</span> g białka</> : null}{slot.fat > 0 ? <> i <span className="tabular-nums">{slot.fat}</span> g tłuszczu</> : <> – mało tłuszczu</>}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{slot.uefa ? "Zalecenie UEFA dla piłkarzy" : "Podział orientacyjny"}</p>
      {eaten && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-accent-soft px-4 py-3 text-sm">
          <span>Zjedzone ✓</span>
          <button onClick={onUndo} className="text-muted">Cofnij</button>
        </div>
      )}
      {hasDietPrefs(diet) && (
        <p className="mt-3 rounded-2xl bg-lemon px-4 py-3 text-xs text-lemon-ink">
          Uwzględniamy Twoje alergeny i ograniczenia tylko dla produktów, które znamy. To nie jest ocena bezpieczeństwa – sprawdź skład na opakowaniu.{" "}
          <button className="underline" onClick={onDiet}>Zmień</button>
        </p>
      )}
      {hasDietPrefs(diet) && ideas.length === 0 && <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-sm">Wszystkie pomysły na ten posiłek zawierają składniki, których unikasz. Użyj „Zjadłem coś innego” albo zmień ograniczenia.</p>}
      <div className="mt-4 flex flex-col gap-3">
        {ideas.map((idea, i) => (
          <section key={idea.id} className="rounded-2xl bg-canvas p-4">
            {idea.fav && <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-accent">{idea.fav === "meal" ? "Ulubiony posiłek" : "Z ulubionych produktów"}</div>}
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold">{idea.name}</h3>
              <span className="shrink-0 text-xs tabular-nums text-muted">≈ {idea.carb} g węgli{idea.protein > 0 ? ` · ${idea.protein} g białka` : ""}{idea.fat > 0 ? ` · ${idea.fat} g tł.` : ""}</span>
            </div>
            <ul className="mt-2 divide-y divide-hairline/70 text-sm">
              {idea.lines.map((l) => (
                <li key={l.food.id} className="flex justify-between gap-3 py-1.5"><span>{l.food.name}</span><span className="tabular-nums text-muted">{l.text}</span></li>
              ))}
            </ul>
            {(unknownOf.get(idea.id)?.length ?? 0) > 0 && <p className="mt-2 text-xs text-lemon-ink">Brak danych o alergenach: {unknownOf.get(idea.id)!.join(", ")}. Sprawdź skład.</p>}
            {!eaten && (
              <button onClick={() => onEat(idea)} className={`mt-3 w-full rounded-xl py-2.5 text-sm font-medium ${i === 0 ? "bw-grad" : "border border-hairline bg-card"}`}>Zjadłem to</button>
            )}
          </section>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowHidden(!showHidden)} aria-expanded={showHidden} className="text-sm text-accent">{showHidden ? "Ukryj" : "Pokaż"} ukryte pomysły ({hidden.length})</button>
          {showHidden && (
            <ul className="mt-2 flex flex-col gap-2">
              {hidden.map(({ idea, conflict }) => (
                <li key={idea.id} className="rounded-2xl border border-hairline px-4 py-3 text-sm">
                  <div className="font-medium text-muted">{idea.name}</div>
                  <div className="mt-0.5 text-xs text-muted">{conflict.join("; ")}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!eaten && <button onClick={onOther} className="mt-4 w-full rounded-xl py-3 text-sm text-accent">Zjadłem coś innego</button>}
      <p className="mt-2 text-[11px] text-muted">Gramy: surowe produkty tam, gdzie tak napisano; wartości orientacyjne (to propozycja, nie dokładne zapotrzebowanie).</p>
    </Sheet>
  );
}
