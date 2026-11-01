// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TacticalPitch } from "./TacticalPitch";
import { createPitchScene } from "./pitchScene";
import { createJourney, journeyFrame } from "./journeyEngine";
import { journeyBank } from "./journeyBank";
import * as playbackEngine from "./playback";
import type { ComponentProps } from "react";
const bridge = vi.hoisted(() => ({
  update: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  pick: vi.fn(),
  project: vi.fn((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
}));
vi.mock("./pitchScene", () => ({ createPitchScene: vi.fn(async () => bridge) }));
let host: HTMLDivElement, root: Root, props: ComponentProps<typeof TacticalPitch>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.values(bridge).forEach((fn) => fn.mockClear());
  vi.mocked(createPitchScene).mockClear();
  bridge.pick.mockReturnValue({ x: 42.37, y: 83.91 });
  const session = createJourney(journeyBank.find((d) => d.role === "wing")!);
  props = {
    scenario: session.scenario,
    actions: [
      { id: "route", type: "run", playerId: "you", from: { x: 40, y: 90 }, to: { x: 30, y: 70 } },
    ],
    frameOverride: journeyFrame(session.world, session.players),
    selectedPlayerId: "you",
    mode: "carry",
    interactive: true,
    selectablePlayerIds: [],
    onPlayerSelect: vi.fn(),
    onPitchSelect: vi.fn(),
    onDestinationSelect: vi.fn(),
    destinations: [{ id: "suggested", point: { x: 30, y: 70 }, label: "Sugerowany ruch" }],
    teachingMarkers: [
      {
        id: "cue",
        letter: "A",
        label: "Wolna strona",
        instruction: "Podaj",
        point: { x: 30, y: 70 },
      },
    ],
    activeTeachingId: "cue",
    highlights: [{ x: 30, y: 70 }],
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<TacticalPitch {...props} />));
}
describe("pitch guidance boundary", () => {
  it("keeps only requested labels while retaining the real 3D scene and close camera", async () => {
    props.visibleLabelIds = ["you", "support"];
    props.cameraClose = true;
    props.destinations = [];
    await render();
    expect(host.querySelectorAll("[data-iq-player]")).toHaveLength(2);
    expect(host.querySelector(".iq3-label-guides")).toBeNull();
    expect(host.querySelector("[data-iq-destination]")).toBeNull();
    expect(bridge.update.mock.lastCall![9]).toBe(true);
    vi.mocked(createPitchScene).mockRejectedValueOnce(new Error("No model"));
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.querySelectorAll("[data-iq-figure]")).toHaveLength(props.scenario.players.length);
    expect(host.querySelectorAll("[data-iq-player]")).toHaveLength(2);
    expect(host.querySelector(".iqD-anchor")).toBeNull();
  });
  it("maps an independent diagram tap through the actual crop and keeps choices hidden", async () => {
    props.diagram = true;
    props.freeMovement = true;
    props.showGuidance = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      width: 360,
      height: 280,
    } as DOMRect);
    await render();
    expect(host.querySelector("[data-iq-destination]")).toBeNull();
    const ball = host.querySelector<HTMLDivElement>(".iqD-ball")!;
    await act(async () =>
      host.querySelector(".iqD-board")!.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: parseFloat(ball.style.left) + 10,
          clientY: parseFloat(ball.style.top) + 20,
        }),
      ),
    );
    const point = vi.mocked(props.onPitchSelect).mock.lastCall![0];
    expect(point.x).toBeCloseTo(props.frameOverride!.ballVisual.x, 8);
    expect(point.y).toBeCloseTo(props.frameOverride!.ballVisual.y, 8);
    expect(props.onPlayerSelect).not.toHaveBeenCalled();
  });
  it("executes a diagram choice once, supports keyboard clicks, and blocks playback input", async () => {
    props.diagram = true;
    await render();
    const choice = host.querySelector<HTMLButtonElement>("[data-iq-destination='suggested']")!;
    await act(async () => choice.click());
    expect(props.onDestinationSelect).toHaveBeenCalledExactlyOnceWith("suggested");
    expect(props.onPitchSelect).not.toHaveBeenCalled();
    props.interactive = false;
    await render();
    await act(async () => choice.click());
    expect(props.onDestinationSelect).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLButtonElement>("[data-iq-player='you']")?.disabled).toBe(true);
  });
  it("animates diagram positions directly from the recorded clock and stops on pause", async () => {
    const callbacks: FrameRequestCallback[] = [],
      cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    props.diagram = true;
    props.interactive = false;
    props.playing = true;
    let live = props.frameOverride!;
    props.frameSource = () => live;
    await render();
    const ball = host.querySelector<HTMLDivElement>(".iqD-ball")!;
    const before = ball.style.left;
    live = { ...live, ballVisual: { x: 71, y: 62 }, ballInFlight: true, ballHeight: 4 };
    await act(async () => callbacks.at(-1)!(16));
    expect(ball.style.left).not.toBe(before);
    expect(ball.dataset.airborne).toBe("true");
    const stale = callbacks.at(-1)!;
    props.playing = false;
    await render();
    const paused = ball.style.left;
    live = { ...live, ballVisual: { x: 33, y: 21 } };
    await act(async () => stale(32));
    expect(ball.style.left).toBe(paused);
    expect(cancel).toHaveBeenCalled();
  });
  it("renders a functional diagram without loading a 3D scene or offering a fake retry", async () => {
    props.diagram = true;
    await render();
    expect(host.querySelector(".bwiq-pitch-wrap--diagram")).toBeTruthy();
    expect(host.querySelector("svg")).toBeTruthy();
    expect(host.textContent).not.toContain("Spróbuj boiska 3D");
    const player = host.querySelector<HTMLButtonElement>("[data-iq-player='you']")!;
    expect(player.style.left).toMatch(/px$/);
    expect(player.textContent).toBe("TY");
    expect(host.querySelector('[data-iq-destination="suggested"]')?.textContent).toBe("A");
    expect(vi.mocked(createPitchScene)).not.toHaveBeenCalled();
    expect(host.querySelector("svg")?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });
  it("renders a recorded journey frame without recomputing a second playback timeline", async () => {
    const create = vi.spyOn(playbackEngine, "createPlayback");
    const sample = vi.spyOn(playbackEngine, "samplePlayback");
    try {
      await render();
      expect(create).not.toHaveBeenCalled();
      expect(sample).not.toHaveBeenCalled();
      expect(bridge.update.mock.calls.at(-1)?.[0]).toBe(props.frameOverride);
    } finally {
      create.mockRestore();
      sample.mockRestore();
    }
  });
  it("restores ordinary playback when an external recorded frame is removed", async () => {
    const sample = vi.spyOn(playbackEngine, "samplePlayback");
    try {
      await render();
      props = { ...props, frameOverride: undefined };
      await render();
      expect(sample).toHaveBeenCalled();
      expect(bridge.update.mock.calls.at(-1)?.[0]).toBeTruthy();
    } finally {
      sample.mockRestore();
    }
  });
  it("removes all suggested destinations, target rings, teaching markers and 3D guidance", async () => {
    props.showGuidance = false;
    props.freeMovement = true;
    await render();
    expect(
      host.querySelectorAll(
        ".bwiq-destination,.bwiq-teaching-marker,.bwiq-highlight,.bwiq-action-order,.is-selected,.is-pass-target,.has-ball",
      ),
    ).toHaveLength(0);
    expect(host.querySelectorAll("[data-iq-player]")).toHaveLength(props.scenario.players.length);
    expect(host.querySelector('[aria-label="Piłka"]')).toBeTruthy();
    const args = bridge.update.mock.lastCall!;
    expect(args[1]).toEqual([]);
    expect(args[2]).toBeNull();
    expect(args[7]).toBeUndefined();
    expect(args[8]).toBe(false);
  });
  it("picks a real pitch point, including through a player badge, without snapping to suggestions", async () => {
    props.showGuidance = false;
    props.freeMovement = true;
    await render();
    const field = host.querySelector(".bwiq-pitch-wrap")!;
    await act(async () =>
      field.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 62, clientY: 91, detail: 1 }),
      ),
    );
    expect(props.onPitchSelect).toHaveBeenLastCalledWith({ x: 42.37, y: 83.91 });
    expect(props.onDestinationSelect).not.toHaveBeenCalled();
    const player = host.querySelector('[data-iq-player="r0"]')!;
    expect(player.hasAttribute("disabled")).toBe(false);
    await act(async () =>
      player.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 55, clientY: 85, detail: 1 }),
      ),
    );
    expect(props.onPitchSelect).toHaveBeenCalledTimes(2);
    expect(props.onPlayerSelect).not.toHaveBeenCalled();
  });
  it("keeps guided mode available and blocks pitch input while playback is active", async () => {
    await render();
    expect(host.querySelector('[data-iq-destination="suggested"]')).toBeTruthy();
    expect(host.querySelector(".bwiq-teaching-marker")).toBeTruthy();
    expect(bridge.update.mock.lastCall![8]).toBe(true);
    props = { ...props, showGuidance: false, freeMovement: true, interactive: false };
    await render();
    await act(async () =>
      host
        .querySelector(".bwiq-pitch-wrap")!
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, clientX: 62, clientY: 91, detail: 1 }),
        ),
    );
    expect(props.onPitchSelect).not.toHaveBeenCalled();
  });
});

describe("simplified pitch fallback", () => {
  it("keeps decisions usable after WebGL fails and maps free movement to pitch coordinates", async () => {
    vi.mocked(createPitchScene).mockRejectedValueOnce(new Error("WebGL unavailable"));
    props.freeMovement = true;
    props.onReadyChange = vi.fn();
    await render();
    expect(host.querySelector("[data-iq-figure='you']")).not.toBeNull();
    expect(props.onReadyChange).toHaveBeenLastCalledWith(true);
    const canvas = host.querySelector<HTMLDivElement>(".iqD-board")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 280,
    } as DOMRect);
    const marker = host.querySelector<HTMLDivElement>(".iqD-ball")!;
    await act(async () =>
      canvas.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: parseFloat(marker.style.left),
          clientY: parseFloat(marker.style.top),
        }),
      ),
    );
    expect(props.onPitchSelect).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onPitchSelect).mock.lastCall![0].x).toBeCloseTo(
      props.frameOverride!.ballVisual.x,
      8,
    );
    expect(vi.mocked(props.onPitchSelect).mock.lastCall![0].y).toBeCloseTo(
      props.frameOverride!.ballVisual.y,
      8,
    );
  });
});

it("allows a decision while the optional 3D scene is still downloading", async () => {
  vi.mocked(createPitchScene).mockImplementationOnce(() => new Promise(() => {}));
  props.onReadyChange = vi.fn();
  props.selectablePlayerIds = ["support"];
  await render();
  expect(host.querySelector("[data-iq-figure='you']")).not.toBeNull();
  expect(props.onReadyChange).toHaveBeenCalledWith(true);
  const support = host.querySelector<HTMLButtonElement>('[data-iq-player="support"]')!;
  expect(support.disabled).toBe(false);
  await act(async () => support.click());
  expect(props.onPlayerSelect).toHaveBeenCalled();
});

it("samples live frames without a parent render and cancels the loop on pause", async () => {
  const frames: FrameRequestCallback[] = [];
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  let frame = props.frameOverride!;
  props.frameSource = () => frame;
  props.playing = true;
  await render();
  bridge.update.mockClear();
  frame = { ...frame, ballVisual: { x: 22, y: 44 } };
  await act(async () => frames.at(-1)!(16));
  expect(bridge.update.mock.lastCall?.[0]).toBe(frame);
  const late = frames.at(-1)!;
  props.playing = false;
  await render();
  bridge.update.mockClear();
  await act(async () => late(32));
  expect(bridge.update).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});
