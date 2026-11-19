import { Sheet } from "../Sheet";
import { ideasWithFavorites, type Favorites } from "../engine/favorites";
import { fmtTime, type ScaledIdea, type Slot } from "../engine/mealplan";

/** Karta posiłku z planu: cel w gramach i kilka pomysłów z gramaturą; jedno dotknięcie = zjedzone. */
export function SlotSheet({ slot, dayIndex, favs, eaten, onEat, onOther, onUndo, onClose }: {
  slot: Slot; dayIndex: number; favs: Favorites; eaten: boolean; onEat: (idea: ScaledIdea) => void; onOther: () => void; onUndo: () => void; onClose: () => void;
}) {
  const ideas = ideasWithFavorites(slot, dayIndex, favs);
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
            {!eaten && (
              <button onClick={() => onEat(idea)} className={`mt-3 w-full rounded-xl py-2.5 text-sm font-medium ${i === 0 ? "bw-grad" : "border border-hairline bg-card"}`}>Zjadłem to</button>
            )}
          </section>
        ))}
      </div>
      {!eaten && <button onClick={onOther} className="mt-4 w-full rounded-xl py-3 text-sm text-accent">Zjadłem coś innego</button>}
      <p className="mt-2 text-[11px] text-muted">Gramy: surowe produkty tam, gdzie tak napisano; wartości orientacyjne.</p>
    </Sheet>
  );
}
