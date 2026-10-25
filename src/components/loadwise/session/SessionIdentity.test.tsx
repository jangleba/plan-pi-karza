// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { CompletionPanel } from "@/components/loadwise/session/SessionCompletion";
import { EnduranceRunTracker } from "@/components/running/EnduranceRunTracker";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";

const mocks = vi.hoisted(() => ({ complete: vi.fn(), watch: vi.fn(() => 1), clear: vi.fn() }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { profile: { healthPersonalizationEnabled: true }, completions: {} },
    completeSession: mocks.complete,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let root: Root, host: HTMLDivElement;
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
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (resolve: any) =>
        resolve({ coords: { latitude: 52, longitude: 21, accuracy: 3 }, timestamp: Date.now() }),
      watchPosition: mocks.watch,
      clearWatch: mocks.clear,
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.complete.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const button = (s: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(s))!;

test("REPRO: resets unsaved notes when session identity changes", async () => {
  const first = sessionFixture({ dbId: "one" }),
    second = sessionFixture({ dbId: "two" });
  await act(async () => root.render(<CompletionPanel session={first} />));
  const area = host.querySelector("textarea")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(area, "NOTATKA PIERWSZEJ SESJI");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(area.value).toBe("NOTATKA PIERWSZEJ SESJI");
  await act(async () => root.render(<CompletionPanel session={second} />));
  expect(host.querySelector("textarea")!.value).toBe("");
  await act(async () => button("Oznacz jako wykonane").click());
  expect(mocks.complete.mock.calls[0][0].dbId).toBe("two");
  expect(mocks.complete.mock.calls[0][2]).not.toContain("NOTATKA PIERWSZEJ SESJI");
});
test("REPRO: releases the old GPS watch when session identity changes", async () => {
  const props = {
    date: "2026-10-18",
    canRecord: true,
    activity: null,
    onSave: vi.fn(),
    onDelete: vi.fn(),
  };
  const s = sessionFixture({ sessionType: "Wytrzymałość" });
  await act(async () =>
    root.render(<EnduranceRunTracker {...props} session={s} sessionId="one" />),
  );
  const start = [...host.querySelectorAll("button")].find((b) =>
    /Rozpocznij|Start|Włącz GPS/.test(b.textContent ?? ""),
  );
  expect(start, host.textContent ?? "").toBeTruthy();
  await act(async () => start!.click());
  expect(mocks.watch).toHaveBeenCalled();
  await act(async () =>
    root.render(<EnduranceRunTracker {...props} session={{ ...s, dbId: "two" }} sessionId="two" />),
  );
  expect(mocks.clear).toHaveBeenCalled();
  expect([...host.querySelectorAll("button")].some((b) => /Pauza/.test(b.textContent ?? ""))).toBe(
    false,
  );
});
