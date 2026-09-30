// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactiveTrainer } from "./ReactiveTrainer";

let host: HTMLDivElement;
let root: Root;
let wakeBefore: PropertyDescriptor | undefined;
let requestBefore: PropertyDescriptor | undefined;
let exitBefore: PropertyDescriptor | undefined;
let fullscreenBefore: PropertyDescriptor | undefined;
const mocks = { wake: vi.fn(), release: vi.fn(), request: vi.fn(), exit: vi.fn() };
async function click(label: string) {
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === label)!
      .click(),
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.values(mocks).forEach((mock) => mock.mockReset());
  wakeBefore = Object.getOwnPropertyDescriptor(navigator, "wakeLock");
  requestBefore = Object.getOwnPropertyDescriptor(document.documentElement, "requestFullscreen");
  exitBefore = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
  fullscreenBefore = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
  let fullscreen: Element | null = null;
  mocks.release.mockResolvedValue(undefined);
  mocks.wake.mockResolvedValue({ release: mocks.release });
  mocks.request.mockImplementation(async () => {
    fullscreen = document.documentElement;
  });
  mocks.exit.mockImplementation(async () => {
    fullscreen = null;
  });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request: mocks.wake },
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: mocks.request,
  });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: mocks.exit });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreen,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ReactiveTrainer storageKey="reactive-test" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const [target, name, descriptor] of [
    [navigator, "wakeLock", wakeBefore],
    [document.documentElement, "requestFullscreen", requestBefore],
    [document, "exitFullscreen", exitBefore],
    [document, "fullscreenElement", fullscreenBefore],
  ] as const) {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else delete (target as unknown as Record<string, unknown>)[name];
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reactive task lifecycle", () => {
  it("keeps the cue task above navigation space and cleans up a running session on exit", async () => {
    await click("Uruchom bodźce");
    expect(host.querySelector(".bw-workspace")).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(host.querySelector('[aria-label="Pauza"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Pauza"]')!.click());
    expect(host.textContent).toContain("Pauza");
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => root.render(null));
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.exit).toHaveBeenCalledOnce();
  });

  it("releases a screen lock that resolves after the task has already been closed", async () => {
    let resolveLock!: (lock: { release: () => Promise<void> }) => void;
    mocks.wake.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLock = resolve;
        }),
    );
    await click("Uruchom bodźce");
    await act(async () => root.render(null));
    await act(async () => resolveLock({ release: mocks.release }));
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
