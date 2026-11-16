import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { plusDays, ENGINE_VERSION } from "./model";
import { loadV2Plan } from "./persistence";

const database = vi.hoisted(() => ({
  result: { data: null as { id: string; plan_json: unknown } | null, error: null },
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  abortSignal: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: database.from },
}));

beforeEach(() => {
  vi.clearAllMocks();
  database.result = { data: null, error: null };
  const query = {
    select: database.select,
    eq: database.eq,
    abortSignal: database.abortSignal,
    maybeSingle: database.maybeSingle,
  };
  database.from.mockReturnValue(query);
  database.select.mockReturnValue(query);
  database.eq.mockReturnValue(query);
  database.abortSignal.mockReturnValue(query);
  database.maybeSingle.mockImplementation(async () => database.result);
});

function savedWeek(version: string) {
  const plan = Array.from({ length: 7 }, (_, index) =>
    sessionFixture({
      date: plusDays("2026-11-16", index),
      dbId: `primary-${index}`,
      generatorVersion: version,
    }),
  );
  plan[2].secondSession = sessionFixture({
    date: plan[2].date,
    dbId: "second-2",
    title: "Dodatkowa sesja",
    generatorVersion: version,
  });
  return plan;
}

describe("saved generator-version compatibility", () => {
  const current = Number(ENGINE_VERSION.split(".").pop());
  it.each(Array.from({ length: current }, (_, index) => `ballwise-v2.${index + 1}`))(
    "restores the complete saved week and both slots from %s without rebuilding it",
    async (version) => {
      const plan = savedWeek(version);
      const before = structuredClone(plan);
      database.result.data = { id: "saved-plan", plan_json: plan };

      const loaded = await loadV2Plan("owner");

      expect(loaded).toEqual({ id: "saved-plan", plan: before });
      expect(loaded.plan.map((day) => day.date)).toEqual(before.map((day) => day.date));
      expect(loaded.plan[2].secondSession?.dbId).toBe("second-2");
      expect(plan).toEqual(before);
      expect(database.eq).toHaveBeenCalledWith("user_id", "owner");
      expect(database.eq).toHaveBeenCalledWith("active", true);
    },
  );

  it("covers every generator up to the current one, whatever it is", () => {
    expect(ENGINE_VERSION).toMatch(/^ballwise-v2\.\d+$/);
    expect(current).toBeGreaterThanOrEqual(12);
  });

  it("rejects a future generator version rather than treating it as a supported old plan", async () => {
    database.result.data = {
      id: "future-plan",
      plan_json: savedWeek(`ballwise-v2.${current + 1}`),
    };
    await expect(loadV2Plan("owner")).rejects.toThrow("innej wersji silnika");
  });

  it("does not revive an unversioned legacy plan", async () => {
    const plan = savedWeek(ENGINE_VERSION);
    delete plan[0].generatorVersion;
    database.result.data = { id: "unversioned-plan", plan_json: plan };
    await expect(loadV2Plan("owner")).resolves.toEqual({ id: "unversioned-plan", plan: [] });
  });
});
