import { beforeEach, describe, expect, it, vi } from "vitest";

const srv = vi.hoisted(() => ({ calls: [] as Array<{ fn: string; args: Record<string, unknown> }>, fail: false }));
vi.mock("../lib/supabase", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => { srv.calls.push({ fn, args }); return Promise.resolve({ error: srv.fail ? { message: "serwer niedostępny" } : null }); },
  },
}));

import { acceptAgreement, hasCurrentAgreement, loadConsent, resumePendingWithdraw, setHealthSync } from "./consent";
import { AGREEMENT_VERSION } from "./consent";
import { setScope } from "../lib/store";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;

beforeEach(() => { mem.clear(); srv.calls = []; srv.fail = false; setScope({ kind: "user", id: "u-1" }); });

describe("dowody: umowa, zasady bezpieczeństwa i zgoda na synchronizację to osobne oświadczenia", () => {
  it("akceptacja umowy i zasad bezpieczeństwa to dwa osobne zapisy z wersją dokumentu; lokalne lustro dopiero po sukcesie serwera", async () => {
    expect((await acceptAgreement("terms")).ok).toBe(true);
    expect(hasCurrentAgreement("terms")).toBe(true);
    expect(hasCurrentAgreement("safety")).toBe(false); // umowa ≠ zasady bezpieczeństwa
    expect(srv.calls).toEqual([{ fn: "record_agreement", args: { p_kind: "terms", p_version: AGREEMENT_VERSION.terms } }]);
    srv.fail = true;
    const r = await acceptAgreement("safety");
    expect(r).toEqual({ ok: false, error: "serwer niedostępny" });
    expect(hasCurrentAgreement("safety")).toBe(false); // bez dowodu na serwerze nie ma potwierdzenia
  });
  it("dla gościa (bez konta) nic nie jest wysyłane i nie powstaje dowód", async () => {
    setScope({ kind: "guest" });
    const r = await acceptAgreement("terms");
    expect(r.ok).toBe(false);
    expect(srv.calls).toEqual([]);
  });
  it("zgoda na synchronizację zdrowia jest osobna i wycofywalna; wycofanie działa lokalnie od razu, a przy awarii serwera zostaje „oczekuje” i jest wznawiane", async () => {
    expect((await setHealthSync(true)).ok).toBe(true);
    expect(loadConsent("health_sync")).toMatchObject({ granted: true, pendingWithdraw: false });
    srv.fail = true;
    const r = await setHealthSync(false);
    expect(r.ok).toBe(false);
    expect(loadConsent("health_sync")).toMatchObject({ granted: false, pendingWithdraw: true }); // prawdziwy stan: lokalnie wyłączone, serwer jeszcze nie potwierdził
    srv.fail = false; srv.calls = [];
    await resumePendingWithdraw();
    expect(srv.calls).toEqual([{ fn: "record_consent", args: { p_purpose: "health_sync", p_action: "withdraw", p_version: expect.any(String) } }]);
    expect(loadConsent("health_sync")).toMatchObject({ granted: false, pendingWithdraw: false });
  });
  it("nie istnieje ogólna „zgoda RODO” ani zgody marketingowe/analityczne: jedyny cel zgody to synchronizacja zdrowia", async () => {
    await setHealthSync(true);
    expect(srv.calls.every((c) => c.fn !== "record_consent" || c.args.p_purpose === "health_sync")).toBe(true);
  });
});
