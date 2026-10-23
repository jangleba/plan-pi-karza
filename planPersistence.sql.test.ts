import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001";
const dayId = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const planId = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated;
    create table training_plans(id uuid primary key,user_id uuid,goal text,month text,
      plan_json jsonb,status text,active boolean,created_at timestamptz default now());
    create table training_days(id uuid primary key,user_id uuid,plan_id uuid references training_plans,
      date date,day_type text,decision_reason text);
    create table training_sessions(id uuid primary key,user_id uuid,training_day_id uuid references training_days,
      session_type text,title text,goal text,duration_min integer,intensity text,
      warmup_json jsonb,main_work_json jsonb,cooldown_json jsonb,safety_notes text);
    create table session_exercises(id uuid primary key,user_id uuid,session_id uuid references training_sessions,
      order_index integer,name text,section text,reps text,duration text,distance text,rest text,coaching_cues text);
    create table weekly_transitions(id uuid primary key,user_id uuid,week_number integer,next_match_date date,
      next_match_dates date[],no_match_next_week boolean,confirmed_at timestamptz,unique(user_id,week_number));
    create table session_logs(id uuid primary key default gen_random_uuid(),user_id uuid,session_id uuid,
      completed boolean,completion_status text,updated_at timestamptz,unique(user_id,session_id));
    create table exercise_set_logs(id uuid primary key default gen_random_uuid(),user_id uuid,session_id uuid,
      exercise_key text,set_number integer,weight_kg numeric,performed_at timestamptz,
      unique(user_id,session_id,exercise_key,set_number));
    create table athlete_profiles(user_id uuid primary key,field_mas_kmh numeric,field_mas_tested_at date,
      running_progression_level integer,running_progression_updated_at timestamptz);
    create table running_activities(id uuid primary key,user_id uuid,date date,session_id uuid,
      is_field_mas_test boolean,created_at timestamptz default now());
    grant select,insert,update,delete on all tables in schema public to authenticated;
  `);
  for (const table of [
    "training_plans",
    "training_days",
    "training_sessions",
    "session_exercises",
    "weekly_transitions",
    "session_logs",
    "exercise_set_logs",
    "athlete_profiles",
    "running_activities",
  ]) {
    await db.exec(`alter table ${table} enable row level security;
      create policy owned on ${table} for all to authenticated
      using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);`);
  }
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018095208_reliable_plan_and_training_writes.sql",
      "utf8",
    ),
  );
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
}, 30_000);
afterAll(async () => {
  await db?.close();
});

async function persist(
  n: number,
  expected?: number,
  transition: unknown = null,
  title = "Trening",
) {
  return db.query(
    "select persist_training_plan_v2($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb)",
    [
      planId(n),
      "speed",
      "2026-10",
      JSON.stringify([{ date: "2026-10-18", dbId: sessionId }]),
      JSON.stringify([{ id: dayId, date: "2026-10-18", day_type: "training" }]),
      JSON.stringify([{ id: sessionId, training_day_id: dayId, title }]),
      JSON.stringify([{ id: crypto.randomUUID(), session_id: sessionId, name: "Sprint" }]),
      expected ? planId(expected) : null,
      JSON.stringify(transition),
    ],
  );
}

describe.sequential("Postgres plan transaction and ordering", () => {
  it("reuses session IDs without duplicating exercise rows and retains workout logs", async () => {
    await persist(1);
    await db.query(
      "insert into session_logs(user_id,session_id,completed,completion_status,updated_at) values($1,$2,true,'completed','2026-10-18T12:00:00Z')",
      [owner, sessionId],
    );
    await persist(2, 1);
    expect((await db.query("select count(*)::int as n from training_sessions")).rows).toEqual([
      { n: 1 },
    ]);
    expect((await db.query("select count(*)::int as n from session_exercises")).rows).toEqual([
      { n: 1 },
    ]);
    expect((await db.query("select completed from session_logs")).rows).toEqual([
      { completed: true },
    ]);
    expect((await db.query("select id from training_plans where active")).rows).toEqual([
      { id: planId(2) },
    ]);
  });
  it("rejects a stale snapshot and rolls back an altered existing prescription", async () => {
    await expect(persist(3, 1)).rejects.toThrow(/another device/);
    await expect(persist(3, 2, null, "Inny trening")).rejects.toThrow(/different prescription/);
    expect((await db.query("select id from training_plans where active")).rows).toEqual([
      { id: planId(2) },
    ]);
  });
  it("commits a weekly transition and plan atomically and handles retries", async () => {
    const transition = {
      id: crypto.randomUUID(),
      weekNumber: 1,
      nextMatchDate: "2026-10-25",
      nextMatchDates: ["2026-10-25"],
      noMatchNextWeek: false,
      confirmedAt: "2026-10-18T12:00:00Z",
    };
    await persist(3, 2, transition);
    await persist(3, 2, transition);
    expect((await db.query("select week_number from weekly_transitions")).rows).toEqual([
      { week_number: 1 },
    ]);
    expect((await db.query("select count(*)::int as n from training_plans")).rows).toEqual([
      { n: 3 },
    ]);
    await expect(persist(4, 3, { ...transition, id: "invalid" })).rejects.toThrow();
    expect((await db.query("select id from training_plans where active")).rows).toEqual([
      { id: planId(3) },
    ]);
  });
  it("prevents a stale or started replay from undoing a completed workout", async () => {
    await db.query(
      "update session_logs set completed=false,completion_status='started',updated_at='2026-10-19' where user_id=$1",
      [owner],
    );
    expect((await db.query("select completed,completion_status from session_logs")).rows).toEqual([
      { completed: true, completion_status: "completed" },
    ]);
  });
  it("prevents an older set from replacing a newer set", async () => {
    await db.query(
      "insert into exercise_set_logs(user_id,session_id,exercise_key,set_number,weight_kg,performed_at) values($1,$2,'squat',1,80,'2026-10-18T12:00:00Z')",
      [owner, sessionId],
    );
    await db.query("update exercise_set_logs set weight_kg=50,performed_at='2026-10-18T11:00:00Z'");
    expect((await db.query("select weight_kg::int as weight from exercise_set_logs")).rows).toEqual(
      [{ weight: 80 }],
    );
  });
  it("atomically clears only the MAS source when deleting an archived test", async () => {
    const oldSession = "30000000-0000-4000-8000-000000000009";
    const oldActivity = crypto.randomUUID(),
      sourceActivity = crypto.randomUUID();
    await db.query(
      "insert into athlete_profiles(user_id,field_mas_kmh,field_mas_tested_at,field_mas_source_session_id,running_progression_level) values($1,18,'2026-10-17',$2,2)",
      [owner, oldSession],
    );
    await db.query(
      "insert into running_activities(id,user_id,date,session_id,is_field_mas_test) values($1,$2,'2026-10-17',$3,true),($4,$2,'2026-10-16',$5,true)",
      [sourceActivity, owner, oldSession, oldActivity, sessionId],
    );
    expect(
      (await db.query("select delete_running_activity_atomic($1) as cleared", [oldActivity])).rows,
    ).toEqual([{ cleared: false }]);
    expect((await db.query("select field_mas_kmh::int as mas from athlete_profiles")).rows).toEqual(
      [{ mas: 18 }],
    );
    expect(
      (await db.query("select delete_running_activity_atomic($1) as cleared", [sourceActivity]))
        .rows,
    ).toEqual([{ cleared: true }]);
    expect(
      (
        await db.query(
          "select field_mas_kmh,field_mas_source_session_id,running_progression_level from athlete_profiles",
        )
      ).rows,
    ).toEqual([
      { field_mas_kmh: null, field_mas_source_session_id: null, running_progression_level: 0 },
    ]);
    expect((await db.query("select * from running_activities")).rows).toEqual([]);
  });
  it("keeps another owner's IDs and results inaccessible under RLS", async () => {
    await db.exec(
      "select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false)",
    );
    expect((await db.query("select * from session_logs")).rows).toEqual([]);
    await expect(persist(5)).rejects.toThrow();
  });
});
