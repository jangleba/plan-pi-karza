/** Browser-only QA entry; no production route imports it. Uses isolated local data. */
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { FuelWorkspace } from "../FuelWorkspace";
import { emptyFuelData, fuelStorageKey, localDate, manualFuelContext } from "@/lib/fuel/experience";
import { createRecipeEntry, practicalRecipes, relativeFuelTiming } from "@/lib/fuel/practical";
import { evaluateStoreProduct } from "@/lib/fuel/storeCheck";
import "@/styles/fuel-v3.css";
import "@/styles/fuel-v4.css";
const now = Date.now();
const date = localDate(now);
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
const context = {
  ...manualFuelContext(date, "match", 90, "high"),
  key: date + ":qa-match:1",
  fromPlan: true,
};
const future = {
  ...context,
  date: localDate(tomorrow.getTime()),
  key: localDate(tomorrow.getTime()) + ":qa-match:1",
};
const mode = new URLSearchParams(location.search).get("mode");
const data = emptyFuelData();
data.timings[context.key] = relativeFuelTiming(120, now)!;
const recipe = practicalRecipes({ context, timing: data.timings[context.key], now, data })[0];
if (mode === "adjusted") {
  const entry = createRecipeEntry(recipe, context.key, "selected", now, "adjusted");
  entry.lines = entry.lines.map((l) => ({ ...l, grams: l.grams * 2 }));
  data.entries = [entry];
}
if (mode === "history")
  data.entries = [
    {
      ...createRecipeEntry(recipe, context.key, "eaten", now - 3600_000, "eaten"),
      phase: "before",
      sessionKind: "match",
      minutesBefore: 180,
    },
  ];
localStorage.setItem(fuelStorageKey("fuel-qa"), JSON.stringify(data));
Object.assign(window, {
  __fuelQA: {
    contextKey: context.key,
    tomorrowKey: future.key,
    baseLines: recipe.lines,
    read: () => JSON.parse(localStorage.getItem(fuelStorageKey("fuel-qa"))!),
    allergenVerdict: evaluateStoreProduct({
      product: {
        name: "Mix",
        allergens: ["en:crustaceans"],
        source: "openfoodfacts",
        nutriments: { carbohydrates100g: 40, protein100g: 15 },
      },
      restrictions: ["krewetki"],
      moment: "after",
      load: "high",
    }).label,
  },
});
createRoot(document.getElementById("root")!).render(
  <div className="app-shell">
    <header className="fuel-qa-banner">Fuel · dane kontrolne interfejsu</header>
    <FuelWorkspace
      userId="fuel-qa"
      contexts={[
        mode === "completed" ? { ...context, completed: true, endedAt: now - 60_000 } : context,
      ]}
      tomorrowContext={future}
    />
    <Toaster />
  </div>,
);
