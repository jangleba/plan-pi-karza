// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { SprintStructuredSections } from "./SprintRunner";
import { StrengthStructuredSections } from "./StrengthRunner";
import { StructuredSections } from "./GenericRunner";
import { sectionFixture, sessionFixture, sprintSectionsFixture } from "./testFixtures";

const mocks = vi.hoisted(() => ({ unavailable: vi.fn() }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ markEquipmentUnavailable: mocks.unavailable }),
}));
vi.mock("../MovementBlueprint", () => ({ MovementBlueprint: () => null }));
vi.mock("../ExerciseDetailSheet", () => ({
  ExerciseDetailSheet: () => null,
  resolveExerciseSheetViewModel: () => ({
    purpose: null,
    steps: [],
    cues: [],
    errors: [],
    equipment: "",
    replacement: "",
  }),
}));
vi.mock("../ExerciseRunnerScreen", () => ({
  ExerciseRunnerScreen: ({
    exercise,
    sessionId,
    open,
    onClose,
  }: {
    exercise: TrainingExercise;
    sessionId?: string;
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <button data-session-id={sessionId} data-exercise-id={exercise.id} onClick={onClose}>
        Zamknij runner
      </button>
    ) : null,
}));

let host: HTMLDivElement;
let root: Root;
const finish = vi.fn();
const progressKey = "loadwise:sprint-progress:user-1:session-1";

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function click(text: string) {
  await act(async () => button(text).click());
}

async function renderSprint(dbId = "session-1") {
  await act(async () =>
    root.render(
      <SprintStructuredSections
        sections={sprintSectionsFixture()}
        date="2026-09-29"
        session={sessionFixture({ dbId })}
        onFinish={finish}
      />,
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  finish.mockReset();
  mocks.unavailable.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("session runners", () => {
  it("keeps sprint guidance visible after completing a non-skip exercise", async () => {
    await renderSprint();
    expect(host.querySelectorAll(".bw-technique-guide")).toHaveLength(1);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Oznacz jako wykonane"]')!.click());
    expect(host.querySelector('[aria-label="Wykonane"]')).not.toBeNull();
    expect(host.querySelectorAll(".bw-technique-guide")).toHaveLength(1);
  });
  it("shows all four skip animation controls and short instructions without opening exercise details", async () => {
    window.localStorage.setItem(
      progressKey,
      JSON.stringify({ done: { ramp: true }, started: true, currentBlockIdx: 1 }),
    );
    await renderSprint();
    const cards = [...host.querySelectorAll<HTMLElement>(".bw-skip-card")];
    expect(cards).toHaveLength(4);
    expect(host.querySelectorAll(".bw-skip-rhythm")).toHaveLength(1);
    expect(host.textContent).not.toContain("1 Z DODATKOWYM ODBICIEM");
    expect(host.textContent).not.toContain("Brak ilustracji");
    for (const card of cards) {
      expect(card.querySelector(".bw-animation-open")?.textContent).toContain("Pokaż animację ruchu");
      expect(card.querySelector("iframe")).toBeNull();
      expect(card.querySelectorAll("li")).toHaveLength(3);
      expect(card.querySelector("details")).toBeNull();
      expect(card.textContent).not.toContain("Otwórz pełne szczegóły");
      expect(card.textContent).not.toContain("Zamiana bez sprzętu");
    }
    const completion = cards[0].querySelector<HTMLButtonElement>("[aria-pressed]")!;
    await act(async () => completion.click());
    expect(completion.getAttribute("aria-pressed")).toBe("true");
    expect(cards[0].querySelector(".bw-animation-card")).not.toBeNull();
    expect(cards[0].querySelectorAll("li")).toHaveLength(3);
    expect(button("Następny blok").disabled).toBe(true);
  });

  it("restores sprint progress and keeps another session's progress separate", async () => {
    const saved = { done: { ramp: true }, started: true, currentBlockIdx: 1 };
    window.localStorage.setItem(progressKey, JSON.stringify(saved));
    await renderSprint();
    expect(button("Następny blok").disabled).toBe(true);
    expect(host.querySelectorAll('[aria-label="Oznacz jako wykonane"]')).toHaveLength(4);
    expect(JSON.parse(window.localStorage.getItem(progressKey)!)).toEqual(saved);

    await renderSprint("session-2");
    expect(button("Rozpocznij blok").disabled).toBe(false);
    expect(host.querySelectorAll('[aria-label="Oznacz jako wykonane"]')).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(progressKey)!)).toEqual(saved);
  });

  it("requires every current sprint exercise before advancing or finishing", async () => {
    await renderSprint();
    await click("Rozpocznij blok");
    for (let index = 0; index < 8; index += 1) {
      const label = index === 7 ? "Zakończ sesję" : "Następny blok";
      expect(button(label).disabled).toBe(true);
      await act(async () => {
        host
          .querySelectorAll<HTMLButtonElement>('[aria-label="Oznacz jako wykonane"]')
          .forEach((item) => item.click());
      });
      expect(button(label).disabled).toBe(false);
      await click(label);
    }
    expect(finish).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Zakończ sesję");
    const saved = JSON.parse(window.localStorage.getItem(progressKey)!);
    expect(saved.currentBlockIdx).toBe(7);
    expect(Object.values(saved.done).every(Boolean)).toBe(true);
  });

  it("pauses, resumes, resets and cleans up the sprint rest timer", async () => {
    vi.useFakeTimers();
    await renderSprint();
    await click("Start");
    await act(async () => vi.advanceTimersByTime(1000));
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:02");
    await click("Pauza");
    await act(async () => vi.advanceTimersByTime(5000));
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:02");
    await click("Start");
    await act(async () => vi.advanceTimersByTime(2000));
    expect(host.querySelector('[role="timer"]')).toBeNull();
    await click("Start");
    await click("Reset");
    expect(host.querySelector('[role="timer"]')).toBeNull();
    await click("Start");
    await act(async () => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the first unfinished strength exercise and exposes completion on the final stage", async () => {
    const first = { id: "first", name: "Pierwsze", sets: "2", reps: "4" };
    const second = { id: "second", name: "Drugie", sets: "2", reps: "4" };
    const sections = [
      sectionFixture("main", [first, second]),
      sectionFixture("cooldown", [{ id: "last", name: "Koniec" }]),
    ];
    await act(async () =>
      root.render(
        <StrengthStructuredSections
          sections={sections}
          date="2026-09-29"
          sessionId="strength-1"
          onFinish={finish}
        />,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Oznacz jako wykonane: Pierwsze"]')!
        .click(),
    );
    await act(async () => host.querySelector<HTMLButtonElement>(".bw-exercise-open")!.click());
    expect(button("Zamknij runner").dataset.exerciseId).toBe("first");
    expect(button("Zamknij runner").dataset.sessionId).toBe("strength-1");
    await click("Zamknij runner");
    expect(host.textContent).toContain("Koniec");
    await click("Zakończ trening");
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("retains generic exercise completion when switching sections", async () => {
    const sections = [
      sectionFixture("warmup", [{ id: "warm", name: "Przygotowanie" }]),
      sectionFixture("main", [{ id: "main", name: "Ćwiczenie główne" }]),
    ];
    await act(async () =>
      root.render(<StructuredSections sections={sections} date="2026-09-29" />),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Oznacz jako wykonane"]')!.click(),
    );
    await click("Część główna1 ćwiczenie");
    expect(host.textContent).toContain("Ćwiczenie główne");
    await click("Przygotowanie ruchowe1 ćwiczenie");
    expect(host.querySelector('[aria-label="Wykonane"]')).not.toBeNull();
  });
});
