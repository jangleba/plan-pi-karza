// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleCommonRouteWarmup } from "./routeWarmup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.stubGlobal("cancelIdleCallback", undefined);
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "connection");
});

describe("bounded common-route warmup", () => {
  it("waits until after the screen paint and prepares only its companion route", async () => {
    const preload = vi.fn(async () => {});
    scheduleCommonRouteWarmup("/start", preload);
    await vi.advanceTimersByTimeAsync(699);
    expect(preload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(preload.mock.calls).toEqual([["/plan"]]);
  });
  it.each([
    { saveData: true },
    { effectiveType: "3g" },
    { effectiveType: "2g" },
    { downlink: 0.5 },
  ])("does not spend bandwidth on a constrained connection: %j", async (connection) => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
    const preload = vi.fn(async () => {});
    scheduleCommonRouteWarmup("/start", preload);
    await vi.runAllTimersAsync();
    expect(preload).not.toHaveBeenCalled();
  });
  it("cancels work when the current screen is left", async () => {
    const preload = vi.fn(async () => {});
    const cancel = scheduleCommonRouteWarmup("/plan", preload);
    cancel();
    await vi.runAllTimersAsync();
    expect(preload).not.toHaveBeenCalled();
  });
  it("does not fetch heavy modules while visiting Fuel, Lab or IQ", async () => {
    const preload = vi.fn(async () => {});
    for (const path of ["/fuel", "/lab", "/football-iq"]) scheduleCommonRouteWarmup(path, preload);
    await vi.runAllTimersAsync();
    expect(preload).not.toHaveBeenCalled();
  });
  it("does not start a scheduled preload in a background tab", async () => {
    const preload = vi.fn(async () => {});
    scheduleCommonRouteWarmup("/start", preload);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await vi.runAllTimersAsync();
    expect(preload).not.toHaveBeenCalled();
  });
  it("rechecks the connection when the scheduled task executes", async () => {
    const preload = vi.fn(async () => {});
    scheduleCommonRouteWarmup("/start", preload);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await vi.runAllTimersAsync();
    expect(preload).not.toHaveBeenCalled();
  });
  it("cancels an idle callback and ignores a late callback after navigation", async () => {
    const preload = vi.fn(async () => {});
    let work: IdleRequestCallback | undefined;
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      work = callback;
      return 42;
    });
    const cancelIdle = vi.fn();
    vi.stubGlobal("cancelIdleCallback", cancelIdle);
    const cancel = scheduleCommonRouteWarmup("/start", preload);
    await vi.advanceTimersByTimeAsync(700);
    cancel();
    work?.({ didTimeout: false, timeRemaining: () => 30 });
    expect(cancelIdle).toHaveBeenCalledWith(42);
    expect(preload).not.toHaveBeenCalled();
  });
});
