// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionFixture } from "./testFixtures";
import { SessionStartPanel } from "./SessionStartPanel";

const mock = vi.hoisted(() => ({ start: vi.fn(), completions: {} as Record<string, unknown> }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ state: { completions: mock.completions }, startSession: mock.start }),
}));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.start.mockReset().mockResolvedValue(undefined);
  mock.completions = {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("explicit workout start", () => {
  it("pins a workout only after an explicit start, rather than opening its preview", async () => {
    const session = sessionFixture();
    await act(async () => root.render(<SessionStartPanel session={session} canStart />));
    expect(mock.start).not.toHaveBeenCalled();
    await act(async () => {
      container.querySelector("button")!.click();
    });
    expect(mock.start).toHaveBeenCalledOnce();
    expect(mock.start).toHaveBeenCalledWith(session);
  });
  it("does not offer a new start on another day", async () => {
    await act(async () =>
      root.render(<SessionStartPanel session={sessionFixture()} canStart={false} />),
    );
    expect(container.querySelector("button")).toBeNull();
    expect(mock.start).not.toHaveBeenCalled();
  });
  it("keeps the start recoverable after a failed durable save", async () => {
    mock.start.mockRejectedValue(new Error("disk full"));
    await act(async () => root.render(<SessionStartPanel session={sessionFixture()} canStart />));
    await act(async () => {
      container.querySelector("button")!.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
      /Nie udało się rozpocząć/,
    );
    expect(container.querySelector("button")!.disabled).toBe(false);
  });
  it("does not replace an already-started or completed session with another start", async () => {
    mock.completions = { "session-1": { status: "started", completed: false } };
    await act(async () => root.render(<SessionStartPanel session={sessionFixture()} canStart />));
    expect(container.querySelector("button")).toBeNull();
    mock.completions = { "session-1": { status: "completed", completed: true } };
    await act(async () => root.render(<SessionStartPanel session={sessionFixture()} canStart />));
    expect(container.textContent).toBe("");
    expect(mock.start).not.toHaveBeenCalled();
  });
});
