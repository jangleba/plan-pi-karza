// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnduranceRunTracker } from "./EnduranceRunTracker";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";

vi.mock("@/lib/running/intervals", async (original) => ({
  ...(await original<object>()),
  deriveRunningIntervalProtocol: () => null,
}));
const mocks = {
  first: vi.fn(),
  watch: vi.fn(),
  clear: vi.fn(),
  release: vi.fn(),
  wake: vi.fn(),
  speechCancel: vi.fn(),
};
let host: HTMLDivElement;
let root: Root;
let navigatorBefore: PropertyDescriptor | undefined;
let wakeBefore: PropertyDescriptor | undefined;
let speechBefore: PropertyDescriptor | undefined;
async function start() {
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Start GPS"))!
      .click(),
  );
}
const point = {
  coords: { latitude: 52, longitude: 21, accuracy: 5 },
  timestamp: Date.now(),
} as GeolocationPosition;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.values(mocks).forEach((mock) => mock.mockReset());
  navigatorBefore = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  wakeBefore = Object.getOwnPropertyDescriptor(navigator, "wakeLock");
  speechBefore = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.first, watchPosition: mocks.watch, clearWatch: mocks.clear },
  });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request: mocks.wake },
  });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { cancel: mocks.speechCancel },
  });
  mocks.watch.mockReturnValue(12);
  mocks.release.mockResolvedValue(undefined);
  mocks.wake.mockResolvedValue({ release: mocks.release });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        session={sessionFixture()}
        sessionId="session-1"
        date="2026-09-29"
        canRecord
        activity={null}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  if (navigatorBefore) Object.defineProperty(navigator, "geolocation", navigatorBefore);
  else delete (navigator as unknown as Record<string, unknown>).geolocation;
  if (wakeBefore) Object.defineProperty(navigator, "wakeLock", wakeBefore);
  else delete (navigator as unknown as Record<string, unknown>).wakeLock;
  if (speechBefore) Object.defineProperty(window, "speechSynthesis", speechBefore);
  else delete (window as unknown as Record<string, unknown>).speechSynthesis;
  vi.unstubAllGlobals();
});

describe("GPS task resource cleanup", () => {
  it("does not start a location watch after leaving while permission is pending", async () => {
    let accept!: PositionCallback;
    mocks.first.mockImplementation((callback: PositionCallback) => {
      accept = callback;
    });
    await start();
    await act(async () => root.render(null));
    await act(async () => accept(point));
    expect(mocks.watch).not.toHaveBeenCalled();
    expect(mocks.wake).not.toHaveBeenCalled();
  });

  it("stops GPS, screen wake lock and spoken commands when leaving an active recording", async () => {
    mocks.first.mockImplementation((callback: PositionCallback) => callback(point));
    await start();
    expect(host.textContent).toContain("Rejestracja GPS");
    expect(mocks.watch).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    expect(mocks.clear).toHaveBeenCalledWith(12);
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.speechCancel).toHaveBeenCalled();
  });
});
