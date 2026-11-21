import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: "u-1" as string | null, results: {} as Record<string, { data: unknown; error: unknown }> }));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) },
    from: (table: string) => {
      const r = () => db.results[table] ?? { data: null, error: null };
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
      c.maybeSingle = () => Promise.resolve(r());
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(r()).then(res, rej);
      return c;
    },
  },
}));

import { pullAll } from "./sync";
import { scoped, setScope } from "./store";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;

const PROFILE = { name: "Kuba", age: 18, ageAsOf: "2026-11-21", strengthYears: 2, weightKg: 75, position: "pomocnik", equipment: ["gym"], clubWeekdays: [1], matchWeekdays: [5], limitedGymAccess: false };
const grantHealth = () => scoped.setItem("consent:health_sync", JSON.stringify({ granted: true, at: new Date().toISOString(), version: "x", pendingWithdraw: false }));

beforeEach(() => { mem.clear(); db.user = "u-1"; db.results = { profiles: { data: { data: PROFILE }, error: null } }; setScope({ kind: "user", id: "u-1" }); });

describe("pobieranie danych po zalogowaniu", () => {
  it("profil wraca, nawet gdy tabela check-inów zwraca błąd (nie ma onboardingu od nowa)", async () => {
    grantHealth();
    db.results.check_ins = { data: null, error: { message: "column recovery does not exist" } };
    const r = await pullAll("2026-11-21");
    expect(r?.profileOk).toBe(true);
    expect(r?.profile?.name).toBe("Kuba");
    expect(r?.checkIn).toBeNull();
  });
  it("błąd tabeli profili: profileOk = false (nie wiemy, czy konto ma profil), a nie „brak profilu”", async () => {
    db.results.profiles = { data: null, error: { message: "network" } };
    const r = await pullAll("2026-11-21");
    expect(r?.profileOk).toBe(false);
    expect(r?.profile).toBeNull();
  });
  it("konto bez profilu: profileOk = true i profile = null; brak sesji: null", async () => {
    db.results.profiles = { data: null, error: null };
    const r = await pullAll("2026-11-21");
    expect(r).toMatchObject({ profileOk: true, profile: null });
    db.user = null;
    expect(await pullAll("2026-11-21")).toBeNull();
  });
});
