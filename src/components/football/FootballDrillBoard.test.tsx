// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FootballDrillBoard } from "./FootballDrillBoard";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
describe("Pitch instruction playback", () => {
  it("is paused initially and cleans the playback timer on closing", () => {
    act(() => root.render(<FootballDrillBoard exerciseId="football_gate_dribble" />));
    expect(host.querySelector("animateMotion")).toBeNull();
    const play = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Odtwórz schemat",
    )!;
    act(() => play.click());
    expect(host.querySelector("animateMotion")).not.toBeNull();
    act(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(host.querySelector("animateMotion")).toBeNull();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shows a spatial cue with a word as well as color and never repeats immediately", () => {
    act(() => root.render(<FootballDrillBoard exerciseId="football_scan_control" />));
    act(() => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Lewo");
    act(() =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Odtwórz schemat")!
        .click(),
    );
    act(() => vi.advanceTimersByTime(6000));
    expect(host.querySelector('[role="status"]')?.textContent).not.toContain("Lewo");
  });
});
