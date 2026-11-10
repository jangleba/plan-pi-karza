// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingSection } from "@/lib/loadwise/types";
import { FocusedSessionRunner } from "./FocusedSessionRunner";
import { sectionFixture } from "./testFixtures";

const logs = vi.hoisted(() => ({ save: vi.fn(), current: {} as Record<number, unknown> }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("../ExerciseRunnerScreen", () => ({ ExerciseRunnerScreen: () => null }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { plan: [], modifications: {}, profile: null, readiness: {}, completions: {} },
    todayIso: "2026-11-10",
  }),
}));
vi.mock("@/lib/loadwise/setLogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loadwise/setLogs")>()),
  useExerciseSetLogs: () => ({
    current: logs.current,
    previous: {},
    recentSessions: [],
    loading: false,
    saveSet: logs.save,
  }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  for (const key of Object.keys(logs.current)) delete logs.current[Number(key)];
  logs.save.mockReset().mockImplementation(async (log: { setNumber: number }) => {
    logs.current[log.setNumber] = log;
    return true;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const sections: TrainingSection[] = [
  sectionFixture("warmup", [
    { id: "w1", exerciseId: "ankling", name: "Ankling", sets: "1", reps: "2 × 10 m" },
    { id: "w2", name: "Wypad z rotacją", sets: "1", reps: "5 / stronę" },
  ]),
  sectionFixture("main", [
    {
      id: "m1",
      exerciseId: "glute_bridge",
      name: "Most biodrowy",
      sets: "2",
      reps: "10",
      restAfterExercise: "60 s",
    },
  ]),
];

const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];
const byText = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
const count = () => host.querySelector(".bw-runner-count")?.textContent ?? "";
const title = () => host.querySelector(".bw-runner-card h2 .bw-runner-name")?.textContent;

async function render(canRecord: boolean, onStart = vi.fn()) {
  await act(async () =>
    root.render(
      <FocusedSessionRunner
        sections={sections}
        date="2026-11-10"
        kind="general"
        canRecord={canRecord}
        onFinish={() => undefined}
        start={{ label: "Rozpocznij trening", busy: false, error: null, onStart }}
      />,
    ),
  );
}

describe("ekran treningu", () => {
  it("podgląd: lista planu bez pól wpisu, jedna główna akcja startu", async () => {
    const onStart = vi.fn();
    await render(false, onStart);
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).not.toMatch(/będzie dostępny po rozpoczęciu/);
    expect(host.querySelectorAll(".bw-rplan-row")).toHaveLength(3);
    expect(host.querySelector("iframe")).toBeNull();
    await act(async () => byText("Rozpocznij trening")!.click());
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("start prowadzi do rozgrzewki; przejście dalej i pominięcie nie oznaczają wykonania", async () => {
    await render(true);
    expect(title()).toBe("Ankling");
    await act(async () => byText("Pomiń")!.click());
    expect(count()).toContain("Wykonane 0 z 3");
    expect(count()).toContain("pominięte 1");
    expect(title()).toBe("Wypad z rotacją");
    await act(async () =>
      buttons()
        .find((b) => b.textContent?.includes("Następne"))!
        .click(),
    );
    expect(title()).toBe("Most biodrowy");
    expect(count()).toContain("Wykonane 0 z 3");
    // Pominięte można przywrócić.
    await act(async () =>
      buttons()
        .find((b) => b.textContent?.includes("Poprzednie"))!
        .click(),
    );
    await act(async () =>
      buttons()
        .find((b) => b.textContent?.includes("Poprzednie"))!
        .click(),
    );
    await act(async () => byText("Wróć do ćwiczenia")!.click());
    expect(count()).not.toContain("pominięte");
  });

  it("jednostronne ćwiczenie: lewa, potem prawa; podwójne kliknięcie nie zapisuje dwa razy", async () => {
    await render(true);
    await act(async () =>
      buttons()
        .find((b) => b.textContent?.includes("Następne"))!
        .click(),
    );
    expect(title()).toBe("Wypad z rotacją");
    expect(host.querySelector(".bw-bouts")?.textContent).toContain("Lewa");
    await act(async () => byText("Lewa wykonana")!.click());
    expect(count()).toContain("Wykonane 0 z 3");
    const last = buttons().find((b) => b.textContent?.startsWith("Prawa wykonana"))!;
    await act(async () => {
      last.click();
      last.click();
    });
    expect(count()).toContain("Wykonane 1 z 3");
  });

  it("zwinięcie instrukcji zachowuje zapisane serie i odliczanie przerwy", async () => {
    await render(true);
    for (let i = 0; i < 2; i += 1)
      await act(async () =>
        buttons()
          .find((b) => b.textContent?.includes("Następne"))!
          .click(),
      );
    expect(title()).toBe("Most biodrowy");
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="Seria 1: powtórzenia"]');
    expect(reps).not.toBeNull();
    {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(reps, "10");
        reps!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () =>
        host.querySelector<HTMLButtonElement>('button[aria-label="Zatwierdź serię 1"]')!.click(),
      );
      expect(logs.save).toHaveBeenCalledTimes(1);
    }
    const toggle = buttons().find((b) => b.textContent?.includes("Jak wykonać"))!;
    await act(async () => toggle.click());
    await act(async () => toggle.click());
    expect(title()).toBe("Most biodrowy");
    expect(count()).toContain("Wykonane 0 z 3");
    expect(host.querySelector('button[aria-label="Seria 1 zapisana"]')).not.toBeNull();
    // Zatwierdzona seria uruchomiła przerwę; zwinięcie jej nie zatrzymało.
    expect(host.querySelector(".bw-rest-card")).not.toBeNull();
  });
});
