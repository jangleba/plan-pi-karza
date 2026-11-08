// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingSection } from "@/lib/loadwise/types";
import { FocusedSessionRunner } from "./FocusedSessionRunner";

vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("../ExerciseDetailSheet", () => ({ ExerciseDetailSheet: () => null }));
vi.mock("../ExerciseRunnerScreen", () => ({ ExerciseRunnerScreen: () => null }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
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
  {
    id: "main",
    title: "Część główna",
    type: "main",
    blocks: [
      {
        id: "a",
        title: "BLOK A — KONTRAST",
        blockType: "contrast",
        intent: "power",
        exercises: [
          {
            id: "a1",
            label: "A1",
            exerciseId: "goblet_squat",
            name: "Przysiad z hantlą",
            sets: "3",
            reps: "5",
            rir: "2–3 RIR",
            restAfterExercise: "60 s do A2",
          },
          {
            id: "a2",
            label: "A2",
            exerciseId: "snap_down",
            name: "Lądowanie snap-down",
            sets: "3",
            reps: "3",
            restAfterPair: "2–4 min po parze",
          },
        ],
      },
    ],
  },
];

describe("serie łączone na ekranie sesji", () => {
  it("pokazuje metodę, parę A1 → A2 i to, co następuje po ćwiczeniu", async () => {
    await act(async () =>
      root.render(
        <FocusedSessionRunner
          sections={sections}
          date="2026-11-10"
          kind="strength"
          onFinish={() => undefined}
        />,
      ),
    );
    const linked = host.querySelector(".bw-focus-linked");
    expect(linked?.textContent).toContain("Seria kontrastowa");
    expect([...linked!.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "A1Przysiad goblet",
      "A2Lądowanie snap-down",
    ]);
    expect(linked!.querySelector('[aria-current="step"]')?.textContent).toContain("A1");
    expect(host.querySelector("h2")?.textContent).toBe("A1Przysiad goblet");
    expect(host.textContent).toContain("Potem A2 po 60 s.");
    const next = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Dalej"),
    )!;
    await act(async () => next.click());
    expect(host.textContent).toContain("Przerwa 2–4 min, potem znowu A1.");
    if (process.env.BW_DUMP) {
      await act(async () =>
        [...host.querySelectorAll("button")]
          .find((b) => b.textContent?.includes("Wstecz"))!
          .click(),
      );
      (await import("node:fs")).writeFileSync(process.env.BW_DUMP, host.innerHTML);
    }
  });
});
