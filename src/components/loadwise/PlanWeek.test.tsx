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
    // Category chip, minutes and the load, always with text next to the bars.
    expect(open.querySelector(".bw-session-kind")?.textContent).toBe("Siłownia");
    expect(open.querySelector(".bw-session-kind")?.getAttribute("data-tone")).toBe("strength");
    expect(open.textContent).toContain("50 min");
    expect(open.querySelector(".bw-wk-load-text")?.textContent).toBe("Umiarkowanie");
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

  it("shows each prescribed intensity independently and leaves external load unassessed", async () => {
    const double = day("2026-11-02", {
      intensity: "niska",
      secondSession: day("2026-11-02", { intensity: "wysoka" }),
    });
    const club = day("2026-11-04", {
      dayType: "club",
      externalCommitment: true,
      intensity: "umiarkowana",
    });
    await act(async () =>
      root.render(
        <PlanWeek
          plan={[double, day("2026-11-03", { intensity: "umiarkowana" }), club, rest("2026-11-05")]}
          todayIso="2026-11-02"
          completions={{}}
          preview
          onOpen={() => {}}
        />,
      ),
    );
    expect(
      [...host.querySelectorAll('[role="img"]')].map((mark) => mark.getAttribute("aria-label")),
    ).toEqual([
      "Planowana intensywność: niska",
      "Planowana intensywność: wysoka",
      "Planowana intensywność: umiarkowana",
      "Planowana intensywność nieokreślona",
    ]);
    expect(host.querySelectorAll('[data-rest] [role="img"]')).toHaveLength(0);
  });

  it("keeps zero-minute club commitments visible and does not call a second-session day full rest", async () => {
    const club = day("2026-11-04", {
      dayType: "club",
      type: "club_training",
      title: "Team Training",
      durationMin: 0,
      externalCommitment: true,
    });
    const shell = {
      ...rest("2026-11-05"),
      secondSession: day("2026-11-05"),
    };
    const onOpen = vi.fn();
    await act(async () =>
      root.render(
        <PlanWeek
          plan={[club, shell, rest("2026-11-06")]}
          todayIso="2026-11-04"
          completions={{}}
          preview={false}
          onOpen={onOpen}
        />,
      ),
    );
    const days = [...host.querySelectorAll(".bw-wk-days > li")];
    expect(days[0].textContent).toContain("Team Training");
    expect(days[0].textContent).toContain("Klub");
    expect(days[0].textContent).not.toContain("Odpoczynek");
    expect(days[0].hasAttribute("data-rest")).toBe(false);
    expect(days[1].hasAttribute("data-rest")).toBe(false);
    expect(days[2].hasAttribute("data-rest")).toBe(true);
    expect(host.querySelectorAll(".bw-wk-strip [data-train]")).toHaveLength(2);
    await act(async () => days[0].querySelector<HTMLButtonElement>("button")!.click());
    expect(onOpen).toHaveBeenCalledWith(club, 1);
    await act(async () => days[1].querySelector<HTMLButtonElement>("button")!.click());
    expect(onOpen).toHaveBeenLastCalledWith(shell, 2);
  });
});
