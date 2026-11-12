// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingSection } from "@/lib/loadwise/types";
import { FocusedSessionRunner } from "./FocusedSessionRunner";

vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("../ExerciseDetailSheet", () => ({ ExerciseDetailSheet: () => null }));
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
    current: [],
    previous: [],
    recentSessions: [],
    loading: false,
    saveSet: vi.fn().mockResolvedValue(true),
  }),
}));

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
  it("pokazuje parę jako dwa kafelki na jednym ekranie, a Następne przechodzi do kolejnego ćwiczenia", async () => {
    const withSingle: TrainingSection[] = [
      {
        ...sections[0],
        blocks: [
          ...sections[0].blocks,
          {
            id: "c",
            title: "C",
            blockType: "single",
            intent: "strength",
            exercises: [
              {
                id: "c1",
                exerciseId: "glute_bridge",
                name: "Most biodrowy",
                sets: "2",
                reps: "10",
                restAfterExercise: "60 s",
              },
            ],
          },
        ],
      },
    ];
    await act(async () =>
      root.render(
        <FocusedSessionRunner
          sections={withSingle}
          date="2026-11-10"
          kind="strength"
          canRecord
          onFinish={() => undefined}
        />,
      ),
    );
    const linked = host.querySelector(".bw-runner-linked")!;
    expect(host.querySelector(".bw-unit-exercise-head .bw-runner-eyebrow")?.textContent).toContain(
      "Seria kontrastowa",
    );
    const tiles = [...linked.querySelectorAll(".bw-runner-tile")];
    expect(tiles.map((t) => t.querySelector("h2")?.textContent)).toEqual([
      "A1Przysiad goblet",
      "A2Lądowanie snap-down",
    ]);
    expect(tiles[0].textContent).toContain("Potem A2 po 60 s.");
    expect(tiles[1].textContent).toContain("Przerwa 2–4 min, potem znowu A1.");
    // A pair shows its pair rest once, never a separate per-exercise rest line.
    expect(linked.textContent).not.toMatch(/Odpoczynek/);
    // No "why" explanations, only what to do.
    expect(linked.textContent).not.toMatch(/mięśnie|ponieważ|dlaczego/i);
    // Power work is described by a quality criterion, strength work by RIR once.
    // The RIR target appears once; the table only has an entry column for it.
    expect(tiles[0].querySelector(".bw-runner-facts")?.textContent).toContain("Zapas2–3 powt.");
    expect(tiles[0].textContent?.match(/RIR/g)).toBeNull();
    expect(tiles[0].querySelector(".bw-runner-dose")?.textContent).toBe("3 × 5");
    expect(tiles[1].textContent).not.toMatch(/Zapas|RIR/);
    const next = [...host.querySelectorAll<HTMLButtonElement>(".bw-runner-nav button")].find((b) =>
      b.textContent?.includes("Następne"),
    )!;
    await act(async () => next.click());
    expect(host.querySelector(".bw-runner-linked")).toBeNull();
    expect(host.querySelector(".bw-unit-exercise-head h2")?.textContent).toBe("Most biodrowy");
    expect(host.querySelector(".bw-runner-facts")?.textContent).toContain("Odpoczynek60 s");
    // Moving on is not a mark.
    expect(host.querySelector(".bw-runner-count strong")?.textContent).toBe("0");
  });
});
