import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { bootstrapSqlDatabase } from "./schemaHarness";
import { readFileSync } from "node:fs";
import { gymRecordKey, type GymRecordData, type GymEquipment } from "../gymEvidence";
let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const sid = "30000000-0000-4000-8000-000000000001";
const equipment: GymEquipment = {
  kind: "equipment",
  version: 1,
  exerciseId: "goblet_squat",
  id: crypto.randomUUID(),
  label: "Hantla — klub",
  convention: "per_hand",
  incrementKg: 0.5,
};
async function as(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function save(
  data: GymRecordData,
  version: number | null = 0,
  op = crypto.randomUUID(),
  extra: Record<string, unknown> = {},
) {
  const result = await db.query<{ r: Record<string, unknown> }>(
    "select save_gym_record($1,$2,$3::jsonb) r",
    [
      op,
      version,
      JSON.stringify({ user_id: owner, record_key: gymRecordKey(data), payload: data, ...extra }),
    ],
  );
  return result.rows[0].r;
}
beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.test',now()),($2,'b@example.test',now())",
    [owner, other],
  );
  await as(owner);
  await db.query("insert into athlete_profiles(user_id,age) values($1,20)", [owner]);
  const plan = crypto.randomUUID(),
    day = crypto.randomUUID();
  await db.query(
    "insert into training_plans(id,user_id,active,status,cycle_id) values($1,$2,true,'active',$3)",
    [plan, owner, crypto.randomUUID()],
  );
  await db.query(
    "insert into training_days(id,user_id,plan_id,date,day_type) values($1,$2,$3,'2026-11-15','own')",
    [day, owner, plan],
  );
  await db.query(
    "insert into training_sessions(id,user_id,training_day_id,title,session_type,warmup_json,main_work_json,cooldown_json) values($1,$2,$3,'Siła A','Siła','[]','[]','[]')",
    [sid, owner, day],
  );
  await db.query("select save_training_log($1,$2,0,$3::jsonb)", [
    crypto.randomUUID(),
    sid,
    JSON.stringify({
      completed: false,
      completion_status: "started",
      started_at: "2026-11-15T10:00:00Z",
      execution_snapshot: {
        date: "2026-11-15",
        engineV2: {
          roles: ["strengthA"],
          exercises: [{ exerciseId: "goblet_squat" }, { exerciseId: "gym_cmj" }],
        },
      },
    }),
  ]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("gym evidence SQL ownership, validation and replay", () => {
  it("round-trips equipment, acknowledges a replay once and rejects a stale concurrent edit", async () => {
    const op = crypto.randomUUID();
    expect(await save(equipment, 0, op)).toMatchObject({
      revision: 1,
      payload: equipment,
      user_id: owner,
    });
    expect(await save(equipment, 0, op)).toMatchObject({ revision: 1 });
    const revised = { ...equipment, incrementKg: 1 };
    expect(await save(revised, 1)).toMatchObject({ revision: 2 });
    await expect(save(equipment, 1)).rejects.toThrow(/changed on another device/);
    expect(await save(equipment, 0, op)).toMatchObject({ revision: 2, payload: revised });
  });
  it("accepts only a proven offline predecessor for the same owned record", async () => {
    const first = { ...equipment, exerciseId: "bench_press" };
    const op = crypto.randomUUID();
    await save(first, 0, op);
    expect(
      await save({ ...first, incrementKg: 2 }, 0, crypto.randomUUID(), {
        _predecessor_operation_ids: [op],
      }),
    ).toMatchObject({ revision: 2 });
    await expect(
      save({ ...first, incrementKg: 3 }, 0, crypto.randomUUID(), {
        _predecessor_operation_ids: [crypto.randomUUID()],
      }),
    ).rejects.toThrow(/changed/);
  });
  it("records an unanswered equipment reference without inventing acceptance or a failure", async () => {
    const d: GymRecordData = {
      kind: "response",
      version: 1,
      sessionId: sid,
      exerciseId: "goblet_squat",
      decision: "unanswered",
      chosenKg: 25,
      equipment,
      prescriptionKey: "dose",
      suggestionKey: "proposal",
    };
    expect(await save(d)).toMatchObject({ payload: { decision: "unanswered", chosenKg: 25 } });
  });
  it("stores explicit loss of control without made-up counts or measurements", async () => {
    const d: GymRecordData = {
      kind: "observation",
      version: 1,
      sessionId: sid,
      exerciseId: "gym_cmj",
      observation: {
        sessionId: sid,
        exerciseId: "gym_cmj",
        source: "athlete_observed",
        sets: [],
        controlLossReported: true,
      },
    };
    expect(await save(d)).toMatchObject({
      payload: { observation: { sets: [], controlLossReported: true } },
    });
  });
  it("rejects records for an exercise absent from the pinned session", async () => {
    const d: GymRecordData = {
      kind: "observation",
      version: 1,
      sessionId: sid,
      exerciseId: "not-in-session",
      observation: {
        sessionId: sid,
        exerciseId: "not-in-session",
        source: "athlete_observed",
        sets: [],
      },
    };
    await expect(save(d)).rejects.toThrow(/row-level|permission/i);
  });
  it("does not expose another athlete's data or let them attach evidence to this session", async () => {
    await as(other);
    expect((await db.query("select * from gym_records")).rows).toHaveLength(0);
    await expect(save(equipment)).rejects.toThrow(/Not authorised/);
    await expect(
      db.query("select save_gym_record($1,0,$2::jsonb)", [
        crypto.randomUUID(),
        JSON.stringify({
          user_id: other,
          record_key: `observation:${sid}:gym_cmj`,
          payload: {
            kind: "observation",
            version: 1,
            sessionId: sid,
            exerciseId: "gym_cmj",
            observation: {
              sessionId: sid,
              exerciseId: "gym_cmj",
              source: "athlete_observed",
              sets: [],
            },
          },
        }),
      ]),
    ).rejects.toThrow(/row-level|permission/i);
    await as(owner);
  });
  it.each([
    { ...equipment, version: undefined },
    { ...equipment, incrementKg: -1 },
    { ...equipment, availableWeightsKg: [0] },
    { ...equipment, convention: "unknown" },
    { kind: "response", version: 1, sessionId: sid, exerciseId: "goblet_squat" },
    { kind: "band_setup", version: 1, setup: {} },
    {
      kind: "observation",
      version: 1,
      sessionId: sid,
      exerciseId: "gym_cmj",
      observation: { sessionId: sid, exerciseId: "gym_cmj", source: "timer", sets: [] },
    },
  ])("rejects malformed data %j at the database boundary", async (data) => {
    const r = await db.query<{ valid: boolean }>(
      "select valid_gym_record($1::jsonb) is true as valid",
      [JSON.stringify(data)],
    );
    expect(r.rows[0].valid).toBe(false);
  });
  it("rejects a null CAS version and anonymous writes", async () => {
    await expect(save(equipment, null)).rejects.toThrow(/Invalid gym record/);
    await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false);");
    await expect(db.query("select * from gym_records")).rejects.toThrow(/permission denied/);
    await expect(save(equipment)).rejects.toThrow(/permission denied/);
    await as(owner);
    const checks = await db.exec(
      readFileSync(
        new URL("../../../../supabase/verification/gym_training_evidence.sql", import.meta.url),
        "utf8",
      ),
    );
    expect(checks[0].rows).toHaveLength(2);
    expect(
      checks[0].rows.every(
        (r) =>
          r.present && r.rls_enabled && r.owner_role_select && !r.anon_select && !r.anon_insert,
      ),
    ).toBe(true);
    expect(checks[2].rows).toHaveLength(4);
    expect(
      checks[2].rows.every(
        (r) => !r.security_definer && !r.anon_execute && r.authenticated_execute,
      ),
    ).toBe(true);
    expect(checks[3].rows).toHaveLength(2);
    expect(checks[3].rows.every((r) => r.delete_cascades)).toBe(true);
  });
});
