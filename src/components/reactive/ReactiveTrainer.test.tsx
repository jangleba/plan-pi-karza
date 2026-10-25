// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactiveTrainer } from "./ReactiveTrainer";
import { loadReactiveSession } from "@/lib/reactive-training/storage";
let host: HTMLDivElement,
  root: Root,
  hidden = false;
const click = async (label: string) => {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!button) throw new Error(`missing ${label}`);
  await act(async () => button.click());
};
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ReactiveTrainer storageKey="reaction-user" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("reaction background and restart", () => {
  it("pauses immediately on hide, excludes locked time, and restores the final summary", async () => {
    await click("Uruchom bodźce");
    await act(async () => vi.advanceTimersByTime(10_000));
    await act(async () => vi.advanceTimersByTime(8_000));
    hidden = true;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(host.textContent).toContain("Pauza");
    const paused = loadReactiveSession("reaction-user")!;
    expect(paused.stats.elapsedSec).toBe(8);
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(loadReactiveSession("reaction-user")?.stats.elapsedSec).toBe(8);
    await click("Zakończ");
    expect(host.textContent).toContain("0:08");
    expect(loadReactiveSession("reaction-user")?.phase).toBe("summary");
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<ReactiveTrainer storageKey="reaction-user" />));
    expect(host.textContent).toContain("Przywrócono ostatni zapisany wynik");
    expect(host.textContent).toContain("0:08");
  });
  it("isolates a running draft when the account storage key changes without a route remount", async () => {
    await click("Uruchom bodźce");
    await act(async () => vi.advanceTimersByTime(10_000));
    await act(async () => vi.advanceTimersByTime(5_000));
    await act(async () => root.render(<ReactiveTrainer storageKey="other-user" />));
    expect(loadReactiveSession("reaction-user")?.stats.elapsedSec).toBe(5);
    expect(loadReactiveSession("other-user")).toBeNull();
    expect(host.textContent).toContain("Uruchom bodźce");
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(loadReactiveSession("other-user")).toBeNull();
    await act(async () => root.render(<ReactiveTrainer storageKey="reaction-user" />));
    expect(host.textContent).toContain("Pauza");
    expect(loadReactiveSession("reaction-user")?.stats.elapsedSec).toBe(5);
  });
  it("pauses native inactivity during countdown and requires an explicit resume", async () => {
    await click("Uruchom bodźce");
    await act(async () => vi.advanceTimersByTime(3_000));
    await act(async () =>
      window.dispatchEvent(new CustomEvent("ballwise:app-state", { detail: { isActive: false } })),
    );
    expect(host.textContent).toContain("Pauza");
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(loadReactiveSession("reaction-user")?.stats.cueCount).toBe(0);
    expect(loadReactiveSession("reaction-user")?.stats.elapsedSec).toBe(0);
  });
});
