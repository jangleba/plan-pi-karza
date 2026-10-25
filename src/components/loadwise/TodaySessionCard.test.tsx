// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodaySessionCard } from "./TodaySessionCard";
import { sessionFixture } from "./session/testFixtures";
import type { SessionCompletion } from "@/lib/loadwise/types";

const today = "2026-10-21";
const session = sessionFixture({ date: today });
const started: SessionCompletion = {
  completed: false,
  status: "started",
  rpe: null,
  notes: "",
  startedAt: `${today}T00:00:00Z`,
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T00:15:00Z`));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("today's workout shortcut", () => {
  it("opens the exact second slot only when tapped and never claims a cloud save", async () => {
    const onOpen = vi.fn();
    const second = sessionFixture({ date: today, dbId: "second", title: "Druga sesja" });
    await act(async () =>
      root.render(
        <TodaySessionCard
          plan={[{ ...session, secondSession: second }]}
          completions={{ second: started }}
          todayIso={today}
          onOpen={onOpen}
        />,
      ),
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Wróć do treningu");
    expect(host.textContent).toContain("Druga sesja");
    expect(host.textContent).not.toMatch(/zapisano|zsynchronizowano/i);
    await act(async () => host.querySelector("button")!.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(today, 2);
  });

  it("removes a cross-midnight continuation at the grace deadline without a store update", async () => {
    vi.setSystemTime(new Date(`${today}T03:29:59Z`));
    const previous = sessionFixture({ date: "2026-10-20", dbId: "old", executionSlot: 2 });
    await act(async () =>
      root.render(
        <TodaySessionCard
          plan={[{ ...session, dayType: "rest" }]}
          completions={{
            old: { ...started, startedAt: "2026-10-20T23:30:00Z", executionSnapshot: previous },
          }}
          todayIso={today}
          onOpen={vi.fn()}
        />,
      ),
    );
    expect(host.textContent).toContain("Wróć do treningu");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(host.textContent).toContain("Dziś odpoczynek");
    expect(host.querySelector("button")).toBeNull();
  });

  it("opens safety guidance rather than offering a blocked workout start", async () => {
    const onOpen = vi.fn();
    await act(async () =>
      root.render(
        <TodaySessionCard
          plan={[{ ...session, loadLabelOverride: "Wstrzymaj trening" }]}
          completions={{ "session-1": started }}
          todayIso={today}
          onOpen={onOpen}
        />,
      ),
    );
    expect(host.textContent).toContain("Sprawdź zalecenia");
    expect(host.textContent).not.toContain("Wróć do treningu");
    await act(async () => host.querySelector("button")!.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(today, 1);
  });
});
