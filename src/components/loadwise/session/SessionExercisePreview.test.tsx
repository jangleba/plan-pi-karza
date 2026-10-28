// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SessionExercisePreview } from "./SessionExercisePreview";
import { ExerciseRunnerScreen } from "../ExerciseRunnerScreen";
import { sectionFixture } from "./testFixtures";

const hooks = vi.hoisted(() => ({ history: vi.fn(), store: vi.fn() }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: hooks.store }));
vi.mock("@/lib/loadwise/setLogs", async (original) => ({
  ...(await original<typeof import("@/lib/loadwise/setLogs")>()),
  useExerciseSetLogs: hooks.history,
}));
vi.mock("../ExerciseDetailSheet", () => ({
  ExerciseDetailSheet: ({
    exercise,
    onOpenChange,
  }: {
    exercise: { name: string };
    onOpenChange: (v: boolean) => void;
  }) => (
    <div role="dialog">
      <span>{exercise.name}</span>
      <button onClick={() => onOpenChange(false)}>Zamknij</button>
    </div>
  ),
}));

it("opens and closes sprint and gym instructions without starting a runner or reading history", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <SessionExercisePreview
          sections={[
            sectionFixture("main", [
              { id: "sprint", name: "Sprint" },
              { id: "squat", name: "Przysiad" },
            ]),
          ]}
        />,
      ),
    );
    for (const [index, name] of ["Sprint", "Przysiad"].entries()) {
      await act(async () =>
        host.querySelectorAll<HTMLButtonElement>("button[aria-label]")[index].click(),
      );
      expect(host.querySelector('[role="dialog"]')?.textContent).toContain(name);
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click(),
      );
      expect(host.querySelector('[role="dialog"]')).toBeNull();
    }
    expect(hooks.history).not.toHaveBeenCalled();
    expect(hooks.store).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("does not mount any closed exercise runner hooks", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ExerciseRunnerScreen
          exercise={{ id: "squat", name: "Przysiad" }}
          open={false}
          onClose={() => {}}
        />,
      ),
    );
    expect(host.innerHTML).toBe("");
    expect(hooks.history).not.toHaveBeenCalled();
    expect(hooks.store).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
