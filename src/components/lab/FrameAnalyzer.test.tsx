// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureFixture } from "@/lib/lab/testFixtures";
import { containedVideoRect, trimMarkers } from "@/lib/lab/analyzer";
import { getLabTest } from "@/lib/lab/definitions";
import type { FrameResponse } from "@/lib/lab/nativeCamera";
import { FrameAnalyzer } from "./FrameAnalyzer";

const native = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/lab/nativeCamera", () => ({ loadExactFrame: native.load }));
let host: HTMLDivElement;
let root: Root;
const capture = captureFixture();
const response = (frameIndex: number): FrameResponse => ({
  frameIndex,
  actualTimeSeconds: capture.frameTimestampsSeconds[frameIndex],
  dataUrl: `data:image/jpeg;base64,frame${frameIndex}`,
});
function button(label: string) {
  return [...host.querySelectorAll("button")].find((el) => el.textContent?.includes(label))!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}
async function paint() {
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("load")));
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  native.load
    .mockReset()
    .mockImplementation((_path: string, index: number) => Promise.resolve(response(index)));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <FrameAnalyzer
        capture={capture}
        test={getLabTest("cmj")}
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LAB exact frame analyzer", () => {
  it("blocks marking until the requested image is decoded, including during the debounce", async () => {
    expect(button("Odbicie").disabled).toBe(true);
    await tick();
    expect(button("Odbicie").disabled).toBe(true);
    await paint();
    expect(button("Odbicie").disabled).toBe(false);
    await click("10"); // move backwards at the first frame: still the same decoded image
    const forward = [...host.querySelectorAll("button")]
      .filter((el) => el.textContent === "10")
      .at(-1)!;
    await act(async () => forward.click());
    expect(button("Odbicie").disabled).toBe(true);
    await tick();
    expect(button("Odbicie").disabled).toBe(true);
    await paint();
    expect(button("Odbicie").disabled).toBe(false);
  });

  it("ignores late responses after rapid navigation", async () => {
    let finishFirst!: (frame: FrameResponse) => void;
    native.load.mockImplementationOnce(
      () =>
        new Promise<FrameResponse>((done) => {
          finishFirst = done;
        }),
    );
    await tick();
    const forward = [...host.querySelectorAll("button")]
      .filter((el) => el.textContent === "10")
      .at(-1)!;
    await act(async () => forward.click());
    await tick();
    await paint();
    await act(async () => finishFirst(response(0)));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(response(10).dataUrl);
    await click("Odbicie");
    expect(button("Odbicie").textContent).toContain("Klatka 11");
  });

  it("blocks wrong indices, wrong timestamps and frame read failures", async () => {
    native.load.mockResolvedValueOnce(response(2));
    await tick();
    expect(button("Odbicie").disabled).toBe(true);
    expect(host.textContent).toContain("Nie można odczytać dokładnej klatki");
    native.load.mockResolvedValueOnce({ ...response(0), actualTimeSeconds: 9 });
    await click("Ponów");
    await tick();
    expect(button("Odbicie").disabled).toBe(true);
    native.load.mockRejectedValueOnce(new Error("decode failed"));
    await click("Ponów");
    await tick();
    expect(button("Odbicie").disabled).toBe(true);
    await click("Ponów");
    await tick();
    await paint();
    expect(button("Odbicie").disabled).toBe(false);
  });

  it("clears both markers when trimming removes them", async () => {
    await tick();
    await paint();
    await click("Odbicie");
    await click("Lądowanie");
    const forward = [...host.querySelectorAll("button")]
      .filter((el) => el.textContent === "10")
      .at(-1)!;
    await act(async () => forward.click());
    await tick();
    await paint();
    await click("Początek klipu");
    expect(button("Odbicie").textContent).toContain("Brak");
    expect(button("Lądowanie").textContent).toContain("Brak");
  });

  it("retains only markers inside either trim boundary", () => {
    const markers = {
      firstFrame: 100,
      secondFrame: 220,
      trimStartFrame: 0,
      trimEndFrame: 1599,
      firstGuidePosition: 0.5,
      secondGuidePosition: 0.5,
    };
    expect(trimMarkers(markers, 230, 400)).toMatchObject({ firstFrame: null, secondFrame: null });
    expect(trimMarkers(markers, 0, 90)).toMatchObject({ firstFrame: null, secondFrame: null });
    expect(trimMarkers(markers, 100, 220)).toMatchObject({ firstFrame: 100, secondFrame: 220 });
  });

  it("places guides inside the image rectangle for letterbox and pillarbox", () => {
    expect(containedVideoRect(400, 600, 1920, 1080)).toEqual({
      left: 0,
      top: 187.5,
      width: 400,
      height: 225,
    });
    expect(containedVideoRect(600, 400, 1080, 1920)).toEqual({
      left: 187.5,
      top: 0,
      width: 225,
      height: 400,
    });
  });
});
