import { beforeEach, describe, expect, it, vi } from "vitest";

const rec = vi.hoisted(() => ({ calls: [] as Array<{ op: string; table: string; payload: unknown }>, userId: "u-1" }));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: rec.userId } } }) },
    from: (table: string) => ({
      upsert: (payload: unknown) => { rec.calls.push({ op: "upsert", table, payload }); return Promise.resolve({ error: null }); },
      insert: (payload: unknown) => { rec.calls.push({ op: "insert", table, payload }); return Promise.resolve({ error: null }); },
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
    }),
    rpc: (fn: string, args: unknown) => { rec.calls.push({ op: "rpc", table: fn, payload: args }); return Promise.resolve({ error: null }); },
  },
}));

import { pushCheckIn, pushMas, pushProfile, pushWeightLog } from "./sync";
import { savePrivate } from "./private";
import { scoped, setScope } from "./store";
import type { Profile } from "../engine";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;

const today = new Date().toISOString().slice(0, 10);
const profile = (over: Record<string, unknown> = {}): Profile => ({
  name: "Kuba", age: 18, ageAsOf: today, strengthYears: 2, weightKg: 75, position: "pomocnik", equipment: ["gym"], clubWeekdays: [1], matchWeekdays: [5], limitedGymAccess: false, startDate: "2026-09-01", ...over,
} as Profile);
const grantHealth = () => scoped.setItem("consent:health_sync", JSON.stringify({ granted: true, at: new Date().toISOString(), version: "x", pendingWithdraw: false }));

beforeEach(() => { mem.clear(); rec.calls = []; rec.userId = "u-1"; setScope({ kind: "user", id: "u-1" }); });

describe("żądania do chmury: żadnej daty urodzenia ani pól spoza kontraktu", () => {
  it("nawet gdy lokalnie jest pełna data urodzenia i ukryte pola w obiekcie profilu, żadne żądanie jej nie zawiera", async () => {
    savePrivate({ birthDate: "2007-03-14", birthYear: 2007 });
    grantHealth();
    const dirty = profile({ birthDate: "2007-03-14", birthYear: 2007, dob: "2007-03-14", pesel: "07031412345", email: "x@y.pl" });
    await pushProfile(dirty);
    await pushCheckIn("2026-11-19", { sleep: 2, feeling: 3, less: false });
    await pushWeightLog({ squat: { kg: 80, reps: 5, date: "2026-11-19", completion: "all", choice: "stay" } });
    await pushMas(1200);
    expect(rec.calls.length).toBeGreaterThanOrEqual(4);
    const all = JSON.stringify(rec.calls);
    expect(all).not.toMatch(/birth|dob|2007-03-14|pesel|07031412345|x@y\.pl/i);
    const p = rec.calls.find((c) => c.table === "profiles")!.payload as { data: Record<string, unknown> };
    expect(p.data.name).toBe("Kuba");
    expect(Object.keys(p.data).sort()).toEqual(expect.arrayContaining(["name", "age", "ageAsOf"]));
  });

  it("dane zdrowotne (check-in, ciężary, MAS) nie idą do chmury bez zgody na synchronizację", async () => {
    await pushProfile(profile());
    await pushCheckIn("2026-11-19", { sleep: 2, feeling: 3, less: false });
    await pushWeightLog({ squat: { kg: 80, reps: 5, date: "2026-11-19" } });
    await pushMas(1200);
    expect(rec.calls.map((c) => c.table)).toEqual(["profiles"]);
  });

  it("osoba poniżej progu wieku nie jest synchronizowana", async () => {
    await pushProfile(profile({ age: 15 }));
    expect(rec.calls).toEqual([]);
  });

  it("przestrzeń gościa albo innego konta nie wysyła nic (brak przecieku danych na cudze konto)", async () => {
    grantHealth();
    setScope({ kind: "guest" });
    await pushProfile(profile()); await pushMas(1000);
    expect(rec.calls).toEqual([]);
    setScope({ kind: "user", id: "u-OTHER" }); // sesja Supabase należy do u-1
    await pushProfile(profile()); await pushMas(1000);
    expect(rec.calls).toEqual([]);
  });

  it("wpis dziennika ciężarów synchronizuje tylko ustalony zestaw kolumn (bez zgłoszonego wykonania i decyzji)", async () => {
    grantHealth();
    await pushWeightLog({ squat: { kg: 80, reps: 5, date: "2026-11-19", next: 82.5, completion: "all", choice: "raise" } });
    const rows = rec.calls.find((c) => c.table === "weight_log")!.payload as Array<Record<string, unknown>>;
    expect(Object.keys(rows[0]!).sort()).toEqual(["exercise_id", "kg", "logged_on", "next_kg", "reps", "user_id"]);
  });
});
