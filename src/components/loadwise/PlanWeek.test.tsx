// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanWeek, planWeeks, plDate, plRange } from "./PlanWeek";
import { sessionFixture } from "./session/testFixtures";
import type { SessionDay } from "@/lib/loadwise/types";

const day = (date: string, o: Partial<SessionDay> = {}) =>
  sessionFixture({ date, dbId: `s-${date}`, title: "Siła: całe ciało A", durationMin: 50, ...o });
const rest = (date: string) =>
  sessionFixture({ date, dbId: undefined, dayType: "rest", title: "Odpoczynek", durationMin: 0 });
const plan = [
  day("2026-11-02"),
  rest("2026-11-03"),
  day("2026-11-04"),
  rest("2026-11-05"),
  rest("2026-11-06"),
  rest("2026-11-07"),
  rest("2026-11-08"),
  day("2026-11-09"),
];
let host: HTMLDivElement, root: Root;
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

describe("plan week", () => {
  it("formats Polish dates and ranges", () => {
    expect(plDate("2026-11-02")).toBe("2 lis");
    expect(plDate("2026-11-29", true)).toBe("29 listopada");
    expect(plRange("2026-11-02", "2026-11-08")).toBe("2–8 listopada");
    expect(plRange("2026-10-26", "2026-11-01")).toBe("26 października – 1 listopada");
  });

  it("groups by calendar week, Monday first", () => {
    expect(planWeeks(plan).map((w) => [w.monday, w.days.length])).toEqual([
      ["2026-11-02", 7],
      ["2026-11-09", 1],
    ]);
  });

  it("opens the week with today, marks today, keeps rest days short and opens a session", async () => {
    const onOpen = vi.fn();
    await act(async () =>
      root.render(
        <PlanWeek
          plan={plan}
          todayIso="2026-11-09"
          completions={{ "s-2026-11-02": { completed: true, rpe: 6, notes: "" } }}
          preview={false}
          onOpen={onOpen}
        />,
      ),
    );
    expect(host.querySelector(".bw-wk-head strong")?.textContent).toBe("Tydzień 2 z 2");
    expect(host.querySelector("[data-today] .bw-wk-date span")?.textContent).toBe("Dziś");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Poprzedni tydzień"]')!.click(),
    );
    expect(host.querySelector(".bw-wk-head small")?.textContent).toBe("2–8 listopada");
    expect(host.querySelectorAll("[data-rest]")).toHaveLength(5);
    expect(host.querySelectorAll("[data-rest] button")).toHaveLength(0);
    expect(host.querySelector('[aria-label="Wykonane"]')).not.toBeNull();
    const open = host.querySelector<HTMLButtonElement>(".bw-wk-open")!;
    expect(open.textContent).toContain("Całe ciało A");
    expect(open.textContent).toContain("Siłownia · 50 min");
    await act(async () => open.click());
    expect(onOpen).toHaveBeenCalledWith(plan[0], 1);
  });

  it("a preview has no session links", async () => {
    await act(async () =>
      root.render(
        <PlanWeek plan={plan} todayIso="2026-11-02" completions={{}} preview onOpen={() => {}} />,
      ),
    );
    expect(host.querySelectorAll(".bw-wk-open")).toHaveLength(0);
  });
});
