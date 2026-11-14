// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartDashboard } from "./StartDashboard";

vi.mock("./PageHeader", () => ({ PageHeader: () => null }));
let root: Root, host: HTMLDivElement;
const props = { name: "Test", avatar: null, onPlan: vi.fn(), onLab: vi.fn(), onReaction: vi.fn() };
const button = (t: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as
    HTMLButtonElement | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("needs a confirmation, saves once, and offers nothing without an unstarted own session", async () => {
  const skip = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      <StartDashboard {...props} todayTitle="Siła A" planStatus="active" onSkipToday={skip} />,
    ),
  );
  await act(async () => button("Dziś nie mogę")!.click());
  expect(skip).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Nie przesuwamy jej na inny dzień");
  await act(async () => button("Potwierdź opuszczenie")!.click());
  expect(skip).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(<StartDashboard {...props} todayTitle="Siła A" planStatus="active" />),
  );
  expect(button("Dziś nie mogę")).toBeUndefined();
  await act(async () =>
    root.render(<StartDashboard {...props} planStatus="active" todayComplete onSkipToday={skip} />),
  );
  expect(button("Dziś nie mogę")).toBeUndefined();
});

it("a failed save is shown and the session is not reported as skipped", async () => {
  const skip = vi.fn().mockRejectedValue(new Error("Brak połączenia"));
  await act(async () =>
    root.render(
      <StartDashboard {...props} todayTitle="Siła A" planStatus="active" onSkipToday={skip} />,
    ),
  );
  await act(async () => button("Dziś nie mogę")!.click());
  await act(async () => button("Potwierdź opuszczenie")!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Brak połączenia");
  expect(button("Potwierdź opuszczenie")).toBeTruthy();
});
