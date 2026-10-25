// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brokeredPreviewStorage } from "./previewAuthStorage";
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
});
