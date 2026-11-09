// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartDashboard } from "./StartDashboard";

let root: Root, host: HTMLDivElement;
const noop = () => {};
function render(
  iqTask?: { text: string; onDone: () => void },
  iqGoal?: { label: string; percent: number; onOpen: () => void },
) {
  return act(async () =>
    root.render(
      <StartDashboard
        name="Jan"
        avatar={null}
        plan={[]}
        completions={{}}
        todayIso="2026-11-08"
        checkinComplete={false}
        busy={false}
        checkinDetail=""
        onCheckin={noop}
        onPlan={noop}
        onLab={noop}
        onReaction={noop}
        onOpen={noop}
        onPrepare={noop}
        iqTask={iqTask}
        iqGoal={iqGoal}
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
