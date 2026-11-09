import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  isNative: false,
  pluginAvailable: true,
  vibrate: vi.fn(async (_options: { duration: number }) => undefined),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => native.isNative,
    isPluginAvailable: (name: string) => name === "Haptics" && native.pluginAvailable,
  },
}));
vi.mock("@capacitor/haptics", () => ({ Haptics: { vibrate: native.vibrate } }));

import { vibrate } from "./haptics";

describe("vibrate", () => {
  const browserVibrate = vi.fn(() => true);

  beforeEach(() => {
    vi.useFakeTimers();
    native.isNative = false;
    native.pluginAvailable = true;
    native.vibrate.mockClear();
    browserVibrate.mockClear();
    Object.defineProperty(navigator, "vibrate", { value: browserVibrate, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("w aplikacji na telefonie gra każdy impuls wzoru natywnie, z przerwami", () => {
    native.isNative = true;
    expect(vibrate([120, 80, 120])).toBe(true);
    expect(native.vibrate).toHaveBeenCalledTimes(1);
    expect(native.vibrate).toHaveBeenLastCalledWith({ duration: 120 });
    vi.advanceTimersByTime(199);
    expect(native.vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(native.vibrate).toHaveBeenCalledTimes(2);
    expect(native.vibrate).toHaveBeenLastCalledWith({ duration: 120 });
    expect(browserVibrate).not.toHaveBeenCalled();
  });

  it("pojedyncza liczba to jeden impuls, a zbyt długi jest skracany", () => {
    native.isNative = true;
    vibrate(200);
    vibrate(60_000);
    expect(native.vibrate.mock.calls.map(([o]) => o.duration)).toEqual([200, 1000]);
  });

  it("w przeglądarce używa navigator.vibrate", () => {
    expect(vibrate([150, 80, 220])).toBe(true);
    expect(browserVibrate).toHaveBeenCalledWith([150, 80, 220]);
    expect(native.vibrate).not.toHaveBeenCalled();
  });

  it("bez wtyczki w aplikacji wraca do navigator.vibrate", () => {
    native.isNative = true;
    native.pluginAvailable = false;
    vibrate(60);
    expect(browserVibrate).toHaveBeenCalledWith(60);
    expect(native.vibrate).not.toHaveBeenCalled();
  });

  it("nic nie robi, gdy telefon nie umie wibrować albo wzór jest pusty", () => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
    expect(vibrate([60])).toBe(false);
    expect(vibrate([])).toBe(false);
    expect(vibrate([0, 100])).toBe(false);
  });

  it("błąd natywnej wtyczki nie wyrzuca wyjątku", async () => {
    native.isNative = true;
    native.vibrate.mockRejectedValueOnce(new Error("no engine"));
    expect(() => vibrate(60)).not.toThrow();
    await Promise.resolve();
  });
});
