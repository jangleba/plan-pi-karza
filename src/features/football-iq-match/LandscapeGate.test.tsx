// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LandscapeGate, useLandscape } from "./LandscapeGate";

let root: Root, host: HTMLDivElement;
const listeners = new Set<() => void>();
let landscape = true;
function Probe() {
  const ok = useLandscape();
  return <LandscapeGate active={!ok} />;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  landscape = true;
  listeners.clear();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return landscape;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("shows nothing on a screen on its side, and a notice when the phone is upright", async () => {
  await act(async () => root.render(<Probe />));
  expect(host.textContent).toBe("");
  landscape = false;
  await act(async () => listeners.forEach((fn) => fn()));
  expect(host.textContent).toContain("Obróć telefon poziomo");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  landscape = true;
  await act(async () => listeners.forEach((fn) => fn()));
  expect(host.textContent).toBe("");
});

it("an inactive gate renders nothing", async () => {
  await act(async () => root.render(<LandscapeGate active={false} />));
  expect(host.textContent).toBe("");
});
