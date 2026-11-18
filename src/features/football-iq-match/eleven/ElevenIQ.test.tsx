// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { E11SceneEvent } from "./e11Scene";
import { runSim } from "./e11Sim";
import { E11_VARIANT_SEEDS, makeVariant, slotIndex } from "./e11Variants";
import { e11HistoryKey } from "./e11Store";

const harness = vi.hoisted(() => ({
  emit: null as null | ((e: E11SceneEvent) => void),
  scene: null as null | Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock("./e11Scene", () => ({
  createE11Scene: vi.fn(async (_host: HTMLElement, onEvent: (e: E11SceneEvent) => void) => {
    harness.emit = onEvent;
    harness.scene = {
      preview: vi.fn(),
      startLive: vi.fn(),
      setPaused: vi.fn(),
      setHints: vi.fn(),
      setThroughMode: vi.fn(),
      stick: vi.fn(),
      pass: vi.fn(() => true),
      shot: vi.fn(() => true),
      dispose: vi.fn(),
    };
    return harness.scene;
  }),
}));
vi.mock("@/lib/haptics", () => ({ vibrate: vi.fn(() => false) }));

import { ElevenIQ } from "./ElevenIQ";

let root: Root, host: HTMLDivElement;
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const button = (name: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim().startsWith(name) || b.getAttribute("aria-label") === name,
  )!;
const stage = () => host.querySelector(".fp-root")!.getAttribute("data-stage");
const fn = (name: string) => harness.scene![name]!;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const seed = E11_VARIANT_SEEDS.mid[0]!;
const mount = async () => {
  await act(async () =>
    root.render(
      <ElevenIQ historyOwner="u1" onBack={() => undefined} initialSeed={seed} initialRole="mid" />,
    ),
  );
  await wait(20);
};

describe("ElevenIQ lesson flow", () => {
  it("intro → play → debrief from above, saving the result once", async () => {
    await mount();
    expect(stage()).toBe("intro");
    expect(fn("preview")).toHaveBeenCalled();
    expect(host.textContent).toContain("spalony i timing podania");
    act(() => button("Start").click());
    expect(stage()).toBe("play");
    expect(fn("startLive")).toHaveBeenCalledWith(expect.objectContaining({ role: "mid" }), true);
    // The kind of pass and the shot reach the scene.
    act(() => button("Do nogi").click());
    expect(fn("setThroughMode")).toHaveBeenLastCalledWith(false);
    // The fragment ends with a good pass: the debrief shows the replay from above.
    const v = makeVariant(seed, "mid");
    const run = v.runs[0]!;
    const sim = runSim(v, [
      { tick: run.burst - 19, kind: "pass", to: slotIndex("home", run.slot), through: true },
    ]);
    act(() => harness.emit!({ type: "done", sim, inputs: sim.events.length ? [] : [] }));
    await wait(30);
    expect(stage()).toBe("debrief");
    expect(host.querySelector(".e11-pitch")).not.toBeNull();
    expect(host.textContent).toContain("Moment podania");
    expect(host.textContent).toContain("Dobry moment");
    const saved = JSON.parse(localStorage.getItem(e11HistoryKey("u1")) ?? "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0].timing).toBe("inTime");
  });

  it("a late pass is shown as offside with the line on the replay", async () => {
    await mount();
    act(() => button("Start").click());
    const v = makeVariant(seed, "mid");
    const run = v.runs[0]!;
    // Released long after the runner started: one of these is offside for this picture.
    const sim = [75, 90, 60]
      .map((dt) =>
        runSim(v, [
          {
            tick: run.burst + dt - 19,
            kind: "pass",
            to: slotIndex("home", run.slot),
            through: true,
          },
        ]),
      )
      .find((s) => s.outcome?.kind === "offside")!;
    expect(sim.outcome?.kind).toBe("offside");
    act(() => harness.emit!({ type: "done", sim, inputs: [] }));
    await wait(30);
    expect(host.textContent).toContain("Spalony");
    expect(host.querySelector(".e11-line")).not.toBeNull();
    // Opening the moment jumps the replay there and tells what happened.
    const moment = [...host.querySelectorAll(".e11-moments button")].find((b) =>
      b.textContent?.includes("Spalony"),
    ) as HTMLButtonElement;
    act(() => moment.click());
    expect(moment.textContent).toMatch(/przed linią obrony/);
  });

  it("the game waits upright: the notice is shown and play is paused", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await mount();
    act(() => button("Start").click());
    await wait(10);
    expect(host.textContent).toContain("Obróć telefon poziomo");
    expect(fn("setPaused")).toHaveBeenCalledWith(true);
    vi.unstubAllGlobals();
  });

  it("hints can be switched off before the start", async () => {
    await mount();
    act(() => button("Bez podpowiedzi").click());
    expect(fn("setHints")).toHaveBeenLastCalledWith(false);
    act(() => button("Start").click());
    expect(fn("startLive")).toHaveBeenCalledWith(expect.anything(), false);
  });
});
