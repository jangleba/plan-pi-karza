// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FootballDirectionPractice, FootballDrillBoard } from "./FootballDrillBoard";
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
  it.each([undefined, "football_wall_first_touch", "football_target_pass", "flying_sprint"])(
    "does not add random direction practice to the fixed drill %s",
    (exerciseId) => {
      act(() => root.render(<FootballDirectionPractice exerciseId={exerciseId} />));
      expect(host.textContent).toBe("");
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("pauses the optional direction practice when its panel is collapsed", () => {
    act(() => root.render(<FootballDrillBoard exerciseId="football_gate_dribble" />));
    const panel = host.querySelector<HTMLDetailsElement>('[aria-label="Kierunki i kolory"]')!;
    act(() => {
      panel.open = true;
      panel.dispatchEvent(new Event("toggle"));
    });
    act(() =>
      [...panel.querySelectorAll("button")]
        .find((button) => button.textContent === "Odtwórz schemat")!
        .click(),
    );
    expect(panel.querySelector("animateMotion")).not.toBeNull();
    act(() => {
      panel.open = false;
      panel.dispatchEvent(new Event("toggle"));
    });
    expect(panel.querySelector("animateMotion")).toBeNull();
    // jsdom queues the native details toggle notification at zero delay.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
  });

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
    expect(
      host.querySelector('[aria-label="Kierunki i kolory"] [role="status"]')?.textContent,
    ).toContain("Lewo");
    act(() =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Odtwórz schemat")!
        .click(),
    );
    act(() => vi.advanceTimersByTime(6000));
    expect(
      host.querySelector('[aria-label="Kierunki i kolory"] [role="status"]')?.textContent,
    ).not.toContain("Lewo");
  });
});
