import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { Group, LargeTitle, ListRow, MiniRing } from "./ui";
import { localISO } from "./engine";
import type { Goal, Profile } from "./engine";
import { buildDayPlan, fmtTime, ideasFor, nextSlot, untilText, type ScaledIdea, type Slot } from "./engine/mealplan";
import { Around } from "./fuel/Around";
import { AddFood, type NewMeal } from "./fuel/AddFood";
import { GOAL_LABEL, GoalSheet } from "./fuel/Goal";
import { Journal } from "./fuel/Journal";
import { Shopping } from "./fuel/Shopping";
import { SlotSheet } from "./fuel/SlotSheet";
import { activityFor, dayInfoFor } from "./fuel/day";
import { loadGoal, loadMeals, loadWater, saveGoal, saveMeals, saveStart, saveWater, type Meal } from "./fuel/store";

type Sheetk = "add" | "slot" | "journal" | "shop" | "around" | "goal";
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
  const activity = activityFor(info, date);
  const plan = useMemo(() => buildDayPlan({ day: info.kind, weightKg: profile.weightKg, goal, activity }), [info.kind, profile.weightKg, goal, activity?.kind, activity?.time]);
  const allMeals = loadMeals();
  const meals = allMeals.filter((m) => m.date === date);
  const done = new Set(meals.map((m) => m.slot).filter((s): s is string => !!s));
  const eaten = (k: "carb" | "protein") => Math.round(meals.reduce((a, m) => a + m[k], 0));
  const water = loadWater(date);
  const { next, missed } = nextSlot(plan.slots, done, nowMin());
  const missedIds = new Set(missed.map((s) => s.id));
  const nextIdeas = next ? ideasFor(next, 0) : [];

  const addMeal = (m: NewMeal, slot?: string) => {
    saveMeals([...allMeals, { id: uid(), date, time: nowHHMM(), name: m.name, carb: m.carb, protein: m.protein, slot } satisfies Meal]);
    refresh();
  };
  const eatIdea = (slot: Slot, idea: ScaledIdea) => { addMeal({ name: idea.name, carb: idea.carb, protein: idea.protein }, slot.id); setSheet(null); };
  const removeMeal = (id: string) => { saveMeals(allMeals.filter((m) => m.id !== id)); refresh(); };
  const undoSlot = (id: string) => { saveMeals(allMeals.filter((m) => !(m.date === date && m.slot === id))); refresh(); };
  const addWater = (ml: number) => { saveWater(date, water + ml); refresh(); };
  const slot = slotId ? plan.slots.find((s) => s.id === slotId) ?? null : null;
  const openSlot = (id: string) => { setSlotId(id); setSheet("slot"); };
  const litres = (ml: number) => (ml / 1000).toFixed(1).replace(".", ",");

  const sub = activity ? `${info.label} · ${activity.time}` : info.label;
  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <LargeTitle kind="fuel" title="Fuel" sub={sub} />

      {activity && (
        <label className="bw-rise mb-5 flex items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3 text-sm">
          <span className="text-muted">{activity.kind === "match" ? "Początek meczu" : "Początek treningu"}</span>
          <input type="time" value={activity.time} onChange={(e) => { if (e.target.value) { saveStart(date, e.target.value); refresh(); } }} className="rounded-lg bg-canvas px-2 py-1 font-medium tabular-nums outline-none" />
        </label>
      )}

      <div className="bw-rise mb-6 flex justify-between px-2">
        <MiniRing value={eaten("carb") / plan.carbTotal} label="Węglowodany" center={<>{eaten("carb")}<span className="text-xs text-muted">g</span></>} />
        <MiniRing value={eaten("protein") / plan.proteinTotal} label="Białko" center={<>{eaten("protein")}<span className="text-xs text-muted">g</span></>} />
        <MiniRing value={water / plan.hydrationMl} label="Woda" center={<>{litres(water)}<span className="text-xs text-muted">l</span></>} />
      </div>
      <p className="-mt-3 mb-6 text-center text-xs text-muted">Cel dziś: {plan.carbTotal} g węglowodanów · {plan.proteinTotal} g białka · {litres(plan.hydrationMl)} l wody</p>

      {next ? (
        <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-muted">Teraz</span>
            <span className="text-sm font-medium text-accent">{untilText(next.at - nowMin())} · {fmtTime(next.at)}</span>
          </div>
          <h2 className="mt-1 text-xl font-semibold">{next.title}</h2>
          <p className="text-sm tabular-nums text-muted">ok. {next.carb} g węgli{next.protein > 0 ? ` · ${next.protein} g białka` : ""}</p>
          {nextIdeas[0] && (
            <button onClick={() => openSlot(next.id)} className="mt-3 w-full rounded-2xl bg-canvas p-4 text-left">
              <span className="block text-[15px] font-medium">{nextIdeas[0].name}</span>
              <span className="mt-0.5 block text-sm text-muted">{nextIdeas[0].lines.map((l) => `${l.food.name.replace(/ \(.*\)/, "")} ${l.text}`).join(" · ")}</span>
            </button>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={() => nextIdeas[0] && eatIdea(next, nextIdeas[0])} className="flex-1 rounded-2xl bw-grad py-3.5 text-[15px] font-medium text-white">Zjedzone</button>
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
          const first = ideasFor(s, 0)[0];
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
          <button onClick={() => addWater(WATER_STEP)} className="rounded-full bw-grad px-4 text-sm font-medium text-white">+ szklanka</button>
        </div>
      </section>

      <button onClick={() => { setForSlot(undefined); setSheet("add"); }} className="bw-rise mb-6 w-full rounded-2xl bw-grad py-4 text-base font-medium text-white">Dodaj jedzenie</button>

      <Group>
        <ListRow index={1} title="Dziennik" detail={`${meals.length} ${meals.length === 1 ? "pozycja" : "pozycji"}`} onTap={() => setSheet("journal")} />
        <ListRow index={2} title="Lista zakupów" sub="Z planu na kolejne dni" onTap={() => setSheet("shop")} />
        <ListRow index={3} title="Przed i po wysiłku" sub="Co zjeść o dowolnej porze" onTap={() => setSheet("around")} />
        <ListRow index={4} title="Cel żywieniowy" detail={GOAL_LABEL[goal]} onTap={() => setSheet("goal")} />
      </Group>
      <p className="px-1 text-xs text-muted">Liczby UEFA dotyczą meczu; podział na sesje i posiłki jest orientacyjny. To nie jest porada dietetyczna.</p>

      {sheet === "add" && <AddFood onAdd={(m) => { addMeal(m, forSlot); setSheet(null); }} onClose={() => setSheet(null)} />}
      {sheet === "slot" && slot && (
        <SlotSheet slot={slot} dayIndex={0} eaten={done.has(slot.id)} onEat={(idea) => eatIdea(slot, idea)} onOther={() => { setForSlot(slot.id); setSheet("add"); }} onUndo={() => undoSlot(slot.id)} onClose={() => setSheet(null)} />
      )}
      {sheet === "journal" && <Journal meals={meals} onRemove={removeMeal} onClose={() => setSheet(null)} />}
      {sheet === "shop" && <Shopping profile={profile} goal={goal} today={date} onClose={() => setSheet(null)} />}
      {sheet === "around" && <Sheet title="Przed i po wysiłku" onClose={() => setSheet(null)}><Around profile={profile} /></Sheet>}
      {sheet === "goal" && <GoalSheet goal={goal} onPick={(g: Goal) => { saveGoal(g); setSheet(null); refresh(); }} onClose={() => setSheet(null)} />}
    </main>
  );
}

