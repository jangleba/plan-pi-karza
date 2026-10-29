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
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<TacticalPitch {...props} />));
}
describe("pitch guidance boundary", () => {
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
    expect(host.querySelector('svg[aria-label="Boisko w trybie uproszczonym"]')).not.toBeNull();
    expect(props.onReadyChange).toHaveBeenLastCalledWith(true);
    const canvas = host.querySelector<HTMLDivElement>(".bwiq-pitch-canvas")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 280,
    } as DOMRect);
    await act(async () =>
      host
        .querySelector(".bwiq-pitch-wrap")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 100, clientY: 140 })),
    );
    expect(props.onPitchSelect).toHaveBeenCalledWith({ x: 50, y: 70 });
  });
});
