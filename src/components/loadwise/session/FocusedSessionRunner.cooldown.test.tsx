// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusedSessionRunner } from "./FocusedSessionRunner";
import { sectionFixture } from "./testFixtures";

const execution = vi.hoisted(() => ({ markDone: vi.fn() }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/loadwise/useSessionExecution", () => ({
  useSessionExecution: () => ({
    done: {},
    markDone: execution.markDone,
    notice: null,
    available: true,
    cloud: true,
  }),
}));
vi.mock("@/lib/loadwise/setLogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loadwise/setLogs")>()),
  useExerciseSetLogs: () => ({ current: {}, previous: {}, loading: false, saveSet: vi.fn() }),
}));

let host: HTMLDivElement;
let root: Root;
const finished = vi.fn();
const cooldown = sectionFixture("cooldown", [
  { id: "walk", exerciseId: "sprint_cooldown_walk", name: "Spokojny marsz", duration: "1 s" },
  { id: "calf", exerciseId: "calf_wall_stretch", name: "Łydka", duration: "1 s" },
]);
function button(label: string) {
  const item = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!item) throw new Error(`Missing button: ${label}`);
  return item;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function tick(milliseconds: number) {
  await act(async () => vi.advanceTimersByTime(milliseconds));
}
async function render() {
  await act(async () =>
    root.render(
      <FocusedSessionRunner
        sections={[cooldown]}
        date="2026-11-16"
        canRecord
        onFinish={finished}
      />,
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
  window.localStorage.clear();
  execution.markDone.mockReset().mockResolvedValue(true);
  finished.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("wykonanie prowadzonego wyciszenia", () => {
  it("zapisuje tylko wykonane ćwiczenie, a pominięte pozostawia jako pominięte", async () => {
    await render();
    await click("Rozpocznij regenerację");
    await tick(11_000);
    // The walk and its prescribed ten-second rest are finished.
    expect(host.querySelector(".bw-prep-player h3")?.textContent).toBe("Łydka");
    await click("Pomiń ćwiczenie");
    await click("Potwierdź zakończenie");
    expect(execution.markDone.mock.calls).toEqual([["walk", true]]);
    expect(finished).toHaveBeenCalledOnce();
    await click("Pozostałe ćwiczenia");
    expect(host.querySelector('.bw-rplan-mark[data-state="skipped"]')).not.toBeNull();
  });

  it("pozostaje przy potwierdzeniu po błędzie zapisu i pozwala ponowić", async () => {
    execution.markDone.mockResolvedValueOnce(false).mockResolvedValue(true);
    await render();
    await click("Rozpocznij regenerację");
    await tick(12_000);
    await click("Potwierdź zakończenie");
    expect(finished).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Nie zapisano zestawu. Zachowano postęp do ponowienia.");
    expect(button("Potwierdź zakończenie").disabled).toBe(false);
    await click("Potwierdź zakończenie");
    expect(finished).toHaveBeenCalledOnce();
    expect(execution.markDone.mock.calls).toEqual([
      ["walk", true],
      ["walk", true],
      ["calf", true],
    ]);
  });
});
