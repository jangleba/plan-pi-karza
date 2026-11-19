import type { Profile } from "../engine";
import { buildDayPlan, fmtTime, nextSlot, untilText } from "../engine/mealplan";
import { activitiesFor, asActivities, dayInfoFor } from "./day";
import { loadGoal, loadMeals } from "./store";

export interface FuelNow { title: string; time: string; when: string; carb: number }

/** Najbliższy niezjedzony posiłek z planu dnia (do skrótu na Starcie) albo null, gdy na dziś nic nie zostało. */
export function fuelNow(profile: Profile, iso: string, now: Date): FuelNow | null {
  const info = dayInfoFor(profile, iso);
  const plan = buildDayPlan({ day: info.kind, weightKg: profile.weightKg, goal: loadGoal(), activities: asActivities(activitiesFor(info, iso)) });
  const done = new Set(loadMeals().filter((m) => m.date === iso).map((m) => m.slot).filter((s): s is string => !!s));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { next } = nextSlot(plan.slots, done, nowMin);
  return next ? { title: next.title, time: fmtTime(next.at), when: untilText(next.at - nowMin), carb: next.carb } : null;
}
