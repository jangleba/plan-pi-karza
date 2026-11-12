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
const containing = (text: string) => buttons().find((b) => b.textContent?.includes(text));
const count = () => host.querySelector(".bw-runner-count")?.textContent ?? "";
const title = () =>
  host.querySelector(".bw-unit-exercise-head h2 .bw-runner-name")?.textContent ?? undefined;
const tab = (name: string) =>
  host.querySelector<HTMLButtonElement>(`[role="tab"][id$="-${name}"]`)!;
const click = async (button: HTMLButtonElement | undefined) => act(async () => button!.click());

function runner(canRecord: boolean, onStart = vi.fn()) {
  return (
    <FocusedSessionRunner
      sections={sections}
      date="2026-11-10"
      kind="general"
      canRecord={canRecord}
      onFinish={() => undefined}
      start={{ label: "Rozpocznij trening", busy: false, error: null, onStart }}
    />
  );
}

async function render(canRecord: boolean, onStart = vi.fn()) {
  await act(async () => root.render(runner(canRecord, onStart)));
}

async function saveFirstSet() {
  const reps = host.querySelector<HTMLInputElement>('input[aria-label="Seria 1: powtórzenia"]');
  expect(reps).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(reps, "10");
    reps!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(host.querySelector<HTMLButtonElement>('button[aria-label="Zatwierdź serię 1"]')!);
  expect(logs.save).toHaveBeenCalledTimes(1);
}

describe("ekran treningu", () => {
  it("zapis serii: kolejna seria jest wypełniona, krokiem dodaje się powtórzenie, zapisaną można poprawić", async () => {
    await render(true);
    await click(byText("Następne"));
    await click(byText("Następne"));
    await saveFirstSet();
    const reps2 = () =>
      host.querySelector<HTMLInputElement>('input[aria-label="Seria 2: powtórzenia"]')!;
    expect(reps2().value).toBe("10");
    await click(
      host.querySelector<HTMLButtonElement>('button[aria-label="Seria 2: powtórzenia: więcej"]')!,
    );
    expect(reps2().value).toBe("11");
    await click(
      host.querySelector<HTMLButtonElement>('button[aria-label="Seria 1 zapisana, popraw"]')!,
    );
    expect(host.querySelector('button[aria-label="Zapisz poprawkę serii 1"]')).not.toBeNull();
    await click(byText("Anuluj"));
    expect(host.querySelector('button[aria-label="Zatwierdź serię 2"]')).not.toBeNull();
  });

  it("start z podglądu ćwiczenia otwiera trening na tym ćwiczeniu", async () => {
    const onStart = vi.fn();
    await render(false, onStart);
    await click(containing("Most biodrowy"));
    await click(byText("Rozpocznij trening"));
    expect(onStart).toHaveBeenCalledOnce();
    await render(true);
    expect(title()).toBe("Most biodrowy");
  });

  it("podgląd: płaska lista z dawkami, bez pól wpisu, jedna główna akcja startu", async () => {
    const onStart = vi.fn();
    await render(false, onStart);
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("details")).toBeNull();
    expect(host.textContent).not.toMatch(/będzie dostępny po rozpoczęciu/);
    expect(host.querySelectorAll(".bw-rplan-row")).toHaveLength(3);
    expect(host.querySelector(".bw-rplan-row small")?.textContent).toBeTruthy();
    expect(host.querySelector("iframe")).toBeNull();
    await click(byText("Rozpocznij trening"));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("podgląd: wybranie ćwiczenia pokazuje zakładki Trening i Technika; animacja tylko w Technice", async () => {
    await render(false);
    await click(containing("Most biodrowy"));
    expect(title()).toBe("Most biodrowy");
    expect(tab("trening").getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector(".bw-runner-facts")?.textContent).toContain("Odpoczynek60 s");
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("iframe")).toBeNull();
    await click(tab("technika"));
    expect(tab("technika").getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector(".bw-howto-panel")).not.toBeNull();
    await click(tab("trening"));
    expect(host.querySelector("iframe")).toBeNull();
    await click(containing("Lista ćwiczeń"));
    expect(host.querySelectorAll(".bw-rplan-row")).toHaveLength(3);
    // Start is reachable from the exercise view too.
    expect(byText("Rozpocznij trening")).toBeDefined();
  });

  it("start prowadzi do rozgrzewki; przejście dalej i pominięcie nie oznaczają wykonania", async () => {
    await render(true);
    expect(title()).toBe("Ankling");
    await click(byText("Pomiń"));
    expect(count()).toContain("Wykonane 0 z 3");
    expect(count()).toContain("pominięte 1");
    expect(title()).toBe("Wypad z rotacją");
    await click(byText("Następne"));
    expect(title()).toBe("Most biodrowy");
    expect(count()).toContain("Wykonane 0 z 3");
    // Pominięte można przywrócić.
    await click(byText("Poprzednie"));
    await click(byText("Poprzednie"));
    await click(byText("Wróć do ćwiczenia"));
    expect(count()).not.toContain("pominięte");
  });

  it("lista w trakcie: status, „Teraz” i powrót do ćwiczenia jednym dotknięciem", async () => {
    await render(true);
    await click(byText("Pomiń"));
    await click(containing("Lista ćwiczeń"));
    expect(title()).toBeUndefined();
    const marks = [...host.querySelectorAll(".bw-rplan-mark")].map((m) =>
      m.getAttribute("data-state"),
    );
    expect(marks).toEqual(["skipped", "open", "open"]);
    expect(host.querySelector(".bw-rplan-now")?.closest(".bw-rplan-row")?.textContent).toContain(
      "Wypad z rotacją",
    );
    await click(containing("Kontynuuj: Wypad z rotacją"));
    expect(title()).toBe("Wypad z rotacją");
    await click(containing("Lista ćwiczeń"));
    await click(containing("Most biodrowy"));
    expect(title()).toBe("Most biodrowy");
  });

  it("jednostronne ćwiczenie: lewa, potem prawa; podwójne kliknięcie nie zapisuje dwa razy", async () => {
    await render(true);
    await click(byText("Następne"));
    expect(title()).toBe("Wypad z rotacją");
    expect(host.querySelector(".bw-bouts")?.textContent).toContain("Lewa");
    await click(byText("Lewa wykonana"));
    expect(count()).toContain("Wykonane 0 z 3");
    const last = buttons().find((b) => b.textContent?.startsWith("Prawa wykonana"))!;
    await act(async () => {
      last.click();
      last.click();
    });
    expect(count()).toContain("Wykonane 1 z 3");
  });

  it("przełączanie zakładek zachowuje zapisane serie i odliczanie przerwy", async () => {
    await render(true);
    await click(byText("Następne"));
    await click(byText("Następne"));
    expect(title()).toBe("Most biodrowy");
    await saveFirstSet();
    await click(tab("technika"));
    expect(host.querySelector('input[aria-label="Seria 2: powtórzenia"]')).toBeNull();
    await click(tab("trening"));
    expect(title()).toBe("Most biodrowy");
    expect(count()).toContain("Wykonane 0 z 3");
    expect(host.querySelector('button[aria-label="Seria 1 zapisana, popraw"]')).not.toBeNull();
    expect(host.querySelector(".bw-rest-card")).not.toBeNull();
  });

  it("zamknięcie i ponowne otwarcie panelu wraca do tego samego ćwiczenia z serią i przerwą", async () => {
    await render(true);
    await click(byText("Następne"));
    await click(byText("Następne"));
    await saveFirstSet();
    const restBefore = host.querySelector(".bw-rest-clock")?.textContent;
    expect(restBefore).toBeTruthy();
    // Closing the panel unmounts the runner.
    await act(async () => root.render(<div />));
    expect(host.querySelector(".bw-runner")).toBeNull();
    await act(async () => root.render(runner(true)));
    expect(title()).toBe("Most biodrowy");
    expect(host.querySelector('button[aria-label="Seria 1 zapisana, popraw"]')).not.toBeNull();
    // The rest keeps counting to its end time.
    expect(host.querySelector(".bw-rest-card")).not.toBeNull();
    expect(host.querySelector(".bw-rest-clock")?.textContent).toBe(restBefore);
    // The list view is remembered as well.
    await click(containing("Lista ćwiczeń"));
    await act(async () => root.render(<div />));
    await act(async () => root.render(runner(true)));
    expect(title()).toBeUndefined();
    expect(host.querySelector(".bw-rest-card")).not.toBeNull();
  });
});
