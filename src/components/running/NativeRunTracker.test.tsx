// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { EnduranceRunTracker } from "./EnduranceRunTracker";
import { sessionFixture } from "../loadwise/session/testFixtures";
import type { NativeRunState } from "@/lib/running/nativeRecorder";

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  resume: vi.fn(),
  finish: vi.fn(),
  clear: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  intervals: vi.fn(),
  start: vi.fn(),
}));
vi.mock("@/lib/running/nativeRecorder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/running/nativeRecorder")>()),
  nativeRunningAvailable: () => true,
  nativeRecorder: {
    getState: mock.get,
    resume: mock.resume,
    finish: mock.finish,
    clear: mock.clear,
    addListener: () => Promise.resolve({ remove: mock.remove }),
    updateIntervals: mock.intervals,
    start: mock.start,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let root: Root, host: HTMLDivElement;
const ownerId = "11111111-1111-4111-8111-111111111111",
  sessionId = "22222222-2222-4222-8222-222222222222";
const recovered: NativeRunState = {
  present: true,
  ownerId,
  sessionId,
  date: "2026-10-18",
  startedAt: "2026-10-18T10:00:00Z",
  durationSec: 300,
  distanceM: 1000,
  phase: "paused",
  recovered: true,
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  mock.get.mockResolvedValue(recovered);
  mock.resume.mockResolvedValue({ ...recovered, phase: "recording" });
  mock.finish.mockResolvedValue({ ...recovered, phase: "review" });
  mock.clear.mockResolvedValue({ present: false });
  mock.save.mockResolvedValue(undefined);
  mock.intervals.mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
it("shows the native recorder error instead of treating a string code as a GPS timeout", async () => {
  mock.get.mockResolvedValue({ present: false });
  mock.start.mockRejectedValue({
    code: "RUN_EXISTS",
    message: "Istnieje niezapisany szkic innej sesji.",
  });
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId={ownerId}
        sessionId={sessionId}
        session={sessionFixture()}
        date="2026-10-18"
        canRecord
        activity={null}
        onSave={mock.save}
        onDelete={vi.fn()}
      />,
    ),
  );
  await act(async () => button("Start GPS").click());
  expect(host.textContent).toContain("Istnieje niezapisany szkic innej sesji.");
  expect(host.textContent).not.toContain("GPS nie odpowiedział na czas");
});
it("preserves the unfinished native interval when finishing the run", async () => {
  mock.get.mockResolvedValue({
    ...recovered,
    phase: "recording",
    recovered: false,
    guideState: {
      started: true,
      complete: false,
      stepIndex: 0,
      stepStartedElapsedSec: 290,
      stepStartedDistanceM: 950,
    },
  });
  const session = sessionFixture({
    sessionType: "Wytrzymałość",
    sections: {
      warmup: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
      main: [{ name: "Bieg interwałowy", prescription: "4 × 2 min / 1 min" }],
    },
  });
  // Use the same typed running protocol consumed by the real tracker.
  const { deriveRunningIntervalProtocol } = await import("@/lib/running/intervals");
  expect(deriveRunningIntervalProtocol(session)?.steps.length).toBeGreaterThan(0);
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId={ownerId}
        sessionId={sessionId}
        session={session}
        date="2026-10-18"
        canRecord
        activity={null}
        onSave={mock.save}
        onDelete={vi.fn()}
      />,
    ),
  );
  await act(async () => button("Zakończ").click());
  expect(mock.intervals).toHaveBeenCalledWith(
    expect.objectContaining({
      intervalResults: [
        expect.objectContaining({ completed: false, durationSec: 10, distanceM: 50 }),
      ],
    }),
  );
  await act(async () => button("Zapisz bieg").click());
  expect(mock.save.mock.calls[0][0].intervalResults).toEqual([
    expect.objectContaining({ completed: false, durationSec: 10, distanceM: 50 }),
  ]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((value) => value.textContent?.trim() === label) ??
  [...host.querySelectorAll("button")].find((value) => value.textContent?.includes(label))!;
it("recovers the native draft, resumes through native GPS and clears only after successful save", async () => {
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId={ownerId}
        sessionId={sessionId}
        session={sessionFixture({ sessionType: "Wytrzymałość" })}
        date="2026-10-18"
        canRecord
        activity={null}
        onSave={mock.save}
        onDelete={vi.fn()}
      />,
    ),
  );
  expect(host.textContent).toContain("Odzyskano szkic");
  await act(async () => button("Wznów").click());
  expect(mock.resume).toHaveBeenCalledWith({ ownerId, sessionId });
  await act(async () => button("Zakończ").click());
  expect(mock.finish).toHaveBeenCalled();
  await act(async () => button("Zapisz bieg").click());
  expect(mock.save.mock.calls[0][0]).toMatchObject({
    distanceM: 1000,
    durationSec: 300,
    route: [],
    sessionId,
  });
  expect(mock.clear).toHaveBeenCalledWith({ ownerId, sessionId });
});
