import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueTrainingWrite,
  flushPendingTrainingWrites,
  readPendingTrainingWrites,
  withAcknowledgedTrainingWrite,
} from "./offlineTrainingQueue";
import { reconcilePlanIdentity, trainingProfileRevision } from "./planIdentity";
import { expiredUnfinishedSessions } from "./sessionStatus";
import { clearLocalUserData } from "./localPrivacy";
import { saveDailyPlanCheckin } from "./dailyPlanCheckin";
import { buildTrainingHistory } from "../progress/progress";
import { buildLoadReport } from "../progress/dashboard";
import { routeDistanceM, sanitizeRoute } from "../running/metrics";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile } from "./types";

class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const write = (id: string, completed = false) => ({
  kind: "session_log" as const,
  dedupeKey: `session:${id}`,
  payload: { user_id: "u", session_id: id, completed },
});
beforeEach(() => vi.unstubAllGlobals());

describe("reliability regressions", () => {
  it("keeps another write and a newer same-key revision enqueued during a flush", async () => {
    const storage = new MemoryStorage();
    enqueueTrainingWrite("u", write("A"), storage, 1);
    await flushPendingTrainingWrites(
      "u",
      async () => {
        enqueueTrainingWrite("u", write("B"), storage, 1);
        enqueueTrainingWrite("u", write("A", true), storage, 1);
        return true;
      },
      storage,
    );
    expect(readPendingTrainingWrites("u", storage)).toHaveLength(2);
    expect(
      readPendingTrainingWrites("u", storage).find((x) => x.dedupeKey === "session:A")?.payload,
    ).toMatchObject({ completed: true });
  });
  it("acknowledges obsolete queued state after a confirmed foreground write", async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    enqueueTrainingWrite("u", write("A"));
    await withAcknowledgedTrainingWrite("u", "session:A", async () => ({ error: null }));
    expect(readPendingTrainingWrites("u")).toEqual([]);
  });
  it("never silently evicts unsent data when the queue is full or old", () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 120; i++)
      expect(enqueueTrainingWrite("u", write(String(i)), storage, 0)).toBe(true);
    expect(enqueueTrainingWrite("u", write("overflow"), storage, 0)).toBe(false);
    expect(readPendingTrainingWrites("u", storage, 8 * 86400000)).toHaveLength(120);
  });
  it("reuses identical future sessions but gives changed prescriptions a new identity", () => {
    const old = sessionFixture({ dayDbId: "day", planDbId: "plan", date: "2026-10-19" });
    const unchanged = reconcilePlanIdentity([{ ...old }], [old], {}, "2026-10-18")[0];
    expect(unchanged.dbId).toBe(old.dbId);
    const changed = reconcilePlanIdentity(
      [{ ...old, title: "Inny trening" }],
      [old],
      {},
      "2026-10-18",
    )[0];
    expect(changed.dbId).toBeUndefined();
    expect(changed.dayDbId).toBe("day");
    expect(old.dbId).toBe("session-1");
  });
  it("keeps started and completed prescriptions immutable during regeneration", () => {
    const old = sessionFixture({ date: "2026-10-18" });
    for (const status of ["started", "completed"] as const) {
      const next = reconcilePlanIdentity(
        [{ ...old, title: "Nowa treść" }],
        [old],
        {
          "session-1": { completed: status === "completed", status, rpe: 6, notes: "" },
        },
        "2026-10-18",
      );
      expect(next[0].title).toBe(old.title);
      expect(next[0].dbId).toBe("session-1");
    }
  });
  it("ignores timestamps and Fuel when deciding whether a training revision changed", () => {
    const p = { age: 20, goal: "speed", equipment: ["B", "A"] } as Profile;
    expect(
      trainingProfileRevision({
        ...p,
        weightKg: 80,
        fuelPrecisionEnabled: true,
        onboardingRevision: "new",
      }),
    ).toBe(trainingProfileRevision(p));
    expect(trainingProfileRevision({ ...p, equipment: ["A", "B"] })).toBe(
      trainingProfileRevision(p),
    );
    expect(trainingProfileRevision(p)).toMatch(/^training-inputs:v1:[a-f0-9]{64}$/);
    expect(trainingProfileRevision({ ...p, goal: "strength" })).not.toBe(
      trainingProfileRevision(p),
    );
  });
  it("counts actual match minutes in history and load", () => {
    const plan = [sessionFixture({ dayType: "match", date: "2026-10-18", durationMin: 90 })];
    const history = buildTrainingHistory(plan, {
      "session-1": { completed: true, durationMin: 20, rpe: 8, notes: "" },
    });
    expect(buildLoadReport(history, "2026-10-18").total).toBe(160);
  });
  it("expires started work, but never completed or already missed work", () => {
    const day = sessionFixture({ date: "2026-10-17" });
    expect(
      expiredUnfinishedSessions([day], "2026-10-18", {
        "session-1": { completed: false, status: "started", rpe: null, notes: "" },
      }),
    ).toHaveLength(1);
    expect(
      expiredUnfinishedSessions([day], "2026-10-18", {
        "session-1": { completed: false, status: "missed", rpe: null, notes: "" },
      }),
    ).toEqual([]);
  });
  it("does not truncate a long valid route and never bridges a GPS pause", () => {
    const points = Array.from({ length: 5500 }, (_, i) => ({
      lat: 52 + i * 0.00003,
      lng: 21,
      elapsedSec: i,
      recordedAt: new Date(1700000000000 + i * 1000).toISOString(),
      accuracyM: 3,
    }));
    expect(sanitizeRoute(points)).toHaveLength(5500);
    expect(routeDistanceM(sanitizeRoute(points))).toBeGreaterThan(
      routeDistanceM(sanitizeRoute(points.slice(0, 5000))),
    );
    const segments = [
      { ...points[0], segment: 0 },
      { ...points[1], segment: 0 },
      { ...points[100], segment: 1 },
    ];
    expect(routeDistanceM(sanitizeRoute(segments))).toBeCloseTo(
      routeDistanceM(segments.slice(0, 2)),
    );
  });
  it("clears current module data without touching the other account", () => {
    const storage = new MemoryStorage();
    const keys = [
      "ballwise.browser-lab.v1:u",
      "ballwise:iq:journeys:v1:u:draft",
      "loadwise:details:v1:note:u:squat",
      "ballwise:warmup:u:s1",
      "ballwise:daily-plan-checkin:v2:u:2026-10-18",
    ];
    keys.forEach((key) => storage.setItem(key, "private"));
    storage.setItem("ballwise.browser-lab.v1:other", "keep");
    clearLocalUserData("u", storage);
    keys.forEach((key) => expect(storage.getItem(key)).toBeNull());
    expect(storage.getItem("ballwise.browser-lab.v1:other")).toBe("keep");
  });
  it("does not report a failed plan change merely because confirmation storage is blocked", () => {
    const record = saveDailyPlanCheckin("u", "2026-10-18", "lighter", null, {
      setItem() {
        throw new Error("quota");
      },
    });
    expect(record.primaryAction).toBe("lighter");
  });
});
