import { describe, expect, it } from "vitest";
import { deleteAccount, type DeleteDeps } from "../../supabase/functions/_shared/account";

const deps = (over: Partial<DeleteDeps> = {}) => {
  const calls: string[] = [];
  const d: DeleteDeps = {
    verifyUser: async (jwt) => (jwt === "dobry-token" ? { id: "u-1" } : null),
    eraseData: async (id) => { calls.push(`erase:${id}`); return { logId: "log-1", deleted: { profiles: 1 } }; },
    deleteAuthUser: async (id) => { calls.push(`auth:${id}`); },
    finish: async (log, ok) => { calls.push(`finish:${log}:${ok}`); },
    ...over,
  };
  return { d, calls };
};

describe("usuwanie konta (funkcja serwerowa)", () => {
  it("bez sesji lub z nieprawidłowym tokenem: 401 i żadnej operacji na danych", async () => {
    const { d, calls } = deps();
    expect((await deleteAccount(d, null)).status).toBe(401);
    expect((await deleteAccount(d, "zly-token")).status).toBe(401);
    expect(calls).toEqual([]);
  });
  it("tożsamość pochodzi wyłącznie ze zweryfikowanego tokenu (nie da się wskazać innego użytkownika)", async () => {
    const { d, calls } = deps();
    const r = await deleteAccount(d, "dobry-token");
    expect(r.status).toBe(200);
    expect(r.body.complete).toBe(true);
    expect(calls).toEqual(["erase:u-1", "auth:u-1", "finish:log-1:true"]);
    expect(deleteAccount.length).toBe(2); // brak parametru z identyfikatorem użytkownika
  });
  it("błąd usuwania danych: konto nie jest usuwane, stan opisuje prawdę i można ponowić", async () => {
    let fail = true;
    const { d, calls } = deps({ eraseData: async (id) => { if (fail) throw new Error("baza niedostępna"); calls.push(`erase:${id}`); return { logId: "log-2", deleted: {} }; } });
    const r1 = await deleteAccount(d, "dobry-token");
    expect(r1.status).toBe(500);
    expect(r1.body.complete).toBe(false);
    expect(r1.body.steps).toEqual([{ name: "erase_data", ok: false, error: "baza niedostępna" }]);
    expect(calls.some((c) => c.startsWith("auth:"))).toBe(false);
    fail = false;
    expect((await deleteAccount(d, "dobry-token")).body.complete).toBe(true);
  });
  it("dane usunięte, ale zamknięcie konta logowania zawiodło: raport mówi, co się udało; log oznaczony jako failed", async () => {
    const { d, calls } = deps({ deleteAuthUser: async () => { throw new Error("auth 500"); } });
    const r = await deleteAccount(d, "dobry-token");
    expect(r.status).toBe(500);
    expect(r.body.steps.map((s) => [s.name, s.ok])).toEqual([["erase_data", true], ["delete_auth_user", false]]);
    expect(r.body.error).toMatch(/Dane zostały usunięte/);
    expect(calls).toContain("finish:log-1:false");
  });
});
