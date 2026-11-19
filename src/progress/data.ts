import { addDays, planForProfile, weekStartOf } from "../engine";
import type { Profile } from "../engine";
import { buildDayPlan } from "../engine/mealplan";
import type { NutritionDay, PlannedDay } from "../engine";
import { activitiesFor, asActivities, dayInfoFor } from "../fuel/day";
import { loadGoal, loadMeals, loadWater } from "../fuel/store";

/** Zaplanowane sesje indywidualne z ostatnich `weeks` tygodni (z bieżącym) wg dzisiejszych ustawień profilu. */
export function plannedDays(profile: Profile, today: string, weeks = 12): PlannedDay[] {
  const out: PlannedDay[] = [];
  const first = weekStartOf(addDays(today, -7 * (weeks - 1)));
  for (let w = first; w <= weekStartOf(today); w = addDays(w, 7)) {
    for (const d of planForProfile(profile, w).days) if (d.session && !d.isOff && !d.isMatch) out.push({ date: d.date, kind: d.session.kind });
  }
  return out;
}

/** Odżywianie z ostatnich `n` dni (włącznie z dzisiaj) względem planu dnia z Fuel. */
export function nutritionDays(profile: Profile, today: string, n = 14): NutritionDay[] {
  const meals = loadMeals();
  const goal = loadGoal();
  const out: NutritionDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const info = dayInfoFor(profile, date);
    const plan = buildDayPlan({ day: info.kind, weightKg: profile.weightKg, goal, activities: asActivities(activitiesFor(info, date)) });
    const ms = meals.filter((m) => m.date === date);
    out.push({
      date, logged: ms.length > 0,
      carb: ms.reduce((s, m) => s + m.carb, 0), protein: ms.reduce((s, m) => s + m.protein, 0), waterMl: loadWater(date),
      target: { carb: plan.carbTotal, protein: plan.proteinTotal, waterMl: plan.hydrationMl },
    });
  }
  return out;
}
