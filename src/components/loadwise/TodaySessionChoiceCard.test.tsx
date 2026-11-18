// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TodaySessionChoiceCard } from "./TodaySessionChoiceCard";
import { sessionFixture } from "./session/testFixtures";
import { gymAthlete } from "@/lib/loadwise/engineV2/testFixtures";
import { ENGINE_VERSION } from "@/lib/loadwise/engineV2/model";
import { TODAY_TIME_CHOICE_REASON } from "@/lib/loadwise/todaySessionTimeChoice";
import type { SessionDay, SessionModification } from "@/lib/loadwise/types";
import type { LoadwiseContextValue } from "@/lib/loadwise/store/model";

const mocks = vi.hoisted(() => ({ useLoadwise: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: mocks.useLoadwise }));
vi.mock("@/lib/loadwise/todaySessionTimeChoice", async (original) => ({
  ...(await original<typeof import("@/lib/loadwise/todaySessionTimeChoice")>()),
  prepareTodayTimeChoice: mocks.prepare,
}));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

let root: Root, host: HTMLDivElement;
let props: ComponentProps<typeof TodaySessionChoiceCard>;
let store: Pick<LoadwiseContextValue, "state" | "applyModification" | "undoModification">;
let full: SessionDay, limited: SessionDay;
const today = "2026-11-16";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  full = sessionFixture({
    date: today,
    dayDbId: "day",
    planDbId: "plan",
    durationMin: 80,
    generatorVersion: ENGINE_VERSION,
    engineV2: { roles: ["strengthA"], sessionDurationMode: "full", exercises: [] } as never,
  });
  limited = {
    ...full,
    durationMin: 42,
    checkinTimeBudgetMin: 45,
    engineV2: { ...full.engineV2!, sessionDurationMode: "limited" },
  };
  store = {
    state: {
      profile: gymAthlete,
      plan: [full],
      completions: {},
      readiness: {},
      modifications: {},
    } as LoadwiseContextValue["state"],
    applyModification: vi.fn(async () => {}),
    undoModification: vi.fn(async () => {}),
  };
  mocks.useLoadwise.mockImplementation(() => store);
  mocks.prepare.mockReturnValue({
    proposal: {
      day: limited,
      session: limited,
      minutes: 45,
      beforeMinutes: 80,
      afterMinutes: 42,
      changes: ["Wiosłowanie: 3 serie → 2 serie."],
      fingerprint: "source",
    },
  });
  props = { plan: [full], todayIso: today, onOpenPlan: vi.fn() };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async (next: Partial<typeof props> = {}) => {
  props = { ...props, ...next };
  await act(async () => root.render(<TodaySessionChoiceCard {...props} />));
};
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((item) => item.textContent === name)!;
const click = async (name: string) => act(async () => button(name).click());

it("defaults to the saved full session without writing or answering health questions", async () => {
  await render();
  expect(host.textContent).toContain("Pełna sesja");
  expect(host.querySelector('[aria-pressed="true"]')).not.toBeNull();
  expect(host.querySelectorAll("input")).toHaveLength(0);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(store.applyModification).not.toHaveBeenCalled();
  expect(store.state.readiness).toEqual({});
});

it("requires a preview and an explicit save, changing only today's day", async () => {
  await render();
  await click("Zmień");
  expect(button("Zastosuj na dziś")).toBeUndefined();
  expect(store.applyModification).not.toHaveBeenCalled();
  await click("Sprawdź wariant");
  expect(mocks.prepare).toHaveBeenCalledWith(
    expect.objectContaining({ date: today, sessionId: full.dbId, minutes: 45 }),
  );
  expect(host.textContent).toContain("80 → 42 min");
  expect(host.textContent).toContain("Wiosłowanie");
  expect(store.applyModification).not.toHaveBeenCalled();
  await click("Zastosuj na dziś");
  expect(store.applyModification).toHaveBeenCalledWith(
    today,
    "swap",
    limited,
    full,
    expect.stringContaining(TODAY_TIME_CHOICE_REASON),
  );
  expect(store.state.readiness).toEqual({});
  expect(store.undoModification).not.toHaveBeenCalled();
});

it("cancel leaves the full plan untouched", async () => {
  await render();
  await click("Zmień");
  await click("Sprawdź wariant");
  await click("Zostaw plan");
  expect(store.applyModification).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Pełna sesja");
});

it("retains the preview after a save failure so the athlete can retry", async () => {
  vi.mocked(store.applyModification).mockRejectedValueOnce(new Error("Brak połączenia"));
  await render();
  await click("Zmień");
  await click("Sprawdź wariant");
  await click("Zastosuj na dziś");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Brak połączenia");
  expect(button("Zastosuj na dziś").disabled).toBe(false);
  await click("Zastosuj na dziś");
  expect(store.applyModification).toHaveBeenCalledTimes(2);
});

it("does not save a preview when the source plan changes", async () => {
  await render();
  await click("Zmień");
  await click("Sprawdź wariant");
  await render({ plan: [{ ...full, durationMin: 81 }] });
  expect(button("Zastosuj na dziś").disabled).toBe(true);
  await click("Zastosuj na dziś");
  expect(store.applyModification).not.toHaveBeenCalled();
});

it("restores only its own sole time modification through existing undo", async () => {
  store.state.modifications[today] = [
    {
      id: "daily",
      type: "swap",
      reason: `${TODAY_TIME_CHOICE_REASON} 45 min`,
    } as SessionModification,
  ];
  await render({ plan: [limited] });
  expect(host.textContent).toContain("Limit czasu na dziś");
  await click("Zmień");
  expect(button("Sprawdź wariant")).toBeUndefined();
  await click("Przywróć jednostkę z planu");
  expect(store.undoModification).toHaveBeenCalledWith(today, "daily");
  expect(store.applyModification).not.toHaveBeenCalled();
});

it("preserves other manual modifications", async () => {
  store.state.modifications[today] = [
    { id: "manual", type: "swap", reason: "Trening zastępczy" } as SessionModification,
  ];
  await render();
  await click("Zmień");
  expect(host.textContent).toContain("Ten dzień ma już zapisaną zmianę");
  expect(button("Sprawdź wariant")).toBeUndefined();
  expect(button("Przywróć jednostkę z planu")).toBeUndefined();
  await click("Otwórz plan");
  expect(props.onOpenPlan).toHaveBeenCalledOnce();
  expect(store.undoModification).not.toHaveBeenCalled();
});

it("never calls a legacy limited recipe a full session", async () => {
  const legacy = { ...limited, engineV2: { ...limited.engineV2!, sessionDurationMode: undefined } };
  await render({ plan: [legacy] });
  expect(host.textContent).not.toContain("Pełna sesja");
  expect(host.textContent).toContain("Zapisana jednostka");
  expect(host.querySelector('[aria-pressed="false"]')).not.toBeNull();
});

it("reports an unavailable complete minimum without a fake preview or save", async () => {
  mocks.prepare.mockReturnValue({ error: "Wymagane zadania nie mieszczą się w 20 min." });
  await render();
  await click("Zmień");
  await click("Sprawdź wariant");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("nie mieszczą");
  expect(button("Zastosuj na dziś")).toBeUndefined();
  expect(store.applyModification).not.toHaveBeenCalled();
});
