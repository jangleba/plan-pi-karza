import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/** A session replaced in the active plan cannot be started from a stale second device. */
let db: PGlite;
const owner = "10000000-0000-4000-8000-0000000000a1";
const day = "20000000-0000-4000-8000-0000000000a1";
const plan = "40000000-0000-4000-8000-0000000000a1";
const uid = () => crypto.randomUUID();
const login = () =>
  db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
async function session(id = uid()) {
  await db.query(
    "insert into training_sessions(id,user_id,training_day_id,title,session_type,warmup_json,main_work_json,cooldown_json) values($1,$2,$3,'Strength A','strength_power','[]','[]','[]')",
    [id, owner, day],
  );
  return id;
}
const start = (id: string, op = uid()) =>
  db.query("select save_training_log($1,$2,0,$3::jsonb) result", [
    op,
    id,
    JSON.stringify({
      completed: false,
      completion_status: "started",
      started_at: "2026-10-17T10:00Z",
      updated_at: "2026-10-17T10:00Z",
      execution_snapshot: { dbId: id },
    }),
  ]);
const complete = (id: string) =>
  db.query("select save_training_log($1,$2,0,$3::jsonb) result", [
    uid(),
    id,
    JSON.stringify({
      completed: true,
      completion_status: "completed",
      rpe: 6,
      notes: "",
      duration_minutes: 60,
      started_at: "2026-10-17T10:00Z",
      ended_at: "2026-10-17T11:00Z",
      updated_at: "2026-10-17T11:00Z",
    }),
  ]);
const setSnapshot = (ids: string[]) =>
  db.query("update training_plans set plan_json=$2::jsonb where id=$1", [
    plan,
    JSON.stringify([
      { date: "2026-10-17", dbId: ids[0], secondSession: ids[1] ? { dbId: ids[1] } : null },
    ]),
  ]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 create table storage.buckets(id text primary key,name text,public boolean);
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'s@example.test',now())",
    [owner],
  );
  await login();
  await db.query("insert into athlete_profiles(user_id,age) values($1,20)", [owner]);
  await db.query(
    "insert into training_plans(id,user_id,active,status,cycle_id) values($1,$2,true,'active',$1)",
    [plan, owner],
  );
  await db.query(
    "insert into training_days(id,user_id,plan_id,date,day_type) values($1,$2,$3,'2026-10-17','own')",
    [day, owner, plan],
  );
}, 30000);
beforeEach(() => login());
afterAll(async () => {
  await db?.close();
});

describe.sequential("first start of a replaced session", () => {
  it("rejects a session whose reused day row now belongs to the new plan but is not in its snapshot", async () => {
    const replaced = await session(),
      current = await session(),
      op = uid();
    // The new plan reuses the same training_days row; its snapshot contains only `current`.
    await setSnapshot([current]);
    await expect(start(replaced, op)).rejects.toMatchObject({
      code: "40001",
      message: "Plan zmienił się na innym urządzeniu. Odśwież plan.",
    });
    // Nothing was written: no log and no receipt for the refused operation.
    expect(
      (await db.query("select 1 from session_logs where session_id=$1", [replaced])).rows,
    ).toEqual([]);
    expect(
      (await db.query("select 1 from training_write_receipts where operation_id=$1", [op])).rows,
    ).toEqual([]);
    // The current session of the snapshot starts normally, including a second slot.
    expect((await start(current)).rows).toHaveLength(1);
    const second = await session();
    await setSnapshot([current, second]);
    expect((await start(second)).rows).toHaveLength(1);
  });

  it("keeps sessions created by an active modification startable", async () => {
    const added = await session();
    await setSnapshot([uid()]);
    await db.query(
      "insert into session_modifications(id,user_id,date,type,reason,safety_status,new_session_id,new_session_json,active) values($1,$2,'2026-10-17','add','test','added_by_user',$3,$4::jsonb,true)",
      [uid(), owner, added, JSON.stringify({ dbId: added })],
    );
    expect((await start(added)).rows).toHaveLength(1);
  });

  it("does not block historical completion entries or an execution that already started", async () => {
    const replaced = await session();
    await setSnapshot([uid()]);
    // Entering a completed workout is history, not a new start of an old prescription.
    expect(
      ((await complete(replaced)).rows[0] as { result: { completed: boolean } }).result.completed,
    ).toBe(true);
  });

  it("legacy plans without a snapshot keep the previous day-based rule", async () => {
    await db.query("update training_plans set plan_json='[]'::jsonb where id=$1", [plan]);
    const legacy = await session();
    expect((await start(legacy)).rows).toHaveLength(1);
  });
});
