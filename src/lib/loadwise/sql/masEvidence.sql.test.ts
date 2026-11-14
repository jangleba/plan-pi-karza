import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapSqlDatabase } from "./schemaHarness";
import { masEvidence, masResult } from "@/lib/running/__fixtures__/mas";
import { masEvidenceProblem } from "@/lib/running/masQuality";
let db: PGlite;
const uid = () => crypto.randomUUID();
let owner: string, day: string;
beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function seed() {
  owner = uid();
  const plan = uid();
  day = uid();
  await db.exec("reset role");
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
    owner,
    `${owner}@test.invalid`,
  ]);
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  await db.query("insert into athlete_profiles(user_id,age) values($1,24)", [owner]);
  await db.query(
    "insert into training_plans(id,user_id,active,status,cycle_id) values($1,$2,true,'active',$1)",
    [plan, owner],
  );
  await db.query(
    "insert into training_days(id,user_id,plan_id,date,day_type) values($1,$2,$3,'2026-11-14','own')",
    [day, owner, plan],
  );
}
async function session(pinned = true) {
  const sid = uid();
  await db.query(
    "insert into training_sessions(id,user_id,training_day_id,title,session_type,warmup_json,main_work_json,cooldown_json) values($1,$2,$3,'MAS','Bieg','[]','[]','[]')",
    [sid, owner, day],
  );
  if (pinned)
    await db.query("select save_training_log($1,$2,0,$3::jsonb)", [
      uid(),
      sid,
      JSON.stringify({
        completion_status: "started",
        execution_snapshot: {
          runningRecipe: { id: masEvidence().recipeId, method: "field_mas_test" },
        },
      }),
    ]);
  return sid;
}
async function save(
  sid: string,
  distance = 1300,
  hour = 10,
  overrides: Record<string, unknown> = {},
  operation = uid(),
  version = 0,
) {
  const payload = {
    session_id: sid,
    date: "2026-11-14",
    duration_sec: 1200,
    distance_m: 2500,
    started_at: `2026-11-14T${hour}:00:00Z`,
    ended_at: `2026-11-14T${hour}:20:00Z`,
    is_field_mas_test: true,
    mas_test_attempt: true,
    mas_test_evidence: masEvidence(distance),
    interval_results: [masResult(distance)],
    ...overrides,
  };
  return (
    await db.query<{
      r: {
        activity: { id: string; write_version: number };
        profile: { field_mas_kmh: number | null; field_mas_source_session_id: string | null };
      };
    }>("select save_running_result($1,$2::jsonb,$3) r", [
      operation,
      JSON.stringify(payload),
      version,
    ])
  ).rows[0].r;
}
describe.sequential("atomic MAS measurement acceptance", () => {
  it("client and server accept/reject the same summary boundaries and missing values", async () => {
    const values = [
      masEvidence(),
      { ...masEvidence(), interrupted: true },
      { ...masEvidence(), maxGapSec: 11 },
      { ...masEvidence(), maxAccuracyM: 36 },
      { ...masEvidence(), maxAccuracyM: null },
      { ...masEvidence(), durationSec: 299 },
      { ...masEvidence(), wallDurationSec: 360 },
      { ...masEvidence(), coverageSec: 290 },
      { ...masEvidence(), pointCount: 19 },
      { ...masEvidence(), distanceM: null },
      { ...masEvidence(), distanceM: 2250 },
    ];
    for (const e of values) {
      const result = await db.query<{ ok: boolean }>(
        "select valid_mas_gps_evidence($1::jsonb,$2::jsonb) ok",
        [JSON.stringify(e), JSON.stringify(masResult())],
      );
      expect(result.rows[0].ok, JSON.stringify(e)).toBe(
        masEvidenceProblem(e as ReturnType<typeof masEvidence>) === null,
      );
    }
  });
  it("pins the recipe, saves once and rejects stale edits", async () => {
    await seed();
    const sid = await session(),
      op = uid();
    const first = await save(sid, 1300, 10, {}, op);
    expect(first.profile.field_mas_kmh).toBe(15.6);
    expect((await save(sid, 1500, 10, {}, op)).activity.write_version).toBe(1);
    await expect(save(sid, 1500)).rejects.toMatchObject({ code: "40001" });
    const ordinary = await session(false);
    await expect(save(ordinary)).rejects.toMatchObject({ code: "22023" });
  });
  it("retains a failed attempt without changing calibration and restores the prior test after deletion", async () => {
    await seed();
    const first = await session(),
      second = await session(),
      failed = await session();
    await save(first, 1250, 10);
    const newer = await save(second, 1300, 11);
    const invalid = await save(failed, 1300, 12, {
      is_field_mas_test: false,
      mas_test_evidence: { ...masEvidence(), interrupted: true },
    });
    expect(invalid.profile.field_mas_source_session_id).toBe(second);
    await db.query("select delete_running_activity_atomic($1)", [newer.activity.id]);
    expect(
      (
        await db.query<{ id: string; speed: string }>(
          "select field_mas_source_session_id id,field_mas_kmh::text speed from athlete_profiles where user_id=$1",
          [owner],
        )
      ).rows[0],
    ).toEqual({ id: first, speed: "15.00" });
  });
  it.each([null, 500, 2250])(
    "rejects missing/out-of-range distance %s without writing",
    async (distance) => {
      await seed();
      const sid = await session();
      await expect(
        save(sid, 1300, 10, {
          interval_results: [{ ...masResult(), distanceM: distance }],
          mas_test_evidence: { ...masEvidence(), distanceM: distance },
        }),
      ).rejects.toMatchObject({ code: "22023" });
      expect(
        (await db.query("select id from running_activities where session_id=$1", [sid])).rows,
      ).toHaveLength(0);
    },
  );
});
