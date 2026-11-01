// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraRecorder } from "./CameraRecorder";
const capture = vi.hoisted(() => ({ open: vi.fn(), record: vi.fn(), stop: vi.fn() }));
vi.mock("./camera", () => ({
  openLabCamera: capture.open,
  recordLabCamera: capture.record,
  stopCamera: capture.stop,
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  capture.open
    .mockReset()
    .mockResolvedValue({ stream: { getVideoTracks: () => [] }, settings: { frameRate: 60 } });
  capture.record.mockReset().mockReturnValue({ finished: new Promise(() => {}), stop: vi.fn() });
  capture.stop.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () =>
    root.render(
      <CameraRecorder
        title="Test"
        instruction="Telefon nieruchomo"
        onRecording={vi.fn()}
        onCancel={vi.fn()}
      />,
    ),
  );
}
describe("camera setup and countdown", () => {
  it("uses the selected ten-second setup delay and fifteen-second clip length", async () => {
    await mount();
    const delay = document.querySelector<HTMLSelectElement>('[aria-label="Opóźnienie startu"]')!;
    const length = document.querySelector<HTMLSelectElement>('[aria-label="Długość nagrania"]')!;
    await act(async () => {
      delay.value = "10";
      delay.dispatchEvent(new Event("change", { bubbles: true }));
      length.value = "15";
      length.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const start = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Start",
    )!;
    await act(async () => start.click());
    expect(document.querySelector(".bl-camera-count")?.textContent).toBe("10");
    await act(async () => vi.advanceTimersByTime(9000));
    expect(capture.record).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(capture.record.mock.calls[0][3]).toBe(15);
    expect(document.querySelector(".bl-camera-status")?.textContent).toContain("/ 15 s");
  });
  it("does not start a recording after leaving during the countdown", async () => {
    await mount();
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === "Start")!
        .click(),
    );
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTime(15000));
    expect(capture.record).not.toHaveBeenCalled();
    expect(capture.stop).toHaveBeenCalled();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
