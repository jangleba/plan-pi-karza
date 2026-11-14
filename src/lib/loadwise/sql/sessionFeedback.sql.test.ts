import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapSqlDatabase } from "./schemaHarness";

let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001";
const plan = "40000000-0000-4000-8000-000000000001";
const cycle = "40000000-0000-4000-8000-000000000099";
const clubDay = "20000000-0000-4000-8000-000000000001";
const matchDay = "20000000-0000-4000-8000-000000000002";
const uid = () => crypto.randomUUID();

async function seedSession(training_day_id: string) {
  const id = uid();
  await db.query(
    "insert into training_sessions(id,user_id,training_day_id,title,session_type,warmup_json,main_work_json,cooldown_json) values($1,$2,$3,'Trening','Siła','[]','[]','[]')",
    [id, owner, training_day_id],
  );
  return id;
}
async function save(sid: string, version: number, payload: Record<string, unknown>) {
  const r = await db.query<{ r: Record<string, unknown> }>(
    "select save_training_log($1,$2,$3,$4::jsonb) r",
    [uid(), sid, version, JSON.stringify(payload)],
  );
  return r.rows[0].r;
}
const done = (extra: Record<string, unknown> = {}) => ({
  completed: true,
  completion_status: "completed",
  rpe: 7,
  notes: "",
  duration_minutes: 90,
  started_at: "2026-11-12T10:00:00Z",
  ended_at: "2026-11-12T11:30:00Z",
  updated_at: "2026-11-12T11:30:00Z",
  ...extra,
});

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.test',now())",
    [owner],
  );
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  await db.query("insert into athlete_profiles(user_id,age) values($1,20)", [owner]);
  await db.query(
    "insert into training_plans(id,user_id,active,status,cycle_id) values($1,$2,true,'active',$3)",
    [plan, owner, cycle],
  );
  await db.query(
    "insert into training_days(id,user_id,plan_id,date,day_type) values($1,$2,$3,'2026-11-14','club'),($4,$2,$3,'2026-11-15','match')",
    [clubDay, owner, plan, matchDay],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe.sequential("session feedback v1 in the database", () => {
  it("round-trips typed club fields through the versioned RPC and a plain read", async () => {
    const sid = await seedSession(clubDay);
    const row = await save(
      sid,
      0,
      done({
        activity_type: "mixed",
        activity_tags: ["running_endurance", "tactical_game"],
        duration_source: "club_default",
        feedback_version: 1,
      }),
    );
    expect(row.activity_tags).toEqual(["running_endurance", "tactical_game"]);
    expect(row.duration_source).toBe("club_default");
    expect(row.feedback_version).toBe(1);
    const read = (
      await db.query(
        "select activity_tags,duration_source,match_minutes_played from session_logs where session_id=$1",
        [sid],
      )
    ).rows[0];
    expect(read).toEqual({
      activity_tags: ["running_endurance", "tactical_game"],
      duration_source: "club_default",
      match_minutes_played: null,
    });
  });

  it("keeps stored typed fields when a later payload omits them (late RPE from an older client)", async () => {
    const sid = await seedSession(clubDay);
    const first = await save(
      sid,
      0,
      done({
        rpe: null,
        activity_tags: ["technical"],
        duration_source: "club_default",
        feedback_version: 1,
      }),
    );
    const second = await save(sid, Number(first.write_version), done({ rpe: 9 }));
    expect(second.rpe).toBe(9);
    expect(second.activity_tags).toEqual(["technical"]);
    expect(second.duration_source).toBe("club_default");
  });

  it("stores played minutes, accepts 0, requires them for a new match completion", async () => {
    const sid = await seedSession(matchDay);
    await expect(save(sid, 0, done({ feedback_version: 1 }))).rejects.toThrow(/Match minutes/);
    const row = await save(
      sid,
      0,
      done({ feedback_version: 1, match_minutes_played: 0, duration_minutes: 115 }),
    );
    expect(row.match_minutes_played).toBe(0);
    expect(row.duration_minutes).toBe(115);
  });

  it("rejects out-of-range minutes, unknown tags and RPE 0 for new feedback, but reads legacy RPE 0", async () => {
    const sid = await seedSession(matchDay);
    await expect(
      save(sid, 0, done({ feedback_version: 1, match_minutes_played: 181 })),
    ).rejects.toThrow();
    const club = await seedSession(clubDay);
    await expect(save(club, 0, done({ activity_tags: ["swimming"] }))).rejects.toThrow();
    await expect(save(club, 0, done({ rpe: 0, feedback_version: 1 }))).rejects.toThrow(/RPE/);
    // Legacy payload (no feedback_version) with RPE 0 is still accepted and readable.
    const legacy = await save(club, 0, done({ rpe: 0 }));
    expect(legacy.rpe).toBe(0);
    expect(legacy.feedback_version).toBeNull();
  });

  it("does not let another user's session be written through this owner's feedback", async () => {
    const foreign = uid();
    await expect(save(foreign, 0, done({ feedback_version: 1 }))).rejects.toThrow();
  });

  it("the read-only readiness script for the target database is valid and all checks pass on the full chain", async () => {
    const sql = readFileSync(
      "supabase/verification/engine_v24_session_feedback_readiness.sql",
      "utf8",
    );
    const result = await db.query<{ n: number; check_name: string; ok: boolean }>(sql);
    expect(result.rows).toHaveLength(11);
    expect(result.rows.filter((r) => !r.ok).map((r) => r.check_name)).toEqual([]);
  });
});
