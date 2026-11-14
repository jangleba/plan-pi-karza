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
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "completion-test" } }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

let host: HTMLDivElement;
let root: Root;
function saveButton() {
  return [...host.querySelectorAll("button")].find((item) =>
    /Zapisz trening|Zaktualizuj wpis|Zapisywanie/.test(item.textContent ?? ""),
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
  localStorage.clear();
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
  it("keeps the private note, drops legacy pain scores and preserves actual club load while a save is pending", async () => {
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
    // A real historical time is preserved (never rewritten to the 90-minute default).
    expect(mocks.complete).toHaveBeenCalledWith(session, 8, "Ciężkie nogi", {
      durationMin: 73,
      durationSource: "user",
      activityTags: ["technical"],
      activityType: "technical",
    });
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
    await minutes(45);
    await act(async () => saveButton().click());
    expect(mocks.complete).toHaveBeenCalledWith(session, 5, "", {
      durationMin: 45,
      durationSource: "user",
    });
  });

  it("allows retry after a completion save fails", async () => {
    mocks.complete.mockRejectedValueOnce(new Error("offline"));
    await act(async () => root.render(<CompletionPanel session={sessionFixture()} />));
    await minutes(30);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="RPE 7"]')!.click());
    await act(async () => saveButton().click());
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
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

async function minutes(value: number) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="Czas całej sesji w minutach"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      String(value),
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("does not invent RPE or copy planned minutes into a new completion", async () => {
  await act(async () =>
    root.render(<CompletionPanel session={sessionFixture({ durationMin: 50 })} />),
  );
  expect(saveButton().disabled).toBe(true);
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Czas całej sesji w minutach"]')!.value,
  ).toBe("");
  await minutes(12);
  // New answers use 1–10: there is no RPE 0 button for a new entry.
  expect(host.querySelector('[aria-label="RPE 0"]')).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="RPE 1"]')!.click());
  await act(async () => saveButton().click());
  expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), 1, expect.any(String), {
    durationMin: 12,
    durationSource: "user",
  });
});

function click(label: RegExp | string) {
  const el = [...host.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent === label : label.test(b.textContent ?? ""),
  )!;
  return act(async () => el.click());
}
function setInput(aria: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`[aria-label="${aria}"]`)!;
  return act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("club and match feedback", () => {
  it("completes a new club session without asking for time: 90 min club_default, multi-select tags", async () => {
    const session = sessionFixture({ dayType: "club" });
    await act(async () => root.render(<CompletionPanel session={session} />));
    expect(host.querySelector('[aria-label="Czas całej sesji w minutach"]')).toBeNull();
    expect(saveButton().disabled).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="RPE 6"]')!.click());
    // Nothing is pre-selected: an unanswered character stays "no data".
    expect(
      [...host.querySelectorAll("button[aria-pressed=true]")].map((b) => b.textContent),
    ).toEqual(["6"]);
    await click("Biegowy / wydolnościowy");
    await click("Taktyka / gra z piłką");
    await act(async () => saveButton().click());
    expect(mocks.complete).toHaveBeenCalledWith(session, 6, expect.any(String), {
      durationMin: 90,
      durationSource: "club_default",
      activityTags: ["running_endurance", "tactical_game"],
      activityType: "mixed",
    });
  });

  it("saves a club session with no tag and no RPE as missing data, not as a default", async () => {
    const session = sessionFixture({ dayType: "club" });
    await act(async () => root.render(<CompletionPanel session={session} />));
    await click(/Uzupełnię RPE później/);
    await act(async () => saveButton().click());
    expect(mocks.complete).toHaveBeenCalledWith(session, null, expect.any(String), {
      durationMin: 90,
      durationSource: "club_default",
      activityTags: [],
      activityType: null,
    });
  });

  it("requires played minutes for a match, accepts 0 and keeps them apart from session time", async () => {
    const session = sessionFixture({ dayType: "match" });
    await act(async () => root.render(<CompletionPanel session={session} />));
    // no whole-session time is asked for a match
    expect(host.querySelector('[aria-label="Czas całej sesji w minutach"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="RPE 7"]')!.click());
    expect(saveButton().disabled).toBe(true); // missing minutes
    for (const bad of ["-1", "181", "12.5", "abc"]) {
      await setInput("Rozegrane minuty meczu", bad);
      expect(saveButton().disabled).toBe(true);
    }
    await setInput("Rozegrane minuty meczu", "0");
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().click());
    expect(mocks.complete).toHaveBeenCalledWith(session, 7, expect.any(String), {
      activityTags: [],
      activityType: null,
      matchMinutesPlayed: 0,
    });
  });
});
it("allows missing RPE explicitly without substituting six", async () => {
  await act(async () => root.render(<CompletionPanel session={sessionFixture()} />));
  await minutes(20);
  const later = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Uzupełnię RPE później"),
  )!;
  await act(async () => later.click());
  await act(async () => saveButton().click());
  expect(mocks.complete.mock.calls[0][1]).toBeNull();
});
