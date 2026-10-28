// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  clear: vi.fn(),
  unsubscribe: vi.fn(),
}));
let listener: (event: AuthChangeEvent, session: Session | null) => void;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange(callback: typeof listener) {
        listener = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
      getSession: mocks.getSession,
      signInWithPassword: mocks.signIn,
    },
  },
}));
vi.mock("./legalStatus", () => ({ clearConsentStatusCache: mocks.clear }));

let root: Root;
let host: HTMLDivElement;
let snapshot: ReturnType<typeof useAuth>;
function Harness() {
  snapshot = useAuth();
  return <span>{snapshot.user?.id ?? "guest"}</span>;
}
function session(id: string): Session {
  return {
    user: { id } as User,
    access_token: "test",
    refresh_token: "test",
    expires_in: 3600,
    token_type: "bearer",
  };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.getSession.mockReset().mockReturnValue(new Promise(() => undefined));
  mocks.clear.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("authentication startup", () => {
  it("bounds a stalled password login without inventing a signed-in user", async () => {
    vi.useFakeTimers();
    mocks.signIn.mockReturnValue(new Promise(() => {}));
    try {
      await act(async () =>
        root.render(
          <AuthProvider>
            <Harness />
          </AuthProvider>,
        ),
      );
      const result = snapshot.signIn("player@example.test", "test-password");
      await act(async () => vi.advanceTimersByTimeAsync(15_000));
      expect((await result).error).toContain("trwa za długo");
      expect(snapshot.user).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("leaves the loading screen on timeout and accepts a later valid sign-in", async () => {
    vi.useFakeTimers();
    try {
      await act(async () =>
        root.render(
          <AuthProvider>
            <Harness />
          </AuthProvider>,
        ),
      );
      await act(async () => vi.advanceTimersByTimeAsync(12_000));
      expect(snapshot.loading).toBe(false);
      expect(snapshot.user).toBeNull();
      expect(snapshot.callbackError).toContain("trwa za długo");
      await act(async () => listener("SIGNED_IN", session("a")));
      expect(snapshot.user?.id).toBe("a");
      expect(snapshot.callbackError).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a rejected session read without leaving an unhandled rejection", async () => {
    mocks.getSession.mockRejectedValue(new Error("network"));
    await act(async () =>
      root.render(
        <AuthProvider>
          <Harness />
        </AuthProvider>,
      ),
    );
    expect(snapshot.loading).toBe(false);
    expect(snapshot.callbackError).toContain("Nie udało się");
  });
  it("finishes startup on sign-in even if the earlier session read is still pending", async () => {
    await act(async () =>
      root.render(
        <AuthProvider>
          <Harness />
        </AuthProvider>,
      ),
    );
    expect(snapshot.loading).toBe(true);
    await act(async () => listener("SIGNED_IN", session("a")));
    expect(snapshot.loading).toBe(false);
    expect(snapshot.user?.id).toBe("a");
  });
  it("keeps the user identity stable through token refresh, but accepts an actual profile update", async () => {
    await act(async () =>
      root.render(
        <AuthProvider>
          <Harness />
        </AuthProvider>,
      ),
    );
    await act(async () => listener("INITIAL_SESSION", session("a")));
    const previous = snapshot.user;
    await act(async () => listener("TOKEN_REFRESHED", session("a")));
    expect(snapshot.user).toBe(previous);
    const update = session("a");
    await act(async () => listener("USER_UPDATED", update));
    expect(snapshot.user).toBe(update.user);
  });
  it("a stale session read cannot undo a newer sign-in or restore a signed-out account", async () => {
    let resolve!: (value: unknown) => void;
    mocks.getSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () =>
      root.render(
        <AuthProvider>
          <Harness />
        </AuthProvider>,
      ),
    );
    await act(async () => listener("SIGNED_IN", session("b")));
    await act(async () => listener("SIGNED_OUT", null));
    await act(async () => resolve({ data: { session: session("a") } }));
    expect(snapshot.user).toBeNull();
    expect(snapshot.loading).toBe(false);
    expect(mocks.clear).toHaveBeenCalled();
  });
});
