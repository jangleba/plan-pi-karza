// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RunRouteMap } from "./RunRouteMap";
import type { RoutePoint } from "@/lib/running/types";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  setView: vi.fn(),
  fit: vi.fn(),
  tileError: null as null | (() => void),
}));
vi.mock("leaflet", () => ({
  default: {
    map: () => {
      mocks.create();
      return {
        remove: mocks.remove,
        setView: mocks.setView,
        fitBounds: mocks.fit,
        invalidateSize: vi.fn(),
      };
    },
    layerGroup: () => ({ addTo: () => ({ clearLayers: mocks.clear }) }),
    tileLayer: () => ({
      on: (_name: string, fn: () => void) => {
        mocks.tileError = fn;
        return { addTo: vi.fn() };
      },
    }),
    polyline: () => ({ addTo: vi.fn() }),
    circleMarker: () => ({ addTo: vi.fn() }),
    latLngBounds: (v: unknown) => v,
  },
}));
let root: Root, host: HTMLDivElement;
const point = (n: number): RoutePoint => ({
  lat: 52 + n * 0.0001,
  lng: 21,
  recordedAt: new Date(n * 1000).toISOString(),
  elapsedSec: n,
  accuracyM: 4,
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("shows a real single fix, updates the live route without rebuilding Leaflet, and distinguishes a tile failure", async () => {
  await act(async () => root.render(<RunRouteMap route={[]} />));
  expect(mocks.create).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Włącz lokalizację");
  await act(async () => root.render(<RunRouteMap route={[point(0)]} />));
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.setView).toHaveBeenCalled();
  await act(async () => root.render(<RunRouteMap route={[point(0), point(1), point(2)]} />));
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.remove).not.toHaveBeenCalled();
  await act(async () => {
    mocks.tileError?.();
    mocks.tileError?.();
    mocks.tileError?.();
  });
  expect(host.textContent).toContain("Podkład mapy niedostępny");
  expect(host.querySelector('[aria-label="Kształt trasy biegu"]')).toBeTruthy();
});
