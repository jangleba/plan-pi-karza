// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brokeredPreviewStorage } from "@/lib/loadwise/previewSessionStorage";
import { createClient } from "@supabase/supabase-js";
const host = "id-preview--de7e9c03-6af5-4ba0-9a0c-426417d42531.lovable.app";
const editor = { postMessage: vi.fn() };
beforeEach(() => {
  localStorage.clear();
  editor.postMessage.mockReset();
  vi.useFakeTimers();
  vi.stubGlobal("location", { hostname: host, ancestorOrigins: ["https://lovable.dev"] });
  vi.stubGlobal("parent", editor);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("preview session storage", () => {
  it("lets the real Supabase SDK complete sign-in before editor replication responds", async () => {
    editor.postMessage.mockImplementation((message) => {
      if (message.type !== "lovable-preview-auth:get") return;
      queueMicrotask(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: "https://lovable.dev",
            source: window.parent,
            data: {
              type: "lovable-preview-auth:result",
              requestId: message.requestId,
              ok: true,
              value: null,
            },
          }),
        ),
      );
    });
    const client = createClient("https://example.supabase.co", "public-test-key", {
      auth: {
        storage: brokeredPreviewStorage(),
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                access_token: "test-access-token",
                refresh_token: "test-refresh-token",
                token_type: "bearer",
                expires_in: 3600,
                user: {
                  id: "athlete",
                  aud: "authenticated",
                  app_metadata: {},
                  user_metadata: {},
                  created_at: "2026-11-09T00:00:00Z",
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        ),
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    const signedIn = vi.fn();
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") signedIn();
    });
    let finished = false;
    const login = client.auth
      .signInWithPassword({ email: "qa@example.com", password: "test-password" })
      .then((result) => {
        expect(result.error).toBeNull();
        finished = true;
      });
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(true);
    expect(signedIn).toHaveBeenCalledTimes(1);
    expect(
      editor.postMessage.mock.calls.some(
        ([request]) => request.type === "lovable-preview-auth:set",
      ),
    ).toBe(true);
    await login;
    listener.subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(4000);
  });
  it("commits login immediately without waiting for an absent editor and reads that session during replication", async () => {
    const storage = brokeredPreviewStorage()!;
    expect(storage.setItem("session", "new-session")).toBeUndefined();
    expect(localStorage.getItem("session")).toBe("new-session");
    expect(await storage.getItem("session")).toBe("new-session");
    expect(editor.postMessage).toHaveBeenCalledTimes(1);
    // No broker timeout needs to elapse before the SDK can announce SIGNED_IN.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await storage.getItem("session")).toBe("new-session");
  });

  it("replicates a rapid login then logout in order and cannot revive the old login", async () => {
    const storage = brokeredPreviewStorage()!;
    storage.setItem("session", "new-session");
    storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
    expect(editor.postMessage).toHaveBeenCalledTimes(1);
    const reply = (requestId: string, value: string) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://lovable.dev",
          source: window.parent,
          data: { type: "lovable-preview-auth:result", requestId, ok: true, value },
        }),
      );
    reply(editor.postMessage.mock.calls[0][0].requestId, "new-session");
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem("session")).toBeNull();
    expect(editor.postMessage.mock.calls[1][0].type).toBe("lovable-preview-auth:remove");
    reply(editor.postMessage.mock.calls[1][0].requestId, "");
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem("session")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits only for the initial handshake when the editor is absent; further SDK reads and writes are immediate", async () => {
    const storage = brokeredPreviewStorage()!;
    const initial = storage.getItem("session");
    await vi.advanceTimersByTimeAsync(4250);
    expect(await initial).toBeNull();
    expect(editor.postMessage).toHaveBeenCalledTimes(2);
    await storage.setItem("session", "local-session");
    for (let n = 0; n < 10; n++) expect(await storage.getItem("session")).toBe("local-session");
    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
    expect(editor.postMessage).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps login and logout usable when Safari blocks localStorage access", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const storage = brokeredPreviewStorage()!;
    const initial = storage.getItem("session");
    await vi.advanceTimersByTimeAsync(4250);
    expect(await initial).toBeNull();
    await storage.setItem("session", "memory-session");
    expect(await storage.getItem("session")).toBe("memory-session");
    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
  });
  it("honors a logout from the trusted editor and ignores a different window", async () => {
    localStorage.setItem("session", "old-session");
    editor.postMessage.mockImplementation((msg: { requestId: string }) => {
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: "https://lovable.dev",
            source: window,
            data: {
              type: "lovable-preview-auth:result",
              requestId: msg.requestId,
              ok: true,
              value: "untrusted",
            },
          }),
        );
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: "https://lovable.dev",
            source: window.parent,
            data: {
              type: "lovable-preview-auth:result",
              requestId: msg.requestId,
              ok: true,
              value: "",
            },
          }),
        );
      });
    });
    const storage = brokeredPreviewStorage()!;
    const read = storage.getItem("session");
    await vi.advanceTimersByTimeAsync(0);
    expect(await read).toBeNull();
    expect(localStorage.getItem("session")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not restore a locally deleted token from memory", async () => {
    vi.stubGlobal("parent", window);
    const storage = brokeredPreviewStorage()!;
    await storage.setItem("session", "local-session");
    localStorage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
  });

  it("supports blocked storage outside the editor without throwing or retaining a logout", async () => {
    vi.stubGlobal("parent", window);
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const storage = brokeredPreviewStorage()!;
    expect(await storage.getItem("session")).toBeNull();
    await storage.setItem("session", "memory-session");
    expect(await storage.getItem("session")).toBe("memory-session");
    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
  });

  it("shares the initial probe without returning another storage key's session", async () => {
    const storage = brokeredPreviewStorage()!;
    const session = storage.getItem("session");
    const verifier = storage.getItem("pkce-verifier");
    await vi.advanceTimersByTimeAsync(4250);
    expect(await session).toBeNull();
    expect(await verifier).toBeNull();
    expect(editor.postMessage).toHaveBeenCalledTimes(2);
  });

  it("does not restore the old stored session when a write or logout is blocked", async () => {
    vi.stubGlobal("parent", window);
    localStorage.setItem("session", "old-session");
    const storage = brokeredPreviewStorage()!;
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await storage.setItem("session", "new-session");
    expect(await storage.getItem("session")).toBe("new-session");
    set.mockRestore();
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
    remove.mockRestore();
    expect(await storage.getItem("session")).toBeNull();
    expect(localStorage.getItem("session")).toBeNull();
  });

  it("ignores an earlier broker read when a newer login has already been saved", async () => {
    const requests: { requestId: string; type: string }[] = [];
    editor.postMessage.mockImplementation((message) => requests.push(message));
    const storage = brokeredPreviewStorage()!;
    const initial = storage.getItem("session");
    const save = storage.setItem("session", "new-session");
    const respond = (request: { requestId: string }, value: string) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://lovable.dev",
          source: window.parent,
          data: {
            type: "lovable-preview-auth:result",
            requestId: request.requestId,
            ok: true,
            value,
          },
        }),
      );
    respond(
      requests.find((r) => r.type === "lovable-preview-auth:set")!,
      "new-session",
    );
    await save;
    respond(
      requests.find((r) => r.type === "lovable-preview-auth:get")!,
      "old-session",
    );
    expect(await initial).toBe("new-session");
    expect(localStorage.getItem("session")).toBe("new-session");
  });

  it("does not revive a token removed in another tab while the broker was reading", async () => {
    localStorage.setItem("session", "old-session");
    let requestId = "";
    editor.postMessage.mockImplementation((message) => {
      requestId = message.requestId;
    });
    const storage = brokeredPreviewStorage()!;
    const initial = storage.getItem("session");
    localStorage.removeItem("session");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://lovable.dev",
        source: window.parent,
        data: { type: "lovable-preview-auth:result", requestId, ok: true, value: "old-session" },
      }),
    );
    expect(await initial).toBeNull();
    expect(localStorage.getItem("session")).toBeNull();
  });
});
