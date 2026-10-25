import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { bootstrapSqlDatabase } from "@/lib/loadwise/sql/schemaHarness";
let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const device = "20000000-0000-4000-8000-000000000001";
async function login(user = owner) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now()),($2,'other@example.test',now())",
    [owner, other],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("billing and backup on the full schema", () => {
  it("grants verified changes only to service role and rejects client claims", async () => {
    await login();
    await expect(
      db.query(
        "insert into billing_entitlements(user_id,status,verified_at) values($1,'active',now())",
        [owner],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "select record_billing_entitlement($1,'active',now()+interval '1 day',now(),'monthly','app_store',null)",
        [owner],
      ),
    ).rejects.toThrow();
    await db.exec("reset role;set role service_role");
    await db.query(
      "select record_billing_entitlement($1,'active','2026-11-01','2026-10-18T10:00:00Z','monthly','app_store','same-event')",
      [owner],
    );
    await db.query(
      "select record_billing_entitlement($1,'expired',null,'2026-10-18T11:00:00Z','monthly','app_store','refund')",
      [owner],
    );
    await db.query(
      "select record_billing_entitlement($1,'active','2026-11-01','2026-10-18T10:00:00Z','monthly','app_store','same-event')",
      [owner],
    );
    await login();
    expect(
      (await db.query<{ status: string }>("select status from billing_entitlements")).rows,
    ).toEqual([{ status: "expired" }]);
    await login(other);
    expect((await db.query("select * from billing_entitlements")).rows).toEqual([]);
    await db.exec("reset role");
    expect(
      (await db.query<{ n: number }>("select count(*)::int n from billing_events")).rows[0].n,
    ).toBe(2);
  });
  it("preserves per-device backups, validates CAS and safely retries an operation", async () => {
    await login();
    const operation = crypto.randomUUID();
    const backup = async (expected: number, op = operation) =>
      db.query<{ value: Record<string, unknown> }>(
        "select save_module_backup('lab',$1,$2,$3,'{\"version\":1,\"entries\":[]}'::jsonb) value",
        [device, expected, op],
      );
    expect((await backup(0)).rows[0].value.revision).toBe(1);
    expect((await backup(0)).rows[0].value.revision).toBe(1);
    await expect(backup(0, crypto.randomUUID())).rejects.toThrow(/conflict/);
    expect((await backup(1, crypto.randomUUID())).rows[0].value.revision).toBe(2);
    await login(other);
    expect((await db.query("select * from module_backups")).rows).toEqual([]);
  });
  it("account deletion cascades only its own billing and backups", async () => {
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [owner]);
    expect((await db.query("select * from billing_entitlements")).rows).toEqual([]);
    expect((await db.query("select * from billing_events")).rows).toEqual([]);
    expect((await db.query("select * from module_backups")).rows).toEqual([]);
  });
});
