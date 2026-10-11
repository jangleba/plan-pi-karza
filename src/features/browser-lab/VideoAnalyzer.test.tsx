// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoAnalyzer } from "./VideoAnalyzer";
import { buildJumpTimeline } from "./measurement";
import { attemptPlan } from "./protocols";
import type { OpenedVideo } from "./video";
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  decode: vi.fn(),
  camera: vi.fn(),
  record: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("./video", () => ({
  openJumpVideo: mocks.open,
  decodeJumpFrame: mocks.decode,
}));
vi.mock("./camera", () => ({
  openLabCamera: mocks.camera,
  recordLabCamera: mocks.record,
  stopCamera: mocks.stop,
}));
const timeline = buildJumpTimeline(
  Array.from({ length: 360 }, (_, cts) => ({
    cts,
    timescale: 240,
    duration: 1,
  })),
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
  [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
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
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="Pozycja w filmie"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, String(index));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const track = new EventTarget();
  mocks.camera.mockReset().mockResolvedValue({
    stream: { getVideoTracks: () => [track] },
    mimeType: "video/mp4",
    settings: { width: 1920, height: 1080, frameRate: 60 },
  });
  mocks.stop.mockReset();
  mocks.record.mockReset();
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
  vi.useRealTimers();
});
async function render(save = vi.fn()) {
  await act(async () =>
    root.render(
      <VideoAnalyzer
        attempt={attemptPlan(["cmj"])[0]}
        sessionId="session-123456"
        onSave={save}
      />,
    ),
  );
  return save;
}

describe("browser video measurement flow", () => {
  it("opens an in-app preview, counts down and imports the original recorded file", async () => {
    vi.useFakeTimers();
    let finish!: (file: File) => void;
    const recording = new File(["original recording"], "camera.mp4", {
      type: "video/mp4",
    });
    const stop = vi.fn(() => finish(recording));
    mocks.record.mockReturnValue({
      finished: new Promise<File>((resolve) => {
        finish = resolve;
      }),
      stop,
    });
    await render();
    await act(async () => button("Nagraj próbę").click());
    expect(mocks.camera).toHaveBeenCalledOnce();
    expect(host.querySelector("video")?.srcObject).not.toBeNull();
    expect(host.textContent).toContain("1920 × 1080 · 60 FPS");
    await act(async () => button("Start").click());
    expect(mocks.record).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(mocks.record).toHaveBeenCalledOnce();
    await act(async () => button("Zakończ nagranie").click());
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledWith(recording, expect.any(AbortSignal));
    expect(host.querySelector("canvas")).not.toBeNull();
    expect(host.querySelector("video")).toBeNull();
    expect(host.querySelector('[aria-label="Wynik próby"]')).toBeNull();
  });
  it("stops the camera when the countdown is cancelled and ignores a late camera", async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => button("Nagraj próbę").click());
    await act(async () => button("Start").click());
    await act(async () => button("Anuluj").click());
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalled();
    let finish!: (camera: unknown) => void;
    mocks.camera.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => button("Nagraj próbę").click());
    await act(async () => button("Anuluj").click());
    const late = { stream: {}, mimeType: "video/mp4", settings: {} };
    await act(async () => finish(late));
    expect(mocks.stop).toHaveBeenCalledWith(late);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(host.querySelector("video")).toBeNull();
  });
  it("retains a recording that fails validation and offers to save its original", async () => {
    await render();
    mocks.open.mockRejectedValueOnce(new Error("Niepoprawne czasy filmu"));
    await importFile();
    expect(button("Zachowaj nagranie")).toBeDefined();
    expect(host.textContent).toContain("Niepoprawne czasy filmu");
    expect(host.querySelector("canvas")).toBeNull();
  });
  it("cancels capture on a hidden page and leaves the import path accessible", async () => {
    await render();
    await act(async () => button("Nagraj próbę").click());
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(mocks.camera.mock.calls[0][0].aborted).toBe(true);
    expect(mocks.stop).toHaveBeenCalled();
    expect(host.textContent).toContain("Nagrywanie przerwane");
    await act(async () => button("Wróć").click());
    expect(button("Wybierz film").disabled).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("keeps the initial screen when system capture is cancelled", async () => {
    await render();
    const input = host.querySelector<HTMLInputElement>(
      'input[capture="environment"]',
    )!;
    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.open).not.toHaveBeenCalled();
    expect(host.querySelector("canvas")).toBeNull();
    expect(button("Nagraj próbę").disabled).toBe(false);
  });
  it("guides marking in order, blocks reversed events and switches to the result", async () => {
    await render();
    await importFile();
    expect(
      host.querySelector<HTMLButtonElement>('[aria-pressed="false"]')?.disabled,
    ).toBe(true);
    await go(60);
    await act(async () => button("Oznacz wybicie").click());
    expect(button("Oznacz lądowanie").disabled).toBe(true);
    await go(59);
    expect(button("Oznacz lądowanie").disabled).toBe(true);
    await go(164);
    await act(async () => button("Oznacz lądowanie").click());
    expect(host.querySelector<HTMLElement>(".bl-frame-card")?.hidden).toBe(
      true,
    );
    expect(
      host.querySelector('[aria-label="Wynik próby"]')?.textContent,
    ).toContain("23,0 cm");
    expect(button("Zapisz wynik").disabled).toBe(true);
    await act(async () => button("Popraw oznaczenia").click());
    expect(host.querySelector<HTMLElement>(".bl-frame-card")?.hidden).toBe(
      false,
    );
    await act(async () => button("2. Lądowanie").click());
    expect(button("Oznacz lądowanie").disabled).toBe(false);
  });
  it("imports a 60 FPS recording, shows the limitation and saves the actual measurement", async () => {
    const lowTimeline = buildJumpTimeline(
      Array.from({ length: 120 }, (_, cts) => ({
        cts,
        timescale: 60,
        duration: 1,
      })),
    );
    mocks.open.mockResolvedValue({ ...video, timeline: lowTimeline });
    mocks.decode.mockImplementation(async (_video, index) => ({
      timestamp: lowTimeline.frames[index].timestampUs,
      displayWidth: 3840,
      displayHeight: 2160,
      close: vi.fn(),
    }));
    const save = await render();
    await importFile();
    expect(host.textContent).toContain("60.0 FPS");
    expect(host.querySelector("canvas")?.width).toBe(1280);
    expect(host.querySelector("canvas")?.height).toBe(720);
    await go(20);
    await act(async () => button("Oznacz wybicie").click());
    await go(44);
    await act(async () => button("Oznacz lądowanie").click());
    expect(host.textContent).toContain("orientacyjny");
    await act(async () => {
      host
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((input) => input.click());
    });
    await act(async () => button("Zapisz wynik").click());
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].fps).toBeCloseTo(60, 8);
    expect(save.mock.calls[0][0].primaryValue).toBeCloseTo(19.6133, 6);
    expect(host.textContent).toContain("ZAPISANO LOKALNIE");
  });
  it("blocks marking before the exact frame is painted and after a failed import", async () => {
    await render();
    mocks.decode.mockImplementation(() => new Promise(() => {}));
    await importFile();
    expect(button("Oznacz wybicie").disabled).toBe(true);
    expect(host.textContent).toContain("Odczyt dokładnej klatki");
    mocks.open.mockRejectedValue(
      new Error("Nie można odczytać oryginalnego filmu"),
    );
    await importFile();
    expect(host.textContent).toContain("Nie można odczytać oryginalnego filmu");
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
    expect(button("Zapisz wynik").disabled).toBe(true);
    await act(async () => {
      host
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((input) => input.click());
    });
    await act(async () => button("Zapisz wynik").click());
    expect(host.textContent).toContain("Safari nie zapisało historii");
    expect(host.textContent).not.toContain("ZAPISANO LOKALNIE");
    expect(button("Pobierz kopię tej próby")).toBeDefined();
    await act(async () => button("Zapisz wynik").click());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][0].id).toBe(save.mock.calls[1][0].id);
    expect(host.textContent).toContain("ZAPISANO LOKALNIE");
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(host.querySelector<HTMLElement>(".bl-frame-card")?.hidden).toBe(
      true,
    );
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
      finish({
        ...video,
        config: { codec: "hvc1.1.6" },
        timeline: { ...timeline, fps: 120 },
      }),
    );
    expect(host.textContent).toContain("240.0 FPS");
    expect(host.textContent).not.toContain("120.0 FPS");
  });
});
