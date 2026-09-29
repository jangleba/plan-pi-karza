// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDuplicateNavigationGuard } from "./useDuplicateNavigationGuard";

let host: HTMLDivElement;
let root: Root;
let now: number;
function Navigation() {
  useDuplicateNavigationGuard();
  return (
    <>
      <a href="#plan">
        <span>Plan</span>
      </a>
      <a href="#fuel">Fuel</a>
    </>
  );
}
function click(selector: string) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  host.querySelector(selector)!.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  now = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Navigation />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("duplicate navigation", () => {
  it("blocks only rapid repeats of the same destination, including nested targets", () => {
    expect(click("span")).toBe(false);
    now += 100;
    expect(click("span")).toBe(true);
    expect(click('a[href="#fuel"]')).toBe(false);
    now += 450;
    expect(click('a[href="#fuel"]')).toBe(false);
  });

  it("removes the document listener when the navigation runtime unmounts", async () => {
    expect(click("span")).toBe(false);
    await act(async () => root.render(<a href="#plan">Plan</a>));
    expect(click("a")).toBe(false);
  });
});
