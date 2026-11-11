// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneEvent } from "./fpScene";
import { runSim } from "./fpSim";
import { FP_VARIANT_SEEDS, makeVariant } from "./fpVariants";
import { modelInputs, principleFor } from "./fpDebrief";
import { fpHistoryKey } from "./fpStore";

const harness = vi.hoisted(() => ({
  emit: null as null | ((e: SceneEvent) => void),
  fail: false,
  scene: null as null | Record<string, ReturnType<typeof vi.fn> | object>,
}));
vi.mock("./fpScene", () => ({
  createFpScene: vi.fn(async (_host: HTMLElement, onEvent: (e: SceneEvent) => void) => {
    if (harness.fail) throw new Error("WebGL not available");
    harness.emit = onEvent;
    const look = { status: "drag", enableMotion: vi.fn(async () => "drag"), recenter: vi.fn() };
    harness.scene = {
      look,
      startLive: vi.fn(),
      setPaused: vi.fn(),
      primary: vi.fn(() => "touch"),
      carry: vi.fn(),
      recenterForward: vi.fn(),
      playFrames: vi.fn(),
      setPlaying: vi.fn(),
      seek: vi.fn(),
      progress: vi.fn(() => 0),
      lookAt: vi.fn(),
      dispose: vi.fn(),
    };
    return harness.scene;
  }),
}));
vi.mock("@/lib/haptics", () => ({ vibrate: vi.fn(() => false) }));

import { FirstPersonIQ } from "./FirstPersonIQ";

let root: Root, host: HTMLDivElement;
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const button = (name: string | RegExp) =>
  [...host.querySelectorAll("button")].find((b) =>
    typeof name === "string"
      ? b.textContent?.trim() === name || b.getAttribute("aria-label") === name
      : name.test(b.textContent ?? ""),
  )!;
const stage = () => host.querySelector(".fp-root")!.getAttribute("data-stage");
const fn = (name: string) => harness.scene![name] as ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  harness.fail = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("FirstPersonIQ lesson flow", () => {
  it("runs demo → own action → replay from above → one tip → changed variant, saving once", async () => {
    const seed = FP_VARIANT_SEEDS[2];
    const onBack = vi.fn();
    act(() =>
      root.render(
        <FirstPersonIQ
          historyOwner="u1"
          initialSeed={seed}
          onBack={onBack}
          onOpenClassic={() => undefined}
        />,
      ),
    );
    await wait(50);
    expect(stage()).toBe("intro");
    await wait(1500);
    expect(host.textContent).toMatch(/Zasada/);
    expect(fn("playFrames")).toHaveBeenCalled(); // the demonstration plays from above

    act(() => button("Twoja kolej").click());
    expect(stage()).toBe("ready");
    expect(fn("startLive")).toHaveBeenCalledTimes(1);
    expect(
      (harness.scene!.look as { enableMotion: ReturnType<typeof vi.fn> }).enableMotion,
    ).toHaveBeenCalled();
    expect(host.textContent).toMatch(/Przeciągaj palcem/);

    act(() => button("Start").click());
    expect(stage()).toBe("play");
    expect(fn("setPaused")).toHaveBeenLastCalledWith(false);
    // During the action nothing names a good answer: only the reticle and the controls.
    expect(host.querySelector(".fp-card")).toBeNull();

    act(() => harness.emit!({ type: "phase", phase: "incoming" }));
    const thumb = host.querySelector<HTMLButtonElement>(".fp-thumb")!;
    expect(thumb.textContent).toBe("Przyjmij");
    act(() => {
      thumb.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      thumb.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(fn("primary")).toHaveBeenCalledTimes(1);

    // The app goes to the background: the action pauses; coming back recentres the view.
    act(() => harness.emit!({ type: "hidden" }));
    expect(fn("setPaused")).toHaveBeenLastCalledWith(true);
    act(() => button("Wróć do gry").click());
    expect(
      (harness.scene!.look as { recenter: ReturnType<typeof vi.fn> }).recenter,
    ).toHaveBeenCalledWith(0);

    const v = makeVariant(seed);
    const inputs = modelInputs(v, principleFor(v));
    const sim = runSim(v, inputs);
    act(() => harness.emit!({ type: "done", sim, inputs }));
    expect(stage()).toBe("replay");
    await wait(150);
    const saved = JSON.parse(localStorage.getItem(fpHistoryKey("u1"))!);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ version: 1, variant: v.id, outcome: sim.outcome!.kind });

    act(() => harness.emit!({ type: "playback-end" }));
    expect(stage()).toBe("debrief");
    const card = host.querySelector(".fp-debrief")!.textContent!;
    expect(card).toMatch(/Wybór/);
    expect(card).toMatch(/Wykonanie/);
    expect(card).toMatch(/Rezultat/);
    expect(host.querySelectorAll(".fp-tip")).toHaveLength(1);

    // Watching the replay again does not save a second result.
    act(() => button(/Powtórka/).click());
    await wait(100);
    expect(JSON.parse(localStorage.getItem(fpHistoryKey("u1"))!)).toHaveLength(1);
    act(() => harness.emit!({ type: "playback-end" }));

    const before = host.querySelector(".fp-root")!.getAttribute("data-fp-variant");
    act(() => button("Nowy wariant").click());
    await wait(80);
    expect(host.querySelector(".fp-root")!.getAttribute("data-fp-variant")).not.toBe(before);
    expect(["intro", "ready"]).toContain(stage());
  }, 30_000);

  it("offers the board situations when 3D cannot start", async () => {
    harness.fail = true;
    const openClassic = vi.fn();
    act(() =>
      root.render(
        <FirstPersonIQ historyOwner="u1" onBack={() => undefined} onOpenClassic={openClassic} />,
      ),
    );
    await wait(30);
    expect(stage()).toBe("error");
    act(() => button("Otwórz sytuacje na tablicy").click());
    expect(openClassic).toHaveBeenCalled();
  });
});
