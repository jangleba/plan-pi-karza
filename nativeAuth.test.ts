import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptedAuthCode, authRedirectUrl, installNativeAuthCallbacks } from "./nativeAuth";

const app = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown) => void>(),
  remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (name: string, callback: (event: unknown) => void) => {
      app.listeners.set(name, callback);
      return Promise.resolve({ remove: app.remove });
    },
    getLaunchUrl: () => Promise.resolve({ url: "https://example.test/auth?code=launch-code-1234" }),
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  app.listeners.clear();
  app.remove.mockClear();
});

describe("native Auth redirect contract", () => {
  it("requires a configured HTTPS callback on native, never capacitor localhost", () => {
    expect(() => authRedirectUrl(true, undefined, "capacitor://localhost")).toThrow(
      "VITE_AUTH_REDIRECT_URL",
    );
    expect(authRedirectUrl(true, "https://example.test/auth")).toBe("https://example.test/auth");
    for (const value of [
      "http://example.test/auth",
      "https://example.test/else",
      "https://user:pass@example.test/auth",
      "https://example.test/auth?next=evil",
    ])
      expect(() => authRedirectUrl(true, value)).toThrow();
  });
  it("allows only the exact configured origin/path and one PKCE code", () => {
    const callback = "https://example.test/auth";
    expect(acceptedAuthCode(`${callback}?code=abcdefgh-12345678`, callback)).toBe(
      "abcdefgh-12345678",
    );
    for (const value of [
      "https://evil.test/auth?code=abcdefgh",
      "https://example.test/other?code=abcdefgh",
      `${callback}?code=abcdefgh&code=ijklmnop`,
      `${callback}#access_token=secret`,
      "not a URL",
    ])
      expect(acceptedAuthCode(value, callback)).toBeNull();
  });
  it("keeps localhost web development usable without weakening native requirements", () => {
    expect(authRedirectUrl(false, undefined, "http://localhost:3000")).toBe(
      "http://localhost:3000/auth",
    );
    expect(() => authRedirectUrl(false, undefined, "http://example.test")).toThrow();
  });
  it("exchanges cold/warm PKCE links once, ignores foreign links and disposes listeners", async () => {
    vi.stubEnv("VITE_AUTH_REDIRECT_URL", "https://example.test/auth");
    const exchange = vi.fn().mockResolvedValue({ error: null });
    const result = vi.fn();
    const dispose = await installNativeAuthCallbacks(exchange, result);
    expect(exchange).toHaveBeenCalledWith("launch-code-1234");
    app.listeners.get("appUrlOpen")!({ url: "https://example.test/auth?code=launch-code-1234" });
    app.listeners.get("appUrlOpen")!({ url: "https://evil.test/auth?code=foreign-code-1234" });
    app.listeners.get("appUrlOpen")!({ url: "https://example.test/auth?code=warm-code-1234" });
    await Promise.resolve();
    await Promise.resolve();
    expect(exchange).toHaveBeenCalledTimes(2);
    dispose();
    expect(app.remove).toHaveBeenCalledTimes(2);
    app.listeners.get("appUrlOpen")!({ url: "https://example.test/auth?code=after-dispose-1234" });
    expect(exchange).toHaveBeenCalledTimes(2);
  });
});
