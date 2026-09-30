// @vitest-environment jsdom
import { act, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  type AnyRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityExitProvider, useActivityExitGuard } from "./ActivityExitGuard";

type DraftState = { dirty: boolean; busy: boolean };
const callbacks = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(), childClosed: vi.fn() };
let initialState: DraftState;
let setDraft!: Dispatch<SetStateAction<DraftState>>;
let router: AnyRouter;
let host: HTMLDivElement;
let root: Root;

function PristineChild({ close }: { close: () => void }) {
  const guard = useActivityExitGuard({ dirty: false });
  return (
    <>
      <button type="button" onClick={() => guard.requestExit(close)}>
        Close pristine child
      </button>
      <button
        type="button"
        onClick={() =>
          guard.requestExit(() => {
            void router.navigate({ to: "/start" });
          }, "route")
        }
      >
        Exit entire route
      </button>
    </>
  );
}

function Activity() {
  const [draft, updateDraft] = useState(initialState);
  const [childOpen, setChildOpen] = useState(true);
  setDraft = updateDraft;
  useActivityExitGuard({
    ...draft,
    description: "Niezapisany wynik testu.",
    pause: callbacks.pause,
    resume: callbacks.resume,
    dispose: callbacks.dispose,
  });
  return (
    <>
      <p data-draft>{draft.dirty ? "unsaved" : "persisted"}</p>
      <Link to="/start">Navigate to start</Link>
      {childOpen && (
        <PristineChild
          close={() => {
            callbacks.childClosed();
            setChildOpen(false);
          }}
        />
      )}
    </>
  );
}

async function mount(state: DraftState = { dirty: true, busy: false }, browserHistory = false) {
  initialState = state;
  const rootRoute = createRootRoute({
    component: () => (
      <ActivityExitProvider>
        <Outlet />
      </ActivityExitProvider>
    ),
  });
  const start = createRoute({
    getParentRoute: () => rootRoute,
    path: "/start",
    component: () => <h1>Start destination</h1>,
  });
  const plan = createRoute({ getParentRoute: () => rootRoute, path: "/plan", component: Activity });
  const history = browserHistory
    ? (() => {
        window.history.replaceState(undefined, "", "/start");
        const browser = createBrowserHistory();
        browser.push("/plan");
        browser.flush();
        return browser;
      })()
    : createMemoryHistory({ initialEntries: ["/start", "/plan"], initialIndex: 1 });
  router = createRouter({
    routeTree: rootRoute.addChildren([start, plan]),
    history,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  await router.load();
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(router.state.location.pathname).toBe("/plan");
}

function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

async function click(text: string) {
  const control = [
    ...document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a"),
  ].find((item) => item.textContent?.trim() === text);
  expect(control, `Missing action: ${text}`).toBeDefined();
  await act(async () => control!.click());
}

async function update(state: DraftState) {
  await act(async () => setDraft(state));
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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  callbacks.pause.mockReset();
  callbacks.resume.mockReset();
  callbacks.dispose.mockReset();
  callbacks.childClosed.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  router?.history.destroy();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("activity exit integration", () => {
  it("blocks a route link, pauses work, resumes on Stay, and disposes once before an approved exit", async () => {
    await mount();
    await click("Navigate to start");
    expect(router.state.location.pathname).toBe("/plan");
    expect(dialog()?.textContent).toContain("Niezapisany wynik testu.");
    expect(callbacks.pause).toHaveBeenCalledOnce();
    expect(callbacks.dispose).not.toHaveBeenCalled();
    await click("Zostań");
    expect(dialog()).toBeNull();
    expect(callbacks.resume).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe("/plan");
    await click("Navigate to start");
    await click("Odrzuć i przejdź");
    expect(router.state.location.pathname).toBe("/start");
    expect(host.textContent).toContain("Start destination");
    expect(callbacks.dispose).toHaveBeenCalledOnce();
  });

  it("guards browser history and leaves the current location intact after cancellation", async () => {
    await mount({ dirty: true, busy: false }, true);
    await act(async () => {
      router.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(dialog()).not.toBeNull();
    expect(router.state.location.pathname).toBe("/plan");
    await click("Zostań");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(router.history.location.pathname).toBe("/plan");
    await act(async () => {
      router.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await click("Odrzuć i przejdź");
    expect(router.state.location.pathname).toBe("/start");
    expect(callbacks.dispose).toHaveBeenCalledOnce();
  });

  it("dismisses a pristine child without prompting for its dirty parent, while later route navigation still prompts", async () => {
    await mount();
    await click("Close pristine child");
    expect(callbacks.childClosed).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
    expect(callbacks.pause).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/plan");
    await click("Navigate to start");
    expect(dialog()).not.toBeNull();
    expect(callbacks.pause).toHaveBeenCalledOnce();
    await click("Zostań");
  });

  it("uses route scope for an explicit exit and does not prompt twice after confirmation", async () => {
    await mount();
    await click("Exit entire route");
    expect(dialog()).not.toBeNull();
    expect(callbacks.pause).toHaveBeenCalledOnce();
    await click("Odrzuć i przejdź");
    expect(router.state.location.pathname).toBe("/start");
    expect(dialog()).toBeNull();
    expect(callbacks.pause).toHaveBeenCalledOnce();
    expect(callbacks.dispose).toHaveBeenCalledOnce();
  });

  it("prevents exit during a save and proceeds only after both busy and dirty clear", async () => {
    await mount({ dirty: true, busy: true });
    await click("Navigate to start");
    expect(dialog()?.textContent).toContain("Trwa zapisywanie");
    const discard = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Odrzuć i przejdź",
    );
    expect(discard?.disabled).toBe(true);
    await click("Odrzuć i przejdź");
    expect(callbacks.dispose).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/plan");
    await update({ dirty: false, busy: true });
    expect(router.state.location.pathname).toBe("/plan");
    expect(dialog()?.textContent).toContain("Trwa zapisywanie");
    await update({ dirty: false, busy: false });
    expect(router.state.location.pathname).toBe("/start");
    expect(dialog()).toBeNull();
    expect(callbacks.dispose).toHaveBeenCalledOnce();
  });

  it("retains a failed save as dirty work and resumes the draft when the user stays", async () => {
    await mount({ dirty: true, busy: true });
    await click("Navigate to start");
    await update({ dirty: true, busy: false });
    expect(router.state.location.pathname).toBe("/plan");
    expect(dialog()?.textContent).toContain("Niezapisany wynik testu.");
    expect(callbacks.dispose).not.toHaveBeenCalled();
    await click("Zostań");
    expect(dialog()).toBeNull();
    expect(callbacks.resume).toHaveBeenCalledOnce();
    expect(host.querySelector("[data-draft]")?.textContent).toBe("unsaved");
  });

  it("does not prompt or discard when progress is already persisted", async () => {
    await mount({ dirty: false, busy: false });
    await click("Navigate to start");
    expect(router.state.location.pathname).toBe("/start");
    expect(dialog()).toBeNull();
    expect(callbacks.pause).not.toHaveBeenCalled();
    expect(callbacks.dispose).not.toHaveBeenCalled();
  });

  it("protects reload only while dirty or busy work remains", async () => {
    await mount({ dirty: false, busy: true }, true);
    const busyUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(busyUnload);
    expect(busyUnload.defaultPrevented).toBe(true);
    await update({ dirty: true, busy: false });
    const dirtyUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);
    await update({ dirty: false, busy: false });
    const savedUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedUnload);
    expect(savedUnload.defaultPrevented).toBe(false);
    expect(callbacks.dispose).not.toHaveBeenCalled();
  });
});
