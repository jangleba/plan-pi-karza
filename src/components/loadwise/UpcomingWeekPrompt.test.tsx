// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  owner: "u",
  today: "2026-11-01",
  plan: [{ date: "2026-11-01", cycleId: "cycle" }],
  transitions: {} as Record<number, object>,
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: mock.owner } }) }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { plan: mock.plan, transitions: mock.transitions },
    todayIso: mock.today,
  }),
}));
vi.mock("@/lib/loadwise/effectivePlanSelector", () => ({
  selectPlanWeeks: () => [
    { startDate: "2026-10-26", endDate: "2026-11-01" },
    { startDate: "2026-11-02", endDate: "2026-11-08" },
  ],
}));
vi.mock("@/lib/loadwise/confirmedCalendar", () => ({
  transitionMatchesBlock: (_plan: unknown, transition: unknown) => Boolean(transition),
}));
vi.mock("./WeeklyGateSheet", () => ({
  WeeklyGateSheet: ({ onConfirmed }: { onConfirmed: () => void }) => (
    <button onClick={onConfirmed}>Potwierdź w teście</button>
  ),
}));
import { UpcomingWeekPrompt } from "./UpcomingWeekPrompt";
let owner = 0,
  root: Root,
  host: HTMLDivElement;
const onConfirmed = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mock.owner = `owner-${owner++}`;
  mock.today = "2026-11-01";
  mock.plan = [{ date: mock.today, cycleId: "cycle" }];
  mock.transitions = {};
  onConfirmed.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = () => act(async () => root.render(<UpcomingWeekPrompt onConfirmed={onConfirmed} />));
async function click(label: string) {
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === label)!
      .click();
  });
}
describe("Sunday weekly prompt", () => {
  it("opens automatically, keeps confirmation explicit and navigates to the confirmed week", async () => {
    await render();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Kolejny tydzień");
    expect(onConfirmed).not.toHaveBeenCalled();
    await click("Przygotuj tydzień");
    await click("Potwierdź w teście");
    expect(onConfirmed).toHaveBeenCalledWith("2026-11-02", 1);
  });
  it("does not nag after dismissal, but offers catch-up next day", async () => {
    await render();
    await click("Później");
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    mock.today = "2026-11-02";
    mock.plan = [{ date: mock.today, cycleId: "cycle" }];
    await render();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Potwierdź ten tydzień",
    );
  });
  it("waits for a plan that covers today instead of opening a stale cycle", async () => {
    mock.plan = [{ date: "2026-10-31", cycleId: "cycle" }];
    await render();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
