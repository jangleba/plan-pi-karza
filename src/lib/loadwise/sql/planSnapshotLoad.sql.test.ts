import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootstrapSqlDatabase } from "./schemaHarness";

const owner = "10000000-0000-4000-8000-000000000001";
const plan = "40000000-0000-4000-8000-000000000001";
const day = "20000000-0000-4000-8000-000000000001";
const date = "2026-11-07";
let db: PGlite;
const uid = () => crypto.randomUUID();

async function session(title: string) {
  const id = uid();
  await db.query(
    "insert into training_sessions(id,user_id,training_day_id,title,session_type,warmup_json,main_work_json,cooldown_json) values($1,$2,$3,$4,'Siła','[]','[]','[]')",
    [id, owner, day, title],
  );
  return id;
}
async function complete(sessionId: string) {
  await db.query(
    "insert into session_logs(user_id,session_id,completed,completion_status,rpe,updated_at,started_at,ended_at) values($1,$2,true,'completed',7,'2026-11-07T11:00Z','2026-11-07T10:00Z','2026-11-07T11:00Z')",
    [owner, sessionId],
  );
}
async function sessionRow(id: string) {
  return (await db.query("select * from training_sessions where id=$1", [id])).rows[0];
}
async function activePlan() {
  return (
    await db.query<{ id: string }>("select id from training_plans where user_id=$1 and active", [
      owner,
    ])
  ).rows[0].id;
}
/** The snapshot the client sends: plan_json days plus their primary sessions only. */
async function persist(days: Array<{ id: string }>, sessions: unknown[]) {
  const expected = await activePlan();
  await db.query(
    "select persist_training_plan_v2($1,'speed','2026-11',$2::jsonb,$3::jsonb,$4::jsonb,'[]',$5,null)",
    [
      uid(),
      JSON.stringify([{ date }]),
      JSON.stringify(days.map((d) => ({ ...d, date, day_type: "own" }))),
      JSON.stringify(sessions),
      expected,
    ],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'a@x.test',now())",
    [owner],
  );
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  await db.query("insert into athlete_profiles(user_id,age) values($1,20)", [owner]);
  await db.query(
    "insert into training_plans(id,user_id,active,status,cycle_id) values($1,$2,true,'active',$1)",
    [plan, owner],
  );
  await db.query(
    "insert into training_days(id,user_id,plan_id,date,day_type) values($1,$2,$3,$4,'own')",
    [day, owner, plan, date],
  );
}, 30000);
beforeEach(() =>
  db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`),
);
afterAll(async () => {
  await db?.close();
});

describe.sequential("plan snapshot writes under load", () => {
  it("indexes every lookup used by RLS, cascades and the executed-slot check", async () => {
    const rows = (
      await db.query<{ indexdef: string }>(
        "select indexdef from pg_indexes where schemaname='public' and tablename in ('training_plans','training_days','training_sessions','session_exercises')",
      )
    ).rows.map((row) => row.indexdef.replace(/\s+/g, " "));
    for (const columns of [
      "training_plans USING btree (user_id, created_at DESC)",
      "training_days USING btree (plan_id)",
      "training_days USING btree (user_id, date)",
      "training_sessions USING btree (training_day_id)",
      "training_sessions USING btree (user_id)",
      "session_exercises USING btree (session_id)",
      "session_exercises USING btree (user_id)",
    ])
      expect(rows.some((row) => row.includes(columns))).toBe(true);
  });

  it("keeps a completed swapped session when the snapshot keeps its day", async () => {
    const original = await session("Plan");
    const swapped = await session("Zamiana");
    await db.query(
      "insert into session_modifications(id,user_id,date,type,new_session_id,new_session_json,active) values($1,$2,$3,'swap',$4,$5::jsonb,true)",
      [uid(), owner, date, swapped, JSON.stringify({ dbId: swapped })],
    );
    await complete(swapped);
    // Before the fix this snapshot was rejected forever and the app retried it on every focus.
    await persist([{ id: day }], [await sessionRow(original)]);
    const kept = (
      await db.query<{ plan_id: string }>(
        "select d.plan_id from training_sessions s join training_days d on d.id=s.training_day_id where s.id=$1",
        [swapped],
      )
    ).rows[0];
    expect(kept.plan_id).toBe(await activePlan());
    expect(
      (await db.query("select 1 from session_logs where session_id=$1", [swapped])).rows,
    ).toHaveLength(1);
  });

  it("still rejects a snapshot that drops an executed planned session", async () => {
    const executed = await session("Wykonana");
    await complete(executed);
    await expect(persist([{ id: day }], [])).rejects.toMatchObject({ code: "40001" });
  });

  it("still rejects dropping the day that holds an executed swapped session", async () => {
    const swapped = await session("Zamiana 2");
    await db.query(
      "insert into session_modifications(id,user_id,date,type,new_session_id,new_session_json,active) values($1,$2,$3,'swap',$4,$5::jsonb,true)",
      [uid(), owner, date, swapped, JSON.stringify({ dbId: swapped })],
    );
    await complete(swapped);
    const planned = (
      await db.query<Record<string, unknown>>(
        "select * from training_sessions where training_day_id=$1",
        [day],
      )
    ).rows.filter((row) => row.id !== swapped);
    const otherDay = uid();
    await expect(
      persist(
        [{ id: otherDay }],
        planned.map((row) => ({ ...row, training_day_id: otherDay })),
      ),
    ).rejects.toMatchObject({ code: "40001" });
  });
});
