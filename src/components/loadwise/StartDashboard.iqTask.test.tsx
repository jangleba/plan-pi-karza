// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartDashboard } from "./StartDashboard";

let root: Root, host: HTMLDivElement;
const noop = () => {};
function render(
  iqTask?: { text: string; onDone: () => void },
  iqGoal?: { label: string; percent: number; onOpen: () => void },
  plan: Partial<
    Pick<
      ComponentProps<typeof StartDashboard>,
      "todayTitle" | "planStatus" | "todayComplete" | "onToday" | "onPlan"
    >
  > = {},
) {
  return act(async () =>
    root.render(
      <StartDashboard
        name="Jan"
        avatar={null}
        onPlan={noop}
        onLab={noop}
        onReaction={noop}
        iqTask={iqTask}
        iqGoal={iqGoal}
        {...plan}
      />,
    ),
  );
}
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

it("shows the Football IQ field task with a done button", async () => {
  const onDone = vi.fn();
  await render({ text: "Zanim dostaniesz piłkę, spójrz dwa razy przez ramię.", onDone });
  const card = host.querySelector('[aria-label="Zadanie na boisko z Football IQ"]');
  expect(card?.textContent).toContain("spójrz dwa razy przez ramię");
  const button = [...card!.querySelectorAll("button")].find((b) => b.textContent === "Zrobione");
  await act(async () => button!.click());
  expect(onDone).toHaveBeenCalledOnce();
});

it("shows no card without an open task", async () => {
  await render();
  expect(host.querySelector('[aria-label="Zadanie na boisko z Football IQ"]')).toBeNull();
});

it("shows the weakest Football IQ aim with its progress and a way to practise it", async () => {
  const onOpen = vi.fn();
  await render(undefined, { label: "Pressing", percent: 40, onOpen });
  const card = host.querySelector('[aria-label="Twój cel w Football IQ"]');
  expect(card?.textContent).toContain("Pressing");
  expect(card?.textContent).toContain("40% dobrych decyzji");
  const button = [...card!.querySelectorAll("button")].find((b) => b.textContent === "Ćwicz");
  await act(async () => button!.click());
  expect(onOpen).toHaveBeenCalledOnce();
  await render();
  expect(host.querySelector('[aria-label="Twój cel w Football IQ"]')).toBeNull();
});

it("offers the new training planner without fabricating a saved session", async () => {
  await render();
  const card = host.querySelector(".bw-plan-soon");
  expect(card?.textContent).toContain("Przygotuj swój plan");
  expect(card?.tagName).toBe("BUTTON");
});

it.each([
  ["expired", "Cykl zakończony", "Przygotuj kolejny plan na 4 tygodnie"],
  ["stale", "Plan wymaga aktualizacji", "Dostosuj go do aktualnego profilu"],
] as const)("routes the %s plan back to planning", async (planStatus, title, subtitle) => {
  const onPlan = vi.fn(),
    onToday = vi.fn();
  await render(undefined, undefined, { planStatus, todayTitle: "Stary trening", onPlan, onToday });
  const card = host.querySelector<HTMLButtonElement>(".bw-plan-soon")!;
  expect(card.textContent).toContain(title);
  expect(card.textContent).toContain(subtitle);
  expect(card.textContent).not.toContain("Stary trening");
  await act(async () => card.click());
  expect(onPlan).toHaveBeenCalledOnce();
  expect(onToday).not.toHaveBeenCalled();
});

it("opens the actionable session while retaining a separate Plan link", async () => {
  const onPlan = vi.fn(),
    onToday = vi.fn();
  await render(undefined, undefined, {
    planStatus: "active",
    todayTitle: "Druga sesja · spokojny bieg",
    onPlan,
    onToday,
  });
  const card = host.querySelector<HTMLButtonElement>(".bw-plan-soon")!;
  expect(card.textContent).toContain("Druga sesja · spokojny bieg");
  expect(card.textContent).toContain("Otwórz dzisiejszą sesję");
  await act(async () => card.click());
  expect(onToday).toHaveBeenCalledOnce();
  expect(onPlan).not.toHaveBeenCalled();
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".bw-home-section-line button")!.click(),
  );
  expect(onPlan).toHaveBeenCalledOnce();
});

it("offers the remaining plan after all today's sessions are complete", async () => {
  const onPlan = vi.fn(),
    onToday = vi.fn();
  await render(undefined, undefined, {
    planStatus: "active",
    todayTitle: "Ukończona sesja",
    todayComplete: true,
    onPlan,
    onToday,
  });
  const card = host.querySelector<HTMLButtonElement>(".bw-plan-soon")!;
  expect(card.textContent).toContain("Dzisiejsze sesje zakończone");
  expect(card.textContent).toContain("Zobacz kolejne dni planu");
  await act(async () => card.click());
  expect(onPlan).toHaveBeenCalledOnce();
  expect(onToday).not.toHaveBeenCalled();
});

it("shows a rest day for an active plan without a session", async () => {
  await render(undefined, undefined, { planStatus: "active" });
  expect(host.querySelector(".bw-plan-soon")?.textContent).toContain("Dzisiaj wolne");
});
