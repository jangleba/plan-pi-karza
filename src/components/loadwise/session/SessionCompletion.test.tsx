// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionCompletion } from "@/lib/loadwise/types";
import { CompletionPanel, MatchStartPanel } from "./SessionCompletion";
import { sessionFixture } from "./testFixtures";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  start: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  state: {
    profile: { healthPersonalizationEnabled: true },
    completions: {} as Record<string, SessionCompletion>,
  },
}));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: mocks.state,
    completeSession: mocks.complete,
    startSession: mocks.start,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

let host: HTMLDivElement;
let root: Root;
function saveButton() {
  return [...host.querySelectorAll("button")].find((item) =>
    /Oznacz jako wykonane|Zaktualizuj wpis|Zapisywanie/.test(item.textContent ?? ""),
  )!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.complete.mockReset().mockResolvedValue(undefined);
  mocks.start.mockReset().mockResolvedValue(undefined);
  mocks.success.mockReset();
  mocks.error.mockReset();
  mocks.state.profile.healthPersonalizationEnabled = true;
  mocks.state.completions = {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("session completion", () => {
  it("preserves monitoring notes and actual club load while a save is pending", async () => {
    const session = sessionFixture({ dayType: "club" });
    mocks.state.completions["session-1"] = {
      completed: true,
      rpe: 8,
      notes: "[Monitoring] pain=3;legFatigue=7\nCiężkie nogi",
      durationMin: 73,
      activityType: "technical",
    };
    let resolveSave!: () => void;
    mocks.complete.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    await act(async () => root.render(<CompletionPanel session={session} />));
    expect(host.querySelector("textarea")?.value).toBe("Ciężkie nogi");
    await act(async () => saveButton().click());
    expect(saveButton().disabled).toBe(true);
    expect(mocks.complete).toHaveBeenCalledWith(
      session,
      8,
      "[Monitoring] pain=3;legFatigue=7\nCiężkie nogi",
      { durationMin: 73, activityType: "technical" },
    );
    await act(async () => resolveSave());
    expect(saveButton().disabled).toBe(false);
    expect(mocks.success).toHaveBeenCalledWith("Wpis został zaktualizowany.");
  });

  it("excludes health notes without consent while retaining RPE and duration", async () => {
    mocks.state.profile.healthPersonalizationEnabled = false;
    mocks.state.completions["session-1"] = {
      completed: false,
      rpe: 5,
      notes: "[Monitoring] pain=4;legFatigue=5\nPrywatna notatka",
    };
    const session = sessionFixture();
    await act(async () => root.render(<CompletionPanel session={session} />));
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).not.toContain("Prywatna notatka");
    await act(async () => saveButton().click());
    expect(mocks.complete).toHaveBeenCalledWith(session, 5, "", { durationMin: 45 });
  });

  it("allows retry after a completion save fails", async () => {
    mocks.complete.mockRejectedValueOnce(new Error("offline"));
    await act(async () => root.render(<CompletionPanel session={sessionFixture()} />));
    await act(async () => saveButton().click());
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().click());
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("starts a match only on its day and displays an already started match", async () => {
    const session = sessionFixture({ dayType: "match" });
    await act(async () => root.render(<MatchStartPanel session={session} isToday={false} />));
    expect(host.querySelector("button")).toBeNull();
    expect(host.textContent).toContain("Zaplanowany mecz");
    await act(async () => root.render(<MatchStartPanel session={session} isToday />));
    await act(async () => host.querySelector("button")!.click());
    expect(mocks.start).toHaveBeenCalledWith(session);
    mocks.state.completions["session-1"] = {
      completed: false,
      status: "started",
      rpe: null,
      notes: "",
    };
    await act(async () => root.render(<MatchStartPanel session={session} isToday={false} />));
    expect(host.textContent).toContain("Mecz rozpoczęty");
    expect(host.querySelector("button")).toBeNull();
  });
});
