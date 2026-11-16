// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingFieldBoard } from "./TrainingFieldBoard";
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const click = (name: string) => {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  act(() => button.click());
};

describe("step-by-step field explanation", () => {
  it("highlights pass, reception and carrying in their actual order without autoplay", () => {
    act(() =>
      root.render(
        <TrainingFieldBoard
          exercise={{ id: "wall-1", exerciseId: "football_wall_receive_turn", name: "Ściana" }}
        />,
      ),
    );
    expect(host.querySelector("animateMotion")).toBeNull();
    expect(host.querySelector('[data-field-active="true"]')).toBeNull();
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe("Ustawienie z piłką");
    click("Krok 2: Podaj");
    expect(host.querySelector('[data-field-route="pass"]')?.getAttribute("data-field-active")).toBe(
      "true",
    );
    expect(
      host.querySelector('[data-field-route="receive"]')?.getAttribute("data-field-active"),
    ).toBe("false");
    click("Krok 3: Przyjmij");
    expect(host.querySelector('[data-field-route="pass"]')?.getAttribute("data-field-active")).toBe(
      "false",
    );
    expect(
      host.querySelector('[data-field-route="receive"]')?.getAttribute("data-field-active"),
    ).toBe("true");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("obróć");
    click("Krok 4: Prowadź");
    expect(
      host.querySelector('[data-field-route="carry"]')?.getAttribute("data-field-active"),
    ).toBe("true");
    expect(host.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe(
      "Krok 4: Prowadź",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows only prescribed sprint distances with a text legend, never a football", () => {
    act(() =>
      root.render(
        <TrainingFieldBoard
          exercise={{
            id: "sprint-1",
            name: "Sprint lotny",
            exerciseId: "flying_sprint",
            engineDose: {
              sets: 4,
              distanceM: 15,
              runInM: 20,
              runOutM: 25,
              restSeconds: 240,
              intent: "explosive",
            },
          }}
        />,
      ),
    );
    expect(host.querySelector('[aria-label="Odległości z planu"]')?.textContent).toContain(
      "20 m nabiegu15 m pracy25 m wolnego wybiegu",
    );
    expect(host.querySelector('[aria-label="Legenda schematu"]')?.textContent).toContain(
      "Bieg bez piłki",
    );
    expect(host.querySelector('[aria-label="Piłka"]')).toBeNull();
    click("Krok 3: Sprint");
    expect(host.querySelector('[data-field-route="work"]')?.getAttribute("data-field-active")).toBe(
      "true",
    );
  });

  it("resets the explanation when a different exercise replaces the current one", () => {
    act(() =>
      root.render(
        <TrainingFieldBoard
          exercise={{ id: "one", name: "Ściana", exerciseId: "football_wall_receive_turn" }}
        />,
      ),
    );
    click("Krok 4: Prowadź");
    act(() =>
      root.render(
        <TrainingFieldBoard
          exercise={{ id: "two", name: "Podanie", exerciseId: "football_target_pass" }}
        />,
      ),
    );
    expect(host.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe(
      "Krok 1: Ustaw",
    );
    expect(host.querySelector('[data-field-active="true"]')).toBeNull();
  });
});
