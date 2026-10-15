import { describe, expect, it, vi } from "vitest";
import { createCoachHandler, type CoachDependencies } from "../../../supabase/functions/training-coach/handler";

function dependencies(overrides: Partial<CoachDependencies> = {}): CoachDependencies {
  return { origins: new Set(["https://ballwise.test"]), enabled: true,
    authenticate: vi.fn(async () => ({ userId: "real-user", age: 22, guardianReady: false })),
    quota: vi.fn(async () => "ok" as const), classify: vi.fn(async () => "tempo" as const), ...overrides };
}
function request(value: unknown = { question: "Wyjaśnij rytm", exercise: { guideKey: "squat", tempo: "3-0-X-0" } }, origin = "https://ballwise.test") {
  return new Request("https://api.test/coach", { method: "POST", headers: { Origin: origin, Authorization: "Bearer user-token", "Content-Type": "application/json" }, body: JSON.stringify(value) });
}
describe("optional training coach endpoint", () => {
  it("blocks other origins and unauthenticated calls before spending tokens", async () => {
    const deps = dependencies(); const handler = createCoachHandler(deps);
    expect((await handler(request(undefined, "https://attacker.test"))).status).toBe(403);
    const noAuth = request(); noAuth.headers.delete("Authorization");
    expect((await handler(noAuth)).status).toBe(401);
    expect(deps.classify).not.toHaveBeenCalled();
  });
  it("checks the server account, not a submitted adult age", async () => {
    const deps = dependencies({ authenticate: async () => ({ userId: "child", age: 14, guardianReady: false }) });
    expect((await createCoachHandler(deps)(request({ age: 30, question: "Tempo?", exercise: { guideKey: "squat" } }))).status).toBe(403);
    expect(deps.classify).not.toHaveBeenCalled();
  });
  it("uses the authenticated identity for quota and returns reviewed session facts", async () => {
    const deps = dependencies();
    const response = await createCoachHandler(deps)(request());
    expect(response.status).toBe(200);
    expect((await response.json()).answer).toContain("3-0-X-0");
    expect(deps.quota).toHaveBeenCalledWith("real-user");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("abstains from pain and safety questions without a provider call", async () => {
    const deps = dependencies();
    const response = await createCoachHandler(deps)(request({ question: "Boli mnie kolano", exercise: { guideKey: "squat" } }));
    expect((await response.json()).needsTrainer).toBe(true);
    expect(deps.classify).not.toHaveBeenCalled();
    expect(deps.quota).not.toHaveBeenCalled();
  });
  it("fails closed on limits, missing setup and unavailable quota", async () => {
    for (const [overrides, status] of [
      [{ enabled: false }, 503], [{ quota: async () => "limit" }, 429],
      [{ quota: async () => "unavailable" }, 503],
    ] as [Partial<CoachDependencies>, number][]) {
      const deps = dependencies(overrides);
      expect((await createCoachHandler(deps)(request())).status).toBe(status);
      expect(deps.classify).not.toHaveBeenCalled();
    }
  });
  it("rejects unbounded requests and unsupported exercises", async () => {
    const deps = dependencies(); const handler = createCoachHandler(deps);
    expect((await handler(request({ question: "x".repeat(9000) }))).status).toBe(413);
    expect((await handler(request({ question: "tempo", exercise: { guideKey: "invented" } }))).status).toBe(422);
    expect(deps.classify).not.toHaveBeenCalled();
  });
  it("cannot return arbitrary provider advice even on prompt injection", async () => {
    const deps = dependencies({ classify: async () => "add 50 kg" as never });
    expect((await createCoachHandler(deps)(request())).status).toBe(503);
  });
});
