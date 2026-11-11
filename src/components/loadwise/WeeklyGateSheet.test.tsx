// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyGateSheet } from "./WeeklyGateSheet";

const confirmWeeklyTransition = vi.fn();
const toastError = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({
  state: { plan: [], transitions: {} } as Record<string, unknown>,
}));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: store.state,
    confirmWeeklyTransition,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  store.state = { plan: [], transitions: {} };
  confirmWeeklyTransition.mockReset();
  confirmWeeklyTransition.mockResolvedValue({ saved: Promise.resolve() });
  toastError.mockClear();
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

  it("zapamiętuje dzień meczu z poprzedniego tygodnia i zaznacza go od razu", async () => {
    // Ostatni potwierdzony mecz był w sobotę 7 listopada.
    store.state = {
      plan: [{ date: "2026-11-07", dayType: "match" }],
      transitions: {},
      profile: { matchDate: null, matchDates: [], usualMatchDay: null },
    };
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
    const picked = days().filter((d) => d.getAttribute("aria-pressed") === "true");
    expect(picked.map((d) => d.textContent)).toEqual(["So14"]);
    await act(async () => button("Zapisz").click());
    expect(confirmWeeklyTransition).toHaveBeenCalledWith(1, ["2026-11-14"], false);
  });

  it("bez historii meczów bierze zwykły dzień meczu z profilu", async () => {
    store.state = {
      plan: [],
      transitions: {},
      profile: { matchDate: null, matchDates: [], usualMatchDay: 7 },
    };
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
    const picked = days().filter((d) => d.getAttribute("aria-pressed") === "true");
    expect(picked.map((d) => d.textContent)).toEqual(["Nd15"]);
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

  it("po błędzie pokazuje komunikat i odblokowuje przycisk zamiast wiecznego „Układamy…”", async () => {
    confirmWeeklyTransition.mockRejectedValue(
      new Error("Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie."),
    );
    const onConfirmed = vi.fn();
    await act(async () =>
      root.render(
        <WeeklyGateSheet
          open
          onOpenChange={() => undefined}
          weekNumber={1}
          nextWeekStart="2026-11-16"
          nextWeekEnd="2026-11-22"
          onConfirmed={onConfirmed}
        />,
      ),
    );
    await act(async () => days()[5].click());
    await act(async () => button("Zapisz").click());
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Sprawdź internet");
    expect(button("Zapisz").disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Układamy");
  });

  it("zamyka okno od razu, a błąd zapisu w tle zgłasza komunikatem", async () => {
    let failSave: (error: Error) => void = () => undefined;
    const saved = new Promise<void>((_, reject) => {
      failSave = reject;
    });
    confirmWeeklyTransition.mockResolvedValue({ saved });
    const onConfirmed = vi.fn();
    await act(async () =>
      root.render(
        <WeeklyGateSheet
          open
          onOpenChange={() => undefined}
          weekNumber={1}
          nextWeekStart="2026-11-16"
          nextWeekEnd="2026-11-22"
          onConfirmed={onConfirmed}
        />,
      ),
    );
    await act(async () => days()[5].click());
    await act(async () => button("Zapisz").click());
    // The week is shown before the server answers.
    expect(onConfirmed).toHaveBeenCalled();
    await act(async () => failSave(new Error("Zapis planu trwa za długo.")));
    expect(toastError).toHaveBeenCalledWith("Zapis planu trwa za długo.");
  });
});
