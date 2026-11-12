// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { F5SceneEvent } from "./f5Scene";
import { createSim, stepSim } from "./f5Sim";
import { F5_VARIANT_SEEDS, makeVariant } from "./f5Variants";
import { botInputs } from "./f5Bot";
import { f5HistoryKey } from "./f5Store";

const harness = vi.hoisted(() => ({
  emit: null as null | ((e: F5SceneEvent) => void),
  scene: null as null | Record<string, ReturnType<typeof vi.fn> | object>,
}));
vi.mock("./f5Scene", () => ({
  createF5Scene: vi.fn(async (_host: HTMLElement, onEvent: (e: F5SceneEvent) => void) => {
    harness.emit = onEvent;
    const look = { status: "drag", enableMotion: vi.fn(async () => "drag"), recenter: vi.fn() };
    harness.scene = {
      look,
      preview: vi.fn(),
      startLive: vi.fn(),
      setPaused: vi.fn(),
      stick: vi.fn(),
      kick: vi.fn(() => true),
      press: vi.fn(() => true),
      tackle: vi.fn(() => true),
      recenterForward: vi.fn(),
      playFrames: vi.fn(),
      setPlaying: vi.fn(),
      progress: vi.fn(() => 0),
      lookAt: vi.fn(),
      dispose: vi.fn(),
    };
    return harness.scene;
  }),
}));
vi.mock("@/lib/haptics", () => ({ vibrate: vi.fn(() => false) }));

import { FiveAsideIQ } from "./FiveAsideIQ";

let root: Root, host: HTMLDivElement;
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const button = (name: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name,
  )!;
const stage = () => host.querySelector(".fp-root")!.getAttribute("data-stage");
const variantId = () => host.querySelector(".fp-root")!.getAttribute("data-f5-variant");
const fn = (name: string) => harness.scene![name] as ReturnType<typeof vi.fn>;
const pointer = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("FiveAsideIQ lesson flow", () => {
  it("position → play → replay from above → one tip → play again or a new variant, saving once", async () => {
    const seed = F5_VARIANT_SEEDS.left[0]!;
    act(() =>
      root.render(
        <FiveAsideIQ
          historyOwner="u1"
          initialSeed={seed}
          initialPosition="left"
          onBack={() => undefined}
        />,
      ),
    );
    await wait(30);
    expect(stage()).toBe("intro");
    expect(fn("preview")).toHaveBeenCalled();
    expect(button("Lewy skrzydłowy").getAttribute("aria-pressed")).toBe("true");
    act(() => button("Graj").click());
    expect(stage()).toBe("ready");
    expect(fn("startLive")).toHaveBeenCalledTimes(1);
    expect(fn("setPaused")).toHaveBeenLastCalledWith(true);
    act(() => button("Start").click());
    expect(stage()).toBe("play");
    expect(fn("setPaused")).toHaveBeenLastCalledWith(false);
    // No ball yet: no kicking; with the ball the three actions work.
    expect(button("Podaj").disabled).toBe(true);
    act(() => harness.emit!({ type: "hud", hud: { mode: "with" } }));
    expect(button("Podaj").disabled).toBe(false);
    act(() => pointer(button("Strzel"), "pointerdown"));
    expect(button("Strzel").className).toContain("is-charging");
    act(() => pointer(button("Strzel"), "pointerup"));
    expect(fn("kick")).toHaveBeenCalledWith("shot", expect.any(Number));
    // Without the ball after a loss: defensive actions.
    act(() => harness.emit!({ type: "hud", hud: { mode: "defend" } }));
    expect(button("Podaj")).toBeUndefined();
    act(() => pointer(button("Odbiór"), "pointerdown"));
    expect(fn("tackle")).toHaveBeenCalled();
    act(() => pointer(button("Doskok"), "pointerdown"));
    expect(fn("press")).toHaveBeenCalled();
    // The app goes to the background: play pauses.
    act(() => harness.emit!({ type: "hidden" }));
    expect(host.textContent).toContain("Wróć do gry");
    act(() => button("Wróć do gry").click());
    expect(fn("recenterForward")).toHaveBeenCalled();

    // The fragment ends: replay from above, then the debrief.
    const sim = createSim(makeVariant(seed, "left"));
    const inputs = botInputs(sim, "pass", (s, i) => stepSim(s, i));
    act(() => harness.emit!({ type: "done", sim, inputs }));
    expect(stage()).toBe("replay");
    expect(fn("playFrames")).toHaveBeenCalledWith(sim.frames, expect.any(Number), 0.9, sim.ty);
    await wait(80);
    act(() => button("Dalej").click());
    expect(stage()).toBe("debrief");
    const text = host.querySelector(".fp-debrief")!.textContent!;
    expect(text).toContain("Przyjęcie");
    expect(text).toContain("Decyzja");
    expect(text).toContain("Rezultat");
    expect(host.querySelectorAll(".fp-tip")).toHaveLength(1);
    const saved = JSON.parse(localStorage.getItem(f5HistoryKey("u1"))!);
    expect(saved).toHaveLength(1);
    expect(saved[0].variant).toBe(variantId());

    // Play the same picture again: no second save from the old fragment.
    const first = variantId();
    act(() => button("Zagraj ponownie").click());
    expect(stage()).toBe("ready");
    expect(variantId()).toBe(first);
    expect(JSON.parse(localStorage.getItem(f5HistoryKey("u1"))!)).toHaveLength(1);

    // A new variant changes the picture and goes straight to the start.
    act(() => button("Start").click());
    act(() => harness.emit!({ type: "done", sim, inputs }));
    await wait(80);
    act(() => button("Dalej").click());
    act(() => button("Nowy wariant").click());
    await wait(20);
    expect(stage()).toBe("ready");
    expect(variantId()).not.toBe(first);
  });
});
