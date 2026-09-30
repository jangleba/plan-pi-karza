// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityExitOptions } from "@/components/loadwise/ActivityExitGuard";
import type { MatchPlayer, UserPlan } from "./types";
import { scenarios } from "./scenarios";
import { FootballIQMatch } from "./FootballIQMatch";

const mocks = vi.hoisted(() => ({ guard: null as ActivityExitOptions | null }));
vi.mock("@/components/loadwise/ActivityExitGuard", () => ({
  useActivityExitGuard: (options: ActivityExitOptions) => {
    mocks.guard = options;
    return { requestExit: (action: () => void) => action() };
  },
}));
vi.mock("./Pitch", () => ({
  Pitch: ({
    players,
    plan,
    pausedAt,
    onPlanChange,
  }: {
    players: MatchPlayer[];
    plan: UserPlan;
    pausedAt?: number | null;
    onPlanChange: (plan: UserPlan) => void;
  }) => (
    <button
      data-paused={pausedAt != null}
      onClick={() => {
        const player = players.find((item) => item.team === "home" && !item.goalkeeper)!;
        onPlanChange({
          ...plan,
          actions: [
            {
              id: "movement",
              type: "run",
              order: 0,
              moves: [
                {
                  playerId: player.id,
                  from: { x: player.x, y: player.y },
                  to: { x: player.x + 5, y: player.y + 5 },
                },
              ],
            },
          ],
        });
      }}
    >
      Zaplanuj ruch
    </button>
  ),
}));
let host: HTMLDivElement;
let root: Root;
const complete = vi.fn();
async function click(label: string) {
  const target = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  expect(target).toBeDefined();
  await act(async () => target!.click());
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function beginPlan() {
  await click("Rozpocznij");
  for (let step = 0; step < 3; step++) await advance(620);
  await advance(scenarios[0].observationMs);
  await click("Zaplanuj ruch");
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  complete.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(<FootballIQMatch showOnboardingInitially={false} onComplete={complete} />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Football IQ activity workspace", () => {
  it("guards only an unfinished plan and resumes the decision timer from its remaining time", async () => {
    expect(mocks.guard?.dirty).toBe(false);
    await beginPlan();
    expect(mocks.guard?.dirty).toBe(true);
    await advance(500);
    await act(async () => mocks.guard?.pause?.());
    expect(host.querySelector('[data-paused="true"]')).not.toBeNull();
    await advance(5000);
    expect(host.textContent).toContain(`${scenarios[0].decisionSeconds}s`);
    await act(async () => mocks.guard?.resume?.());
    await advance(499);
    expect(host.textContent).toContain(`${scenarios[0].decisionSeconds}s`);
    await advance(1);
    expect(host.textContent).toContain(`${scenarios[0].decisionSeconds - 1}s`);
  });
  it("pauses playback, evaluates once after resuming, and releases the dirty guard", async () => {
    await beginPlan();
    await click("Wybierz cel");
    await act(async () =>
      (host.querySelector('input[value="switch"]') as HTMLInputElement).click(),
    );
    await click("Odtwórz");
    const half = scenarios[0].playbackMs / 2;
    await advance(half);
    await act(async () => mocks.guard?.pause?.());
    await advance(scenarios[0].playbackMs * 2);
    expect(complete).not.toHaveBeenCalled();
    await act(async () => mocks.guard?.resume?.());
    await advance(half - 1);
    expect(complete).not.toHaveBeenCalled();
    await advance(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(mocks.guard?.dirty).toBe(false);
    expect(host.textContent).toContain("Reakcja rywala");
  });
});
