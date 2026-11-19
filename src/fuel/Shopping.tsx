import { useMemo, useState } from "react";
import { Sheet } from "../Sheet";
import { addDays } from "../engine";
import type { Goal, Profile } from "../engine";
import { buildDayPlan, shoppingList } from "../engine/mealplan";
import { ideasWithFavorites } from "../engine/favorites";
import { ShopTips } from "./Around";
import { activitiesFor, asActivities, dayInfoFor } from "./day";
import { loadChecked, loadFavs, saveChecked } from "./store";

const GROUP: Record<string, string> = { carb: "Zboża i skrobia", protein: "Białko", dairy: "Nabiał", fat: "Tłuszcze (oliwa, orzechy, awokado)", fruit: "Owoce", veg: "Warzywa", other: "Inne" };

/** Lista zakupów z planu na kolejne dni (pierwsze pomysły każdego posiłku, zsumowane). */
export function Shopping({ profile, goal, today, onClose }: { profile: Profile; goal: Goal; today: string; onClose: () => void }) {
  const [days, setDays] = useState<3 | 7>(3);
  const [checked, setChecked] = useState<string[]>(loadChecked);
  const [tips, setTips] = useState(false);
  const list = useMemo(() => {
    const plans = Array.from({ length: days }, (_, i) => {
      const iso = addDays(today, i);
      const info = dayInfoFor(profile, iso);
      return buildDayPlan({ day: info.kind, weightKg: profile.weightKg, goal, activities: asActivities(activitiesFor(info, iso)) });
    });
    const favs = loadFavs();
    return shoppingList(plans, (slot, di) => ideasWithFavorites(slot, di, favs)[0]);
  }, [days, profile, goal, today]);

  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    setChecked(next); saveChecked(next);
  };
  const groups = [...new Set(list.map((l) => l.group))];
  const left = list.filter((l) => !checked.includes(l.foodId)).length;
  return (
    <Sheet title="Lista zakupów" onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1">
        {([3, 7] as const).map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-xl py-1.5 text-sm ${days === d ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{d === 3 ? "3 dni" : "Tydzień"}</button>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g} className="mb-4">
          <h3 className="mb-1 px-1 text-xs uppercase tracking-wide text-muted">{GROUP[g]}</h3>
          <div className="rounded-2xl bg-canvas px-4">
            {list.filter((l) => l.group === g).map((l) => {
              const on = checked.includes(l.foodId);
              return (
                <button key={l.foodId} onClick={() => toggle(l.foodId)} className="flex w-full items-center gap-3 border-b border-hairline/70 py-3 text-left last:border-0">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${on ? "bw-grad border-transparent" : "border-hairline bg-card"}`}>{on ? "✓" : ""}</span>
                  <span className={`flex-1 text-[15px] ${on ? "text-muted line-through" : ""}`}>{l.name}</span>
                  <span className="text-sm tabular-nums text-muted">{l.text}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted">{left === 0 ? "Wszystko w koszyku." : `Do kupienia: ${left}.`} Ilości z pierwszych pomysłów na każdy posiłek (orientacyjnie, surowe produkty).</p>
      <div className="mt-3 flex gap-4 text-sm">
        <button onClick={() => { setChecked([]); saveChecked([]); }} className="text-accent">Wyczyść zaznaczenia</button>
        <button onClick={() => setTips(!tips)} className="text-accent">{tips ? "Ukryj podpowiedzi" : "Czego unikać"}</button>
      </div>
      {tips && <div className="mt-4"><ShopTips /></div>}
    </Sheet>
  );
}
