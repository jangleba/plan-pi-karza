import { FOOD_BY_ID, mealNutrition } from "./catalog";
import {
  fuelMoment,
  localDate,
  minutesToFuelStart,
  type FuelContext,
  type FuelDeviceData,
  type FuelEntry,
  type FuelTiming,
} from "./experience";
import type { SessionKind } from "./types";

export function foodToleranceIds(
  entries: FuelEntry[],
  timing: FuelTiming,
  now: number,
  kind?: SessionKind,
): string[] {
  const minutes = minutesToFuelStart(timing, now);
  const window = (m: number | null | undefined) =>
    m == null ? "unknown" : m <= 60 ? "close" : "earlier";
  const counts = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (
      entry.status !== "eaten" ||
      entry.feedback !== "heavy" ||
      entry.phase !== timing.phase ||
      entry.eatenAt === null ||
      entry.eatenAt < now - 30 * 86_400_000 ||
      entry.eatenAt > now
    )
      continue;
    if (kind && entry.sessionKind !== kind) continue;
    if (
      timing.phase === "before" &&
      (minutes === null || window(entry.minutesBefore) !== window(minutes))
    )
      continue;
    const days = counts.get(entry.recipeId) ?? new Set<string>();
    days.add(localDate(entry.eatenAt));
    counts.set(entry.recipeId, days);
  }
  return [...counts].filter(([, days]) => days.size >= 2).map(([id]) => id);
}

/** Ranking hints, never a calculation of daily needs or a diagnosis of tolerance. */
export function sessionRecipeScore(
  context: FuelContext,
  timing: FuelTiming,
  lines: FuelEntry["lines"],
): number {
  const n = mealNutrition(lines);
  if (!n) return 0;
  const sustained =
    ["match", "endurance"].includes(context.kind) && (context.durationMin ?? 0) >= 60;
  if (timing.phase === "after")
    return (n.protein >= 15 ? 2 : 0) + (sustained && n.carbs >= 50 ? 2 : 0);
  if (timing.phase === "training")
    return n.fat <= 5 &&
      n.fiber <= 4 &&
      lines.every((l) => ["carb", "fruit", "fluid"].includes(FOOD_BY_ID[l.foodId]?.role))
      ? 4
      : 0;
  if (sustained && timing.phase === "before") return n.carbs >= 60 ? 3 : 0;
  return context.kind === "strength" && timing.phase === "ordinary" && n.protein >= 15 ? 1 : 0;
}

export function fuelDayGuide(
  context: FuelContext,
  timing: FuelTiming,
  now: number,
  data: FuelDeviceData,
  nextSession?: FuelContext | null,
) {
  const minutes = minutesToFuelStart(timing, now);
  const recent = data.entries.filter(
    (e) =>
      e.status === "eaten" &&
      e.eatenAt !== null &&
      localDate(e.eatenAt) === localDate(now) &&
      e.eatenAt <= now,
  );
  const last = [...recent].sort((a, b) => (b.eatenAt ?? 0) - (a.eatenAt ?? 0))[0];
  const drinkMl = (data.drinks ?? [])
    .filter(
      (d) => d.contextKey === context.key && localDate(d.at) === localDate(now) && d.at <= now,
    )
    .reduce((sum, d) => sum + d.ml, 0);
  const eaten = last
    ? `${last.title} · ${new Date(last.eatenAt!).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}${last.fraction < 1 ? ` · ${Math.round(last.fraction * 100)}% zestawu` : ""}`
    : "Nie masz dziś wpisanego posiłku. Możesz dodać to, co już jadłeś.";
  const during = timing.phase === "training";
  return {
    eaten,
    drinkMl,
    last,
    reason: during
      ? "W trakcie wysiłku wybieraj tylko sprawdzone, dobrze tolerowane produkty, gdy masz możliwość je zjeść."
      : timing.phase === "after"
        ? `${nextSession ? "Masz jeszcze kolejną sesję. " : ""}Po wysiłku wybierz tolerowane źródło węglowodanów i białka.`
        : timing.phase === "ordinary"
          ? "Zwykły posiłek — dopasuj porcję do apetytu i wcześniejszego jedzenia."
          : minutes === null
            ? "Ustaw czas. Bez niego pokazuję ogólne propozycje."
            : minutes <= 60
              ? "Blisko wysiłku: prosty zestaw i porcja, którą dobrze tolerujesz."
              : `${context.kind === "match" ? "Przed meczem" : "Przed sesją"}${context.durationMin ? ` · ${context.durationMin} min wysiłku` : ""}. Dopasuj porcję do apetytu i wcześniejszego jedzenia.`,
    steps: [
      {
        title: "Teraz",
        text: during
          ? "Wysiłek trwa · jedzenie i napój tylko w dogodnej przerwie"
          : timing.phase === "after"
            ? "Wybierz posiłek po sesji"
            : timing.phase === "before" && timing.startsAt !== null
              ? `Start ${new Date(timing.startsAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} · sprawdź propozycję i zapisz faktyczną porcję`
              : "Sprawdź propozycję i zapisz faktyczną porcję",
      },
      { title: "Zabierz", text: "Wybrany zestaw, napój i odpowiednie przechowywanie" },
      {
        title: "Po sesji",
        text: nextSession
          ? `Uwzględnij kolejną sesję: ${nextSession.title}`
          : "Zapisz jedzenie i oceń, jak je tolerowałeś",
      },
    ],
    moment: fuelMoment(timing),
  };
}
