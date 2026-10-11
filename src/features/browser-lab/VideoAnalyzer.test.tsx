// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoAnalyzer } from "./VideoAnalyzer";
import { buildJumpTimeline } from "./measurement";
import { attemptPlan } from "./protocols";
import type { OpenedVideo } from "./video";
const mocks = vi.hoisted(() => ({ open: vi.fn(), decode: vi.fn() }));
vi.mock("./video", () => ({ openJumpVideo: mocks.open, decodeJumpFrame: mocks.decode }));
const timeline = buildJumpTimeline(
  Array.from({ length: 360 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
);
const video: OpenedVideo = {
  timeline,
  sourceName: "skok.mov",
  sourceHash: "a".repeat(64),
  sourceBytes: 10000,
  config: { codec: "avc1.640029" },
  rotation: 0,
  samples: [],
};
let host: HTMLDivElement;
let root: Root;
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
async function importFile() {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["x"], "skok.mov")],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function go(index: number) {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Pozycja w filmie"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      String(index),
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  mocks.open.mockReset().mockResolvedValue(video);
  mocks.decode.mockReset().mockImplementation(async (_video, index) => ({
    timestamp: timeline.frames[index].timestampUs,
    displayWidth: 160,
    displayHeight: 120,
    close: vi.fn(),
  }));
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
async function render(save = vi.fn()) {
  await act(async () =>
    root.render(
      <VideoAnalyzer attempt={attemptPlan(["cmj"])[0]} sessionId="session-123456" onSave={save} />,
    ),
  );
  return save;
}

describe("browser video measurement flow", () => {
  it("blocks marking before the exact frame is painted and after a failed import", async () => {
    await render();
    mocks.decode.mockImplementation(() => new Promise(() => {}));
    await importFile();
    expect(button("Oznacz wybicie").disabled).toBe(true);
    expect(host.textContent).toContain("Odczyt dokładnej klatki");
    mocks.open.mockRejectedValue(new Error("Film 60 FPS jest zablokowany"));
    await importFile();
    expect(host.textContent).toContain("60 FPS");
    expect(host.querySelector("canvas")).toBeNull();
    expect(host.textContent).not.toContain("PODGLĄD WYNIKU");
  });
  it("requires confirmations, reports a failed save, exports the draft and retries the same ID", async () => {
    const save = vi.fn().mockImplementationOnce(() => {
      throw new Error("Safari nie zapisało historii");
    });
    await render(save);
    await importFile();
    await go(60);
    await act(async () => button("Oznacz wybicie").click());
    await go(164);
    await act(async () => button("Oznacz lądowanie").click());
    expect(host.textContent).toContain("23,0 cm");
    expect(button("Zapisz poprawną próbę").disabled).toBe(true);
    await act(async () => {
      host
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((input) => input.click());
    });
    await act(async () => button("Zapisz poprawną próbę").click());
    expect(host.textContent).toContain("Safari nie zapisało historii");
    expect(host.textContent).not.toContain("ZAPISANO LOKALNIE");
    expect(button("Pobierz kopię tej próby")).toBeDefined();
    await act(async () => button("Zapisz poprawną próbę").click());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][0].id).toBe(save.mock.calls[1][0].id);
    expect(host.textContent).toContain("ZAPISANO LOKALNIE");
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(button("Oznacz wybicie").disabled).toBe(true);
  });
  it("ignores an import that finishes after cancellation and a newer import", async () => {
    let finish!: (v: OpenedVideo) => void;
    mocks.open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await importFile();
    await act(async () => button("Anuluj odczyt").click());
    await importFile();
    expect(host.textContent).toContain("240.0 FPS");
    await act(async () =>
      finish({ ...video, config: { codec: "hvc1.1.6" }, timeline: { ...timeline, fps: 120 } }),
    );
    expect(host.textContent).toContain("240.0 FPS");
    expect(host.textContent).not.toContain("120.0 FPS");
  });
});
