// @vitest-environment jsdom
// Fuel day model on the screen: "what now" first, ranges below, questions only when missing.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FuelWorkspace, type FuelDaySource } from "./FuelWorkspace";
import { FOOD_BY_ID } from "@/lib/fuel/catalog";
import { fuelStorageKey, localDate, planFuelContexts, readFuelData } from "@/lib/fuel/experience";
import { EMPTY_FOOD_SAFETY } from "@/lib/fuel/practical";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));

let host: HTMLDivElement, root: Root;
const now = new Date("2026-11-12T10:00:00").getTime();
const today = localDate(now);
const matchDay = sessionFixture({
  date: today,
  dbId: "m1",
  dayType: "match",
  title: "Mecz ligowy",
  durationMin: 0,
  scheduledStartTime: "15:00",
});
const source = (o: Partial<FuelDaySource> = {}): FuelDaySource => ({
  plan: [matchDay],
  completions: {},
  age: 22,
  weightKg: null,
  healthConsent: true,
  foodSafety: EMPTY_FOOD_SAFETY,
  onSaveFoodSafety: vi.fn(async () => {}),
  onSaveWeight: vi.fn(async () => {}),
  ...o,
});
const render = async (day: FuelDaySource) =>
  act(async () =>
    root.render(
      <FuelWorkspace
        userId="u"
        contexts={planFuelContexts(day.plan, today, day.completions)}
        day={day}
      />,
    ),
  );
const button = (label: string) => {
  const b = [...document.body.querySelectorAll("button")].find(
    (x) => x.textContent?.trim() === label,
  );
  if (!b) throw new Error("Missing: " + label);
  return b;
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(now);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Fuel day on the screen", () => {
  it("match day: the plan follows the kick-off from the calendar, what-now card stays first", async () => {
    await render(source());
    const main = host.querySelector(".fuel-v4-main")!;
    const order = [...main.children].map((c) => c.className);
    expect(order.findIndex((c) => c.includes("fuel-now-card"))).toBeLessThan(
      order.findIndex((c) => c.includes("fuel-match-plan")),
    );
    expect(order.findIndex((c) => c.includes("fuel-match-plan"))).toBeLessThan(
      order.findIndex((c) => c.includes("fuel-day-details")),
    );
    const now = host.querySelector('.fuel-match-steps [aria-current="step"]');
    // 10:00, kick-off 15:00: the meal window (11:30–12:30) is next.
    expect(host.querySelector(".fuel-match-steps li")?.textContent).toContain("11:30");
    expect(now).toBeNull();
    expect(host.textContent).toContain("Dzień meczowy");
  });

  it("without body mass: portions, clearly limited precision, never 'zostało X kcal'", async () => {
    await render(source());
    expect(host.querySelector(".fuel-day-badge")?.textContent).toBe("Ograniczona precyzja");
    expect(host.querySelector(".fuel-day-ranges")).toBeNull();
    expect(host.textContent).not.toMatch(/zostało|pozostało/i);
    expect(host.textContent).toContain("Dodaj masę ciała");
  });

  it("with body mass (16+): ranges in grams and kcal, still no remaining-calories counter", async () => {
    await render(source({ weightKg: 70 }));
    expect(host.querySelector(".fuel-day-ranges")?.textContent).toContain("kcal");
    expect(host.querySelector(".fuel-day-ranges")?.textContent).toContain("420–560 g");
    expect(host.textContent).not.toMatch(/zostało|pozostało/i);
  });

  it("minor account: no deficit wording, under 16 no grams and no body-mass prompt", async () => {
    await render(source({ age: 15, weightKg: 50, onSaveWeight: undefined }));
    expect(host.querySelector(".fuel-day-ranges")).toBeNull();
    expect(host.textContent).not.toContain("Dodaj masę ciała");
    expect(host.textContent).toContain("bez deficytu");
    expect(host.textContent).not.toMatch(/schudn|deficyt kaloryczny|−\s?\d+ kcal|-\d+ kcal/i);
  });

  it("asks only what changes the advice, and an answer removes the question", async () => {
    await render(source());
    const text = () => host.querySelector(".fuel-questions")?.textContent ?? "";
    expect(text()).toContain("Ile ruszasz się poza treningiem?");
    expect(text()).toContain("Jak znosisz jedzenie przed wysiłkiem?");
    expect(text()).toContain("Ile dziś zagrasz?");
    expect(text()).toContain("Kiedy był ostatni posiłek?");
    await act(async () => button("Raczej ławka").click());
    expect(text()).not.toContain("Ile dziś zagrasz?");
    expect(readFuelData(localStorage, "u", now).dayAnswers?.[today]?.participation).toBe("bench");
    expect(host.textContent).toContain("Rezerwowy też może wejść");
    await act(async () => button("Często ciężko w żołądku").click());
    expect(readFuelData(localStorage, "u", now).preferences.preExerciseTolerance).toBe("sensitive");
    expect(host.querySelector(".fuel-match-steps li")?.textContent).toContain("11:00");
  });

  it("a rest day without effort does not ask about tolerance or the match", async () => {
    await render(source({ plan: [] }));
    const text = host.querySelector(".fuel-questions")?.textContent ?? "";
    expect(text).not.toContain("Ile dziś zagrasz?");
    expect(text).not.toContain("Kiedy był ostatni posiłek?");
  });

  it("profile allergy: proposals avoid it; the notice says no conflict is not a guarantee", async () => {
    await render(
      source({
        foodSafety: {
          status: "has_allergies",
          allergies: ["mleko"],
          intolerances: [],
          exclusions: [],
        },
      }),
    );
    const hero = host.querySelector(".fuel-now-card");
    expect(hero).not.toBeNull();
    const portions = [...host.querySelectorAll(".fuel-v4-ingredient-change")].map((b) =>
      b.getAttribute("aria-label"),
    );
    const milk = Object.values(FOOD_BY_ID).filter((f) => f.allergens.includes("mleko"));
    for (const food of milk) expect(portions).not.toContain(`Zmień ${food.label}`);
    expect(host.textContent).toContain("Pomijam: mleko");
    expect(host.textContent).toContain("nie gwarantuje bezpieczeństwa");
  });

  it("allergy status not confirmed is shown as unknown, not as safe", async () => {
    await render(source());
    expect(host.textContent).toContain("Alergie: nie potwierdzono");
    expect(localStorage.getItem(fuelStorageKey("u")) ?? "").not.toContain("mleko");
  });
});
