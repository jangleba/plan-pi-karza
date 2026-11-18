// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WeeklyPlanningCoverage, WeeklyPlanningSettings } from "./WeeklyPlanningSettings";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { gymAthlete } from "@/lib/loadwise/engineV2/testFixtures";
import type { WeeklyPlanningPreferences } from "@/lib/loadwise/weeklyPlanningPreferences";

const profile = { ...gymAthlete, goal: "endurance" as const };
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("offers an automatic sprint plan without a fixed sprint count selector", async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(<WeeklyPlanningSettings profile={profile} value={null} onChange={onChange} />),
  );
  expect(host.querySelector('select[aria-label="Sprinty na tydzień"]')).toBeNull();
  expect(host.querySelector('[aria-label="Liczba sesji sprintu"]')?.textContent).toContain(
    "Sprint automatycznie",
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === "2 siłowe · 1 bieg · sprint automatycznie")!
      .click(),
  );
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    weeklyTargets: { strength: 2, speed: "auto", endurance: 1 },
    fillRestDays: true,
    minFullRestDays: 1,
  });
});

it("does not revive an old two-sprint quota when editing another weekly choice", async () => {
  const value: WeeklyPlanningPreferences = {
    weeklyTargets: { strength: 2, speed: 2, endurance: 1 },
    minFullRestDays: 1,
    fillRestDays: true,
  };
  const onChange = vi.fn();
  await act(async () =>
    root.render(<WeeklyPlanningSettings profile={profile} value={value} onChange={onChange} />),
  );
  const runs = host.querySelector<HTMLSelectElement>('[aria-label="Biegi na tydzień"]')!;
  await act(async () => {
    runs.value = "2";
    runs.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    weeklyTargets: { strength: 2, speed: "auto", endurance: 2 },
    minFullRestDays: 1,
    fillRestDays: true,
  });
  expect(value.weeklyTargets.speed).toBe(2);
  expect(value.weeklyTargets.endurance).toBe(1);
});

it("shows the actual zero sprint count without inventing a missing sprint quota", async () => {
  const preferences: WeeklyPlanningPreferences = {
    weeklyTargets: { strength: 2, speed: "auto", endurance: 1 },
    minFullRestDays: 1,
    fillRestDays: false,
  };
  const result = generateTrainingPlan(profile, {
    startDate: "2026-11-16",
    weeks: 1,
    minutesPerSession: 90,
    weeklyTargets: preferences.weeklyTargets,
    minFullRestDays: preferences.minFullRestDays,
  });
  const plan = result.plan.map((day) =>
    day.engineV2?.roles.includes("speed")
      ? { ...day, dayType: "rest" as const, engineV2: undefined, secondSession: null }
      : day,
  );
  await act(async () =>
    root.render(<WeeklyPlanningCoverage plan={plan} preferences={preferences} />),
  );
  const sprint = [...host.querySelectorAll("tbody tr")].find(
    (row) => row.querySelector("th")?.textContent === "Sprint",
  )!;
  expect(sprint.querySelector("td")?.textContent).toBe("0 · automatycznie");
  expect(sprint.hasAttribute("data-unmet")).toBe(false);
  expect(host.textContent).not.toContain("Nie wszystkie cele się mieszczą");
  expect(host.querySelector("summary")?.textContent).not.toContain("ograniczenia");
});
