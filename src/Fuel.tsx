import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { Group, LargeTitle, ListRow, MiniRing } from "./ui";
import { addDays, localISO } from "./engine";
import type { Goal, Profile } from "./engine";
import { matchBag } from "./engine/bag";
import { ideasWithFavorites } from "./engine/favorites";
import { avoidFor, filterIdeas, hasDietPrefs } from "./engine/allergens";
import { DietSheet } from "./fuel/Diet";
import { buildDayPlan, fmtTime, nextSlot, toMin, untilText, type ScaledIdea, type Slot } from "./engine/mealplan";
import { Around } from "./fuel/Around";
import { Bag } from "./fuel/Bag";
import { AddFood, type NewMeal } from "./fuel/AddFood";
import { FavoritesSheet } from "./fuel/Favorites";
import { GOAL_LABEL, GoalSheet } from "./fuel/Goal";
import { Journal } from "./fuel/Journal";
import { Shopping } from "./fuel/Shopping";
import { SlotSheet } from "./fuel/SlotSheet";
import { activitiesFor, asActivities, dayInfoFor, defaultStart } from "./fuel/day";
import { loadBag, loadDiet, loadFavs, loadGoal, loadMeals, loadWater, saveDiet, saveFavs, saveGoal, saveMeals, saveStart, saveWater, type Meal } from "./fuel/store";

type Sheetk = "add" | "slot" | "journal" | "shop" | "around" | "goal" | "bag" | "fav" | "diet";
const WATER_STEP = 250;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const nowHHMM = () => fmtTime(nowMin());
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function Fuel({ profile }: { profile: Profile }) {
  const date = localISO();
  const [sheet, setSheet] = useState<Sheetk | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [forSlot, setForSlot] = useState<string | undefined>(undefined);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  // odświeżanie „co teraz” co minutę
  useEffect(() => { const id = setInterval(refresh, 60_000); return () => clearInterval(id); }, []);

  const goal = loadGoal();
  const info = dayInfoFor(profile, date);
  const activities = activitiesFor(info, date);
  const actKey = activities.map((a) => `${a.kind}@${a.time}`).join(",");
  const plan = useMemo(() => buildDayPlan({ day: info.kind, weightKg: profile.weightKg, goal, activities: asActivities(activities) }), [info.kind, profile.weightKg, goal, actKey]);
  const allMeals = loadMeals();
  const meals = allMeals.filter((m) => m.date === date);
  const done = new Set(meals.map((m) => m.slot).filter((s): s is string => !!s));
  const eaten = (k: "carb" | "protein" | "fat") => Math.round(meals.reduce((a, m) => a + (m[k] ?? 0), 0));
  const water = loadWater(date);
  const { next, missed } = nextSlot(plan.slots, done, nowMin());
  const missedIds = new Set(missed.map((s) => s.id));
  const favs = loadFavs();
  const diet = loadDiet();
  const avoid = avoidFor(diet);
  // propozycje nigdy nie zawierają znanego konfliktu z alergenami/dietą użytkownika; brak danych o produkcie ≠ „bezpieczny”
  const ideasFor = (s: Slot) => filterIdeas(ideasWithFavorites(s, 0, favs, avoid), diet).shown.map((x) => x.idea);
  const nextIdeas = next ? ideasFor(next) : [];
  // torba meczowa: w dniu meczu i dzień wcześniej (wtedy się pakujemy)
  const matchDate = info.match ? date : info.kind === "pre-match" ? addDays(date, 1) : null;
  const matchPlan = matchDate ? (info.match ? plan : buildDayPlan({ day: "match", weightKg: profile.weightKg, goal, activities: [{ kind: "match", time: defaultStart("match", false) }] })) : null;
  const bag = matchPlan && matchDate ? matchBag(matchPlan, matchDate) : null;
  const bagTotal = bag ? bag.reduce((s, g) => s + g.items.length, 0) : 0;
  const bagDone = matchDate && bag ? bag.reduce((s, g) => s + g.items.filter((i) => loadBag(matchDate).includes(i.id)).length, 0) : 0;
  

  const addMeal = (m: NewMeal, slot?: string) => {
    saveMeals([...allMeals, { id: uid(), date, time: nowHHMM(), name: m.name, carb: m.carb, protein: m.protein, fat: m.fat, slot } satisfies Meal]);
    refresh();
  };
  const eatIdea = (slot: Slot, idea: ScaledIdea) => { addMeal({ name: idea.name, carb: idea.carb, protein: idea.protein, fat: idea.fat }, slot.id); setSheet(null); };
  const removeMeal = (id: string) => { saveMeals(allMeals.filter((m) => m.id !== id)); refresh(); };
  const undoSlot = (id: string) => { saveMeals(allMeals.filter((m) => !(m.date === date && m.slot === id))); refresh(); };
  const addWater = (ml: number) => { saveWater(date, water + ml); refresh(); };
  const slot = slotId ? plan.slots.find((s) => s.id === slotId) ?? null : null;
  const openSlot = (id: string) => { setSlotId(id); setSheet("slot"); };
  const litres = (ml: number) => (ml / 1000).toFixed(1).replace(".", ",");

  const sub = activities.length ? `${info.label} · ${activities.map((a) => a.time).join(" i ")}` : info.label;
  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <LargeTitle kind="fuel" title="Fuel" sub={sub} />

      {activities.length > 0 && (
        <div className="bw-rise mb-5 overflow-hidden rounded-2xl border border-hairline bg-card">
          {activities.map((a) => (
            <label key={a.key} className="flex items-center justify-between border-b border-hairline px-4 py-3 text-sm last:border-0">
              <span className="text-muted">{a.label}{a.kind === "match" && toMin(a.time) - nowMin() > 0 ? <span className="block text-xs text-accent">{untilText(toMin(a.time) - nowMin())}</span> : null}</span>
              <input type="time" value={a.time} onChange={(e) => { if (e.target.value) { saveStart(date, e.target.value, a.key); refresh(); } }} className="rounded-lg bg-canvas px-2 py-1 font-medium tabular-nums outline-none" />
            </label>
          ))}
        </div>
      )}

      <div className="bw-rise mb-6 flex justify-between px-1">
        <MiniRing small value={eaten("carb") / plan.carbTotal} label="Węgle" center={<>{eaten("carb")}<span className="text-[10px] text-muted">g</span></>} />
        <MiniRing small value={eaten("protein") / plan.proteinTotal} label="Białko" center={<>{eaten("protein")}<span className="text-[10px] text-muted">g</span></>} />
        <MiniRing small value={eaten("fat") / plan.fatTotal} label="Tłuszcz" center={<>{eaten("fat")}<span className="text-[10px] text-muted">g</span></>} />
        <MiniRing small value={water / plan.hydrationMl} label="Woda" center={<>{litres(water)}<span className="text-[10px] text-muted">l</span></>} />
      </div>
      <p className="-mt-3 mb-6 text-center text-xs text-muted">Orientacyjny cel dziś: {plan.carbTotal} g węgli · {plan.proteinTotal} g białka · {plan.fatTotal} g tłuszczu · {litres(plan.hydrationMl)} l wody</p>
      <p className="-mt-4 mb-6 text-center text-[11px] text-muted">Liczone z masy ciała i planu treningów – to nie jest indywidualne zapotrzebowanie.</p>

      {next ? (
        <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-muted">Teraz</span>
            <span className="text-sm font-medium text-accent">{untilText(next.at - nowMin())} · {fmtTime(next.at)}</span>
          </div>
          <h2 className="mt-1 text-xl font-semibold">{next.title}</h2>
          <p className="text-sm tabular-nums text-muted">ok. {next.carb} g węgli{next.protein > 0 ? ` · ${next.protein} g białka` : ""}{next.fat > 0 ? ` · ${next.fat} g tłuszczu` : ""}</p>
          {nextIdeas[0] && (
            <button onClick={() => openSlot(next.id)} className="mt-3 w-full rounded-2xl bg-canvas p-4 text-left">
              <span className="block text-[15px] font-medium">{nextIdeas[0].name}</span>
              <span className="mt-0.5 block text-sm text-muted">{nextIdeas[0].lines.map((l) => `${l.food.name.replace(/ \(.*\)/, "")} ${l.text}`).join(" · ")}</span>
            </button>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={() => nextIdeas[0] && eatIdea(next, nextIdeas[0])} className="flex-1 rounded-2xl bw-grad py-3.5 text-[15px] font-medium">Zjedzone</button>
            <button onClick={() => openSlot(next.id)} className="rounded-2xl border border-hairline bg-card px-5 py-3.5 text-[15px]">Inne pomysły</button>
          </div>
        </section>
      ) : (
        <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card p-5">
          <span className="text-xs uppercase tracking-wide text-muted">Teraz</span>
          <h2 className="mt-1 text-xl font-semibold">{plan.slots.length > 0 && plan.slots.every((s) => done.has(s.id)) ? "Plan dnia wykonany ✓" : "To już koniec posiłków z planu"}</h2>
          <p className="mt-1 text-sm text-muted">{eaten("carb") < plan.carbTotal * 0.85 ? `Do celu brakuje ok. ${plan.carbTotal - eaten("carb")} g węglowodanów – dodaj coś lekkiego, jeśli jesteś głodny.` : "Cel węglowodanów prawie osiągnięty."}</p>
        </section>
      )}

      <Group label="Plan dnia">
        {plan.slots.map((s, i) => {
          const isDone = done.has(s.id);
          const first = ideasFor(s)[0];
          return (
            <ListRow
              key={s.id}
              index={i}
              onTap={() => openSlot(s.id)}
              lead={<span className={`w-12 shrink-0 text-sm tabular-nums ${isDone ? "text-muted" : "font-medium"}`}>{fmtTime(s.at)}</span>}
              title={<span className={isDone ? "text-muted" : missedIds.has(s.id) ? "text-muted" : ""}>{s.title}</span>}
              sub={isDone ? "Zjedzone" : missedIds.has(s.id) ? "Pominięte" : first?.name}
              detail={isDone ? "✓" : s.carb > 0 ? `${s.carb} g` : undefined}
            />
          );
        })}
      </Group>

      <section className="bw-rise mb-6 flex items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3">
        <div>
          <div className="text-sm font-medium">Woda</div>
          <div className="text-xs text-muted tabular-nums">{litres(water)} / {litres(plan.hydrationMl)} l</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => addWater(-WATER_STEP)} disabled={water <= 0} aria-label="Cofnij szklankę" className="h-10 w-10 rounded-full border border-hairline bg-canvas text-lg disabled:opacity-40">−</button>
          <button onClick={() => addWater(WATER_STEP)} className="rounded-full bw-grad px-4 text-sm font-medium">+ szklanka</button>
        </div>
      </section>

      {bag && (
        <button onClick={() => setSheet("bag")} className="bw-rise mb-6 flex w-full items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3 text-left">
          <span>
            <span className="block text-sm font-medium">Torba meczowa{info.match ? "" : " – na jutro"}</span>
            <span className="block text-xs tabular-nums text-muted">{bagDone} z {bagTotal} spakowane</span>
          </span>
          <span className="text-accent">›</span>
        </button>
      )}

      <button onClick={() => { setForSlot(undefined); setSheet("add"); }} className="bw-rise mb-6 w-full rounded-2xl bw-grad py-4 text-base font-medium">Dodaj jedzenie</button>

      <Group>
        <ListRow index={1} title="Dziennik" detail={`${meals.length} ${meals.length === 1 ? "pozycja" : "pozycji"}`} onTap={() => setSheet("journal")} />
        <ListRow index={2} title="Lista zakupów" sub="Z planu na kolejne dni" onTap={() => setSheet("shop")} />
        <ListRow index={3} title="Ulubione i źródła" sub={favs.foods.length + favs.meals.length > 0 ? `${favs.foods.length} produktów · ${favs.meals.length} posiłków` : "Białko, węgle, tłuszcze – i Twoje ulubione"} onTap={() => setSheet("fav")} />
        <ListRow index={4} title="Przed i po wysiłku" sub="Co zjeść o dowolnej porze" onTap={() => setSheet("around")} />
        <ListRow index={5} title="Cel żywieniowy" detail={GOAL_LABEL[goal]} onTap={() => setSheet("goal")} />
        <ListRow index={6} title="Alergeny i ograniczenia" detail={hasDietPrefs(diet) ? "ustawione" : undefined} sub="Pomysły z unikanymi składnikami są ukrywane" onTap={() => setSheet("diet")} />
      </Group>
      <p className="px-1 text-xs text-muted">Liczby UEFA dotyczą meczu; podział na sesje i posiłki jest orientacyjny. To nie jest porada dietetyczna ani ocena bezpieczeństwa produktów (alergie – sprawdzaj skład na etykiecie). Dane produktów: USDA FoodData Central, Open Food Facts.</p>

      {sheet === "add" && <AddFood onAdd={(m) => { addMeal(m, forSlot); setSheet(null); }} onClose={() => setSheet(null)} />}
      {sheet === "slot" && slot && (
        <SlotSheet slot={slot} dayIndex={0} favs={favs} diet={diet} onDiet={() => setSheet("diet")} eaten={done.has(slot.id)} onEat={(idea) => eatIdea(slot, idea)} onOther={() => { setForSlot(slot.id); setSheet("add"); }} onUndo={() => undoSlot(slot.id)} onClose={() => setSheet(null)} />
      )}
      {sheet === "journal" && <Journal meals={meals} onRemove={removeMeal} onClose={() => setSheet(null)} />}
      {sheet === "shop" && <Shopping profile={profile} goal={goal} today={date} onClose={() => setSheet(null)} />}
      {sheet === "around" && <Sheet title="Przed i po wysiłku" onClose={() => setSheet(null)}><Around profile={profile} /></Sheet>}
      {sheet === "fav" && <FavoritesSheet favs={favs} onChange={(f) => { saveFavs(f); refresh(); }} onClose={() => setSheet(null)} />}
      {sheet === "bag" && bag && matchDate && <Bag groups={bag} date={matchDate} onChange={refresh} onClose={() => setSheet(null)} />}
      {sheet === "diet" && <DietSheet prefs={diet} onChange={(d) => { saveDiet(d); refresh(); }} onClose={() => setSheet(null)} />}
      {sheet === "goal" && <GoalSheet goal={goal} onPick={(g: Goal) => { saveGoal(g); setSheet(null); refresh(); }} onClose={() => setSheet(null)} />}
    </main>
  );
}

