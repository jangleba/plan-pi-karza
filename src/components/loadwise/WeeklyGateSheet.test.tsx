// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyGateSheet } from "./WeeklyGateSheet";

const confirmWeeklyTransition = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { plan: [], transitions: {} },
    confirmWeeklyTransition,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  confirmWeeklyTransition.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const days = () => [...document.querySelectorAll<HTMLButtonElement>("fieldset button")];
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(text),
  )!;

describe("wybór dnia meczu", () => {
  it("pokazuje dni tygodnia do dotknięcia i zapisuje jeden albo dwa mecze", async () => {
    const onConfirmed = vi.fn();
    await act(async () =>
      root.render(
        <WeeklyGateSheet
          open
          onOpenChange={() => undefined}
          weekNumber={1}
          nextWeekStart="2026-11-09"
          nextWeekEnd="2026-11-15"
          onConfirmed={onConfirmed}
        />,
      ),
    );
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(days().map((d) => d.textContent)).toEqual([
      "Pn9",
      "Wt10",
      "Śr11",
      "Cz12",
      "Pt13",
      "So14",
      "Nd15",
    ]);
    expect(button("Zapisz").disabled).toBe(true);
    await act(async () => days()[5].click());
    await act(async () => days()[2].click());
    expect(days().filter((d) => d.getAttribute("aria-pressed") === "true")).toHaveLength(2);
    await act(async () => button("Zapisz").click());
    expect(confirmWeeklyTransition).toHaveBeenCalledWith(1, ["2026-11-11", "2026-11-14"], false);
    expect(onConfirmed).toHaveBeenCalled();
  });

  it("drugie dotknięcie odznacza dzień, a tydzień bez meczu blokuje wybór", async () => {
    await act(async () =>
      root.render(
        <WeeklyGateSheet
          open
          onOpenChange={() => undefined}
          weekNumber={1}
          nextWeekStart="2026-11-09"
          nextWeekEnd="2026-11-15"
          onConfirmed={() => undefined}
        />,
      ),
    );
    await act(async () => days()[3].click());
    await act(async () => days()[3].click());
    expect(days().some((d) => d.getAttribute("aria-pressed") === "true")).toBe(false);
    await act(async () => button("Nie mam meczu").click());
    expect(days()[0].closest("fieldset")?.disabled).toBe(true);
    await act(async () => button("Zapisz").click());
    expect(confirmWeeklyTransition).toHaveBeenCalledWith(1, [], true);
  });
});
