import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

import { LEGAL_VERSION, CONSENTS } from "../legal";

let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const day = "20000000-0000-4000-8000-000000000001";
const cycle = "40000000-0000-4000-8000-000000000099";
const plan = "40000000-0000-4000-8000-000000000001";
const uid = () => crypto.randomUUID();
async function login(id = owner) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function seedSession(title = "Trening") {
  const id = uid();
  await db.query(
    "insert into training_sessions(id,user_id,training_day_id,title,session_type,warmup_json,main_work_json,cooldown_json) values($1,$2,$3,$4,'Siła','[]','[]','[]')",
    [id, owner, day, title],
  );
  return id;
}
async function log(
  id: string,
  version: number,
  payload: Record<string, unknown>,
  operation = uid(),
) {
  const r = await db.query<{ result: Record<string, unknown> }>(
    "select save_training_log($1,$2,$3,$4::jsonb) result",
    [operation, id, version, JSON.stringify(payload)],
  );
  return r.rows[0].result;
}
const completed = (rpe = 8) => ({
  completed: true,
  completion_status: "completed",
  rpe,
  notes: "",
  duration_minutes: 60,
  updated_at: "2026-10-17T11:00:00Z",
  started_at: "2026-10-17T10:00:00Z",
  ended_at: "2026-10-17T11:00:00Z",
});
const intervals = (count = 4) =>
  Array.from({ length: count }, (_, i) => ({
    kind: "work",
    completed: true,
    targetMode: "time",
    targetValue: 180,
    durationSec: 180,
    distanceM: 600,
    paceSecPerKm: 300,
    repeatTotal: count,
    repeatIndex: i + 1,
  }));
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
    "insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.test',now()),($2,'b@example.test',now())",
    [owner, other],
  );
  await login();
  await db.query("insert into athlete_profiles(user_id,age) values($1,20)", [owner]);
  await db.query(
    "insert into training_plans(id,user_id,active,status,cycle_id) values($1,$2,true,'active',$3)",
    [plan, owner, cycle],
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

describe.sequential("full migration runtime contracts", () => {
  it("standardizes all eight list columns and supports actual profile consent withdrawal", async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int n from information_schema.columns where table_schema='public' and data_type='jsonb' and (table_name,column_name) in (('athlete_profiles','unavailable_days'),('athlete_profiles','unavailable_equipment_ids'),('athlete_profiles','food_allergies'),('athlete_profiles','food_intolerances'),('athlete_profiles','food_exclusions'),('athlete_profiles','match_dates'),('readiness_logs','red_flags'),('weekly_transitions','next_match_dates'))",
    );
    expect(r.rows[0].n).toBe(8);
    await db.query("select record_consent('health_data',true)");
    await db.query(
      "update athlete_profiles set health_personalization_enabled=true,pain_locations='[\"knee\"]',food_allergies='[\"milk\"]',fuel_allergy_status='has_allergies' where user_id=$1",
      [owner],
    );
    await db.query("select record_consent('health_data',false)");
    const p = (
      await db.query(
        "select health_personalization_enabled,pain_locations,food_allergies from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0];
    expect(p).toEqual({
      health_personalization_enabled: false,
      pain_locations: [],
      food_allergies: [],
    });
  });
  it("supports the real legacy PostgREST conflict target and rejects a stale completed replay", async () => {
    const sid = await seedSession();
    const q =
      "insert into session_logs(user_id,session_id,completed,completion_status,rpe,updated_at,started_at,ended_at) values($1,$2,true,'completed',$3,$4,'2026-10-17T10:00Z','2026-10-17T11:00Z') on conflict(user_id,session_id) do update set rpe=excluded.rpe,updated_at=excluded.updated_at";
    await db.query(q, [owner, sid, 8, "2026-10-17T11:00Z"]);
    await db.query(q, [owner, sid, 2, "2026-10-17T10:30Z"]);
    expect(
      (await db.query<{ rpe: number }>("select rpe from session_logs where session_id=$1", [sid]))
        .rows[0].rpe,
    ).toBe(8);
  });
  it("uses operation receipts and server CAS while preserving offline chronology and execution snapshot", async () => {
    const sid = await seedSession(),
      op = uid(),
      snapshot = { dbId: sid, title: "Pinned" };
    const first = await log(sid, 0, { ...completed(), execution_snapshot: snapshot }, op);
    expect(first.write_version).toBe(1);
    expect(first.started_at).toBe("2026-10-17T10:00:00+00:00");
    expect(first.ended_at).toBe("2026-10-17T11:00:00+00:00");
    expect((await log(sid, 0, completed(2), op)).rpe).toBe(8);
    await expect(log(sid, 0, completed(2))).rejects.toMatchObject({ code: "40001" });
    const edited = await log(sid, 1, {
      ...completed(6),
      updated_at: "2026-10-17T10:00Z",
      execution_snapshot: { title: "Wrong" },
    });
    expect(edited.write_version).toBe(2);
    expect(edited.rpe).toBe(6);
    expect(edited.execution_snapshot).toEqual(snapshot);
  });
  it("rebases a coalesced write only onto acknowledged predecessors for the same target", async () => {
    const sid = await seedSession(),
      op = uid();
    await log(
      sid,
      0,
      {
        completed: false,
        completion_status: "started",
        updated_at: "2026-10-17T10:00Z",
        started_at: "2026-10-17T10:00Z",
      },
      op,
    );
    expect(
      (await log(sid, 0, { ...completed(7), _predecessor_operation_ids: [op] })).write_version,
    ).toBe(2);
    await expect(
      log(sid, 0, { ...completed(2), _predecessor_operation_ids: [op] }),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("stores sets idempotently and rejects edits made from a stale device", async () => {
    const sid = await seedSession(),
      op = uid();
    const payload = {
      session_id: sid,
      exercise_key: "squat",
      set_number: 1,
      weight_kg: 80,
      performed_at: "2026-10-17T10:00Z",
    };
    const save = (version: number, id = uid(), weight = 80) =>
      db.query<{ r: Record<string, unknown> }>("select save_exercise_set($1,$2::jsonb,$3) r", [
        id,
        JSON.stringify({ ...payload, weight_kg: weight }),
        version,
      ]);
    const first = (await save(0, op)).rows[0].r;
    expect(first.write_version).toBe(1);
    expect((await save(0, op, 50)).rows[0].r.weight_kg).toBe(80);
    await expect(save(0, uid(), 50)).rejects.toMatchObject({ code: "40001" });
    expect((await save(1, uid(), 85)).rows[0].r.write_version).toBe(2);
  });
  it("persists running interval evidence and applies progression only once", async () => {
    const sid = await seedSession();
    const p = {
      id: uid(),
      session_id: sid,
      date: "2026-10-17",
      duration_sec: 720,
      distance_m: 2400,
      avg_pace_sec_per_km: 300,
      interval_results: intervals(),
      started_at: "2026-10-17T10:00Z",
      ended_at: "2026-10-17T10:12Z",
    };
    await db.query("select save_running_result($1,$2::jsonb,0)", [uid(), JSON.stringify(p)]);
    await log(sid, 0, completed(6));
    expect(
      (
        await db.query<{ running_progression_level: number }>(
          "select running_progression_level from athlete_profiles where user_id=$1",
          [owner],
        )
      ).rows[0].running_progression_level,
    ).toBe(1);
    await log(sid, 1, completed(5));
    expect(
      (
        await db.query<{ running_progression_level: number }>(
          "select running_progression_level from athlete_profiles where user_id=$1",
          [owner],
        )
      ).rows[0].running_progression_level,
    ).toBe(1);
  });
  it("does not increase progression without RPE or consistent completed pace", async () => {
    expect(
      (
        await db.query<{ n: number }>("select next_running_level(1,null,$1::jsonb) n", [
          JSON.stringify(intervals()),
        ])
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query<{ n: number }>("select next_running_level(1,9,$1::jsonb) n", [
          JSON.stringify(intervals()),
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("atomically stores MAS source and clears it on deletion", async () => {
    const sid = await seedSession(),
      id = uid();
    const p = {
      id,
      session_id: sid,
      date: "2026-10-17",
      duration_sec: 300,
      distance_m: 1500,
      is_field_mas_test: true,
      interval_results: [
        {
          kind: "work",
          completed: true,
          targetMode: "time",
          targetValue: 300,
          durationSec: 300,
          distanceM: 1500,
        },
      ],
    };
    const result = (
      await db.query<{
        r: {
          activity: { id: string };
          profile: { field_mas_kmh: number; field_mas_source_session_id: string };
        };
      }>("select save_running_result($1,$2::jsonb,0) r", [uid(), JSON.stringify(p)])
    ).rows[0].r;
    expect(result.profile.field_mas_kmh).toBe(18);
    expect(result.profile.field_mas_source_session_id).toBe(sid);
    expect(
      (
        await db.query<{ cleared: boolean }>("select delete_running_activity_atomic($1) cleared", [
          id,
        ])
      ).rows[0].cleared,
    ).toBe(true);
    expect(
      (
        await db.query<{ field_mas_kmh: unknown }>(
          "select field_mas_kmh from athlete_profiles where user_id=$1",
          [owner],
        )
      ).rows[0].field_mas_kmh,
    ).toBeNull();
  });
  it("rejects other-owner parent IDs and does not expose receipts or logs", async () => {
    const sid = await seedSession();
    await log(sid, 0, completed());
    await login(other);
    expect((await db.query("select * from session_logs")).rows).toEqual([]);
    expect((await db.query("select * from training_write_receipts")).rows).toEqual([]);
    await expect(
      db.query(
        "insert into session_logs(user_id,session_id,completed,completion_status) values($1,$2,true,'completed')",
        [other, sid],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("rolls back both modified slots and metadata if the second insert fails", async () => {
    const original = await seedSession(),
      newId = uid(),
      second = uid(),
      mid = uid();
    const row = (
      await db.query<Record<string, unknown>>("select * from training_sessions where id=$1", [
        original,
      ])
    ).rows[0];
    const newRow = { ...row, id: newId, title: "Changed" };
    const badSecond = { ...row, id: second, training_day_id: uid() };
    const mod = {
      id: mid,
      date: "2026-10-17",
      type: "swap",
      original_session_id: original,
      new_session_id: newId,
      original_session_json: { dbId: original },
      new_session_json: { dbId: newId, secondSession: { dbId: second } },
    };
    await expect(
      db.query("select apply_plan_modification($1,$2::jsonb,$3::jsonb,'[]',$4,$5::jsonb,'[]')", [
        uid(),
        JSON.stringify(mod),
        JSON.stringify(newRow),
        plan,
        JSON.stringify(badSecond),
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (await db.query("select id from training_sessions where id in($1,$2)", [newId, second])).rows,
    ).toEqual([]);
    expect(
      (await db.query("select id from session_modifications where id=$1", [mid])).rows,
    ).toEqual([]);
  });
  it("protects executed second slots even if a modification omits them", async () => {
    const original = await seedSession(),
      second = await seedSession(),
      replacement = uid();
    await log(second, 0, completed());
    await db.query("update training_plans set plan_json=$1::jsonb where id=$2", [
      JSON.stringify([{ date: "2026-10-17", dbId: original, secondSession: { dbId: second } }]),
      plan,
    ]);
    const row = (
      await db.query<Record<string, unknown>>("select * from training_sessions where id=$1", [
        original,
      ])
    ).rows[0];
    const mod = {
      id: uid(),
      date: "2026-10-17",
      type: "swap",
      original_session_json: { dbId: original },
      new_session_json: { dbId: replacement },
    };
    await expect(
      db.query("select apply_plan_modification($1,$2::jsonb,$3::jsonb,'[]',$4)", [
        uid(),
        JSON.stringify(mod),
        JSON.stringify({ ...row, id: replacement }),
        plan,
      ]),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("saves and undoes a modification without deleting normalized prescriptions", async () => {
    const original = await seedSession(),
      newId = uid(),
      mid = uid();
    const row = (
      await db.query<Record<string, unknown>>("select * from training_sessions where id=$1", [
        original,
      ])
    ).rows[0];
    // Include existing executed second slot in the unchanged command snapshot.
    const snapshot = (
      await db.query<{ plan_json: Array<{ secondSession?: { dbId: string } }> }>(
        "select plan_json from training_plans where id=$1",
        [plan],
      )
    ).rows[0].plan_json[0];
    const sid = snapshot?.secondSession?.dbId;
    const secondRow = sid
      ? (
          await db.query<Record<string, unknown>>("select * from training_sessions where id=$1", [
            sid,
          ])
        ).rows[0]
      : null;
    const mod = {
      id: mid,
      date: "2026-10-17",
      type: "swap",
      original_session_json: { dbId: original, secondSession: sid ? { dbId: sid } : null },
      new_session_json: { dbId: newId, secondSession: sid ? { dbId: sid } : null },
    };
    await db.query(
      "select apply_plan_modification($1,$2::jsonb,$3::jsonb,'[]',$4,$5::jsonb,'[]')",
      [
        uid(),
        JSON.stringify(mod),
        JSON.stringify({ ...row, id: newId }),
        plan,
        JSON.stringify(secondRow),
      ],
    );
    // The executed second remains protected, so undo cannot hide it by changing
    // visibility of the enclosing swap. A separate unexecuted addition can undo.
    const addId = uid(),
      addedId = await seedSession();
    await db.query(
      "insert into session_modifications(id,user_id,date,type,new_session_json,active) values($1,$2,'2026-10-17','add',$3::jsonb,true)",
      [addId, owner, JSON.stringify({ dbId: addedId })],
    );
    await db.query("select undo_plan_modification($1)", [addId]);
    expect(
      (
        await db.query<{ active: boolean }>(
          "select active from session_modifications where id=$1",
          [addId],
        )
      ).rows[0].active,
    ).toBe(false);
    expect(
      (await db.query("select id from training_sessions where id=$1", [addedId])).rows,
    ).toHaveLength(1);
  });
  it("updates both profile rows with CAS and rolls them back when plan persistence fails", async () => {
    const version = (
      await db.query<{ v: string }>(
        "select updated_at::text v from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0].v;
    const previous = (
      await db.query<{ full_name: string }>("select full_name from profiles where user_id=$1", [
        owner,
      ])
    ).rows[0].full_name;
    const invalidPlan = {
      p_plan_id: uid(),
      p_expected_plan_id: uid(),
      p_goal: "speed",
      p_month: "2026-10",
      p_plan_json: [{ date: "2026-10-17", cycleId: cycle }],
      p_days: [{ id: day, date: "2026-10-17" }],
      p_sessions: [],
      p_exercises: [],
    };
    await expect(
      db.query("select save_profile_and_plan($1::jsonb,$2::jsonb,$3::jsonb,$4::timestamptz)", [
        JSON.stringify({ full_name: "Must rollback" }),
        JSON.stringify({ main_goal: "speed" }),
        JSON.stringify(invalidPlan),
        version,
      ]),
    ).rejects.toMatchObject({ code: "40001" });
    expect(
      (
        await db.query<{ full_name: string }>("select full_name from profiles where user_id=$1", [
          owner,
        ])
      ).rows[0].full_name,
    ).toBe(previous);
    const result = (
      await db.query<{ r: { profile: { full_name: string }; athlete: { main_goal: string } } }>(
        "select save_profile_and_plan($1::jsonb,$2::jsonb,null,$3::timestamptz) r",
        [JSON.stringify({ full_name: "Updated" }), JSON.stringify({ main_goal: "speed" }), version],
      )
    ).rows[0].r;
    expect(result.profile.full_name).toBe("Updated");
    expect(result.athlete.main_goal).toBe("speed");
    await expect(
      db.query("select save_profile_and_plan('{}','{}',null,$1::timestamptz)", [version]),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("saves readiness and pain atomically with consent enforced", async () => {
    const p = {
      date: "2026-10-17",
      sleep: 7,
      energy: 7,
      fatigue: 4,
      soreness: 4,
      stress: 3,
      pain_level: 2,
      pain_location: "knee",
      overall: 7,
    };
    await expect(
      db.query("select save_readiness_checkin($1::jsonb)", [JSON.stringify(p)]),
    ).rejects.toThrow();
    expect((await db.query("select * from readiness_logs where user_id=$1", [owner])).rows).toEqual(
      [],
    );
    await db.query("select record_consent('health_data',true)");
    await db.query(
      "update athlete_profiles set health_personalization_enabled=true where user_id=$1",
      [owner],
    );
    await db.query("select save_readiness_checkin($1::jsonb)", [JSON.stringify(p)]);
    expect(
      (
        await db.query<{ pain_level: number }>(
          "select pain_level from pain_logs where user_id=$1",
          [owner],
        )
      ).rows[0].pain_level,
    ).toBe(2);
    await db.query("select save_readiness_checkin($1::jsonb)", [
      JSON.stringify({ ...p, pain_level: 0 }),
    ]);
    expect((await db.query("select * from pain_logs where user_id=$1", [owner])).rows).toEqual([]);
    await db.query("select record_consent('health_data',false)");
  });
  it("keeps equipment overlap and the profile timestamp atomic", async () => {
    const first = uid(),
      second = uid();
    const replacement = (id: string, ids: string[]) => ({
      id,
      date: "2026-10-17",
      exercise_id: id,
      original_json: { name: "Old" },
      replacement_json: { name: "New" },
      equipment_ids: ids,
    });
    await db.query("select set_equipment_replacement($1,$2::jsonb)", [
      uid(),
      JSON.stringify(replacement(first, ["sled", "bench"])),
    ]);
    await db.query("select set_equipment_replacement($1,$2::jsonb)", [
      uid(),
      JSON.stringify(replacement(second, ["bench"])),
    ]);
    const result = (
      await db.query<{ r: { unavailable_equipment_ids: string[]; profile_updated_at: string } }>(
        "select set_equipment_replacement($1,null,$2) r",
        [uid(), first],
      )
    ).rows[0].r;
    expect(result.unavailable_equipment_ids).toEqual(["bench"]);
    expect(result.profile_updated_at).toEqual(expect.any(String));
    expect(
      (
        await db.query<{ active: boolean }>(
          "select active from exercise_replacements where id=$1",
          [first],
        )
      ).rows[0].active,
    ).toBe(false);
  });
  it("allows only the service role to record store entitlement and ignores older verification", async () => {
    const call =
      "select record_billing_entitlement($1,$2,$3::timestamptz,$4::timestamptz,'pro.monthly','APP_STORE',$5)";
    await expect(
      db.query(call, [owner, "active", "2026-12-01", "2026-10-17T12:00Z", "evt-new"]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role; set role service_role");
    await db.query(call, [owner, "active", "2026-12-01", "2026-10-17T12:00Z", "evt-new"]);
    await db.query(call, [owner, "expired", "2026-10-16", "2026-10-17T11:00Z", "evt-old"]);
    await db.query(call, [owner, "active", "2026-12-01", "2026-10-17T12:00Z", "evt-new"]);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from billing_entitlements where user_id=$1",
          [owner],
        )
      ).rows[0].status,
    ).toBe("active");
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from billing_events where user_id=$1",
          [owner],
        )
      ).rows[0].n,
    ).toBe(2);
    await login(other);
    expect((await db.query("select * from billing_entitlements")).rows).toEqual([]);
  });
  it("backs up each device with owner isolation, idempotence and CAS", async () => {
    const device = uid(),
      op = uid();
    const save = (version: number, operation = uid()) =>
      db.query<{ r: { revision: number } }>(
        "select save_module_backup('lab',$1,$2,$3,$4::jsonb) r",
        [device, version, operation, JSON.stringify({ results: [{ id: "local" }] })],
      );
    expect((await save(0, op)).rows[0].r.revision).toBe(1);
    expect((await save(0, op)).rows[0].r.revision).toBe(1);
    await expect(save(0)).rejects.toMatchObject({ code: "40001" });
    expect((await save(1)).rows[0].r.revision).toBe(2);
    await login(other);
    expect((await db.query("select * from module_backups")).rows).toEqual([]);
  });
  it("removes only the withdrawing owner's text backups and blocks stale RPC and REST reuploads", async () => {
    const ownDevice = uid(),
      otherDevice = uid(),
      plainDevice = uid(),
      operation = uid();
    const notes = JSON.stringify({ includesUserText: true, records: [{ note: "health note" }] });
    const plain = JSON.stringify({ includesUserText: false, records: [{ score: 80 }] });
    const save = (device: string, payload: string, op = uid()) =>
      db.query("select save_module_backup('iq',$1,0,$2,$3::jsonb)", [device, op, payload]);
    await login(other);
    await db.query("select record_consent('health_data',true)");
    await save(otherDevice, notes);
    await login();
    await db.query("select record_consent('health_data',true)");
    await save(ownDevice, notes, operation);
    await save(plainDevice, plain);
    await db.query("select record_consent('health_data',false)");
    expect(
      (
        await db.query<{ device_id: string }>(
          "select device_id from module_backups where module='iq'",
        )
      ).rows,
    ).toEqual([{ device_id: plainDevice }]);
    // Reusing the acknowledged operation must not resurrect the deleted text.
    await expect(save(ownDevice, notes, operation)).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "insert into module_backups(user_id,module,device_id,operation_id,payload) values($1,'iq',$2,$3,$4::jsonb)",
        [owner, ownDevice, uid(), notes],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("update module_backups set payload=$1::jsonb where device_id=$2", [
        notes,
        plainDevice,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await db.query<{ payload: { includesUserText: boolean } }>(
          "select payload from module_backups where device_id=$1",
          [plainDevice],
        )
      ).rows[0].payload.includesUserText,
    ).toBe(false);
    await login(other);
    expect(
      (
        await db.query<{ device_id: string }>(
          "select device_id from module_backups where module='iq'",
        )
      ).rows,
    ).toEqual([{ device_id: otherDevice }]);
    // A future server-side write cannot bypass consent merely by bypassing RLS.
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await expect(
      db.query(
        "insert into module_backups(user_id,module,device_id,operation_id,payload) values($1,'iq',$2,$3,$4::jsonb)",
        [owner, ownDevice, uid(), notes],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("requires the expanded 2.3 health scope for text backups while allowing metadata-only copies", async () => {
    // Imported historical consent is test data, not a rewrite performed by the migration.
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await db.query(
      "insert into consent_logs(user_id,consent_type,accepted,version,text_snapshot,accepted_at) values($1,'health_data',true,'2.2','Historical scope',now()+interval '1 second')",
      [owner],
    );
    await login();
    await expect(
      db.query("select save_module_backup('reactive',$1,0,$2,'{\"includesUserText\":true}')", [
        uid(),
        uid(),
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select save_module_backup('reactive',$1,0,$2,'{\"includesUserText\":false}')", [
        uid(),
        uid(),
      ]),
    ).resolves.toBeDefined();
    // Remove only this deliberately future-dated fixture, restoring chronological tests below.
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await db.query(
      "delete from consent_logs where user_id=$1 and text_snapshot='Historical scope'",
      [owner],
    );
  });
  it("returns the post-consent CAS token and never exposes revoked notes on idempotent replay", async () => {
    await db.query("select record_consent_state('health_data',true)");
    const sid = await seedSession(),
      op = uid();
    await log(sid, 0, { ...completed(), notes: "private note" }, op);
    const previous = (
      await db.query<{ v: string }>(
        "select updated_at::text v from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0].v;
    const state = (
      await db.query<{ r: { health_personalization_enabled: boolean; updated_at: string } }>(
        "select record_consent_state('health_data',false,$1::timestamptz) r",
        [previous],
      )
    ).rows[0].r;
    expect(state.health_personalization_enabled).toBe(false);
    expect((await log(sid, 0, { ...completed(), notes: "private note" }, op)).notes).toBeNull();
    await expect(
      db.query("select record_consent_state('health_data',true,$1::timestamptz)", [previous]),
    ).rejects.toMatchObject({ code: "40001" });
    await db.query("select save_profile_and_plan($1::jsonb,'{}',null,$2::timestamptz)", [
      JSON.stringify({ full_name: "After consent" }),
      state.updated_at,
    ]);
  });
  it("records current canonical legal decisions without rewriting historical evidence", async () => {
    await db.query("select record_consent('terms',true)");
    await db.query("select record_consent('privacy',true)");
    const rows = (
      await db.query<{ consent_type: string; version: string; text_snapshot: string }>(
        "select distinct on(consent_type) consent_type,version,text_snapshot from consent_logs where user_id=$1 and consent_type in('terms','privacy') order by consent_type,accepted_at desc,id desc",
        [owner],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.version).toBe(LEGAL_VERSION);
      expect(row.text_snapshot).toBe(CONSENTS.find((c) => c.type === row.consent_type)?.text);
    }
    await db.query("select record_consent('health_data',true)");
    expect(
      (
        await db.query<{ text_snapshot: string }>(
          "select text_snapshot from consent_logs where user_id=$1 and consent_type='health_data' order by accepted_at desc,id desc limit 1",
          [owner],
        )
      ).rows[0].text_snapshot,
    ).toBe(CONSENTS.find((c) => c.type === "health_data")?.text);
    await db.query(
      "update athlete_profiles set health_personalization_enabled=true,fuel_allergy_status='has_allergies',food_allergies='[\"milk\"]' where user_id=$1",
      [owner],
    );
    expect(
      (
        await db.query<{ food_allergies: string[] }>(
          "select food_allergies from athlete_profiles where user_id=$1",
          [owner],
        )
      ).rows[0].food_allergies,
    ).toEqual(["milk"]);
    await db.query("select record_consent('health_data',false)");
  });
  it("uses JSONB dates and cycle-scoped confirmation in the actual plan RPC", async () => {
    const next = uid();
    const sessions = (
      await db.query("select * from training_sessions where training_day_id=$1", [day])
    ).rows;
    const transition = {
      id: uid(),
      cycleId: cycle,
      weekNumber: 1,
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      nextMatchDate: "2026-10-25",
      nextMatchDates: ["2026-10-25"],
      noMatchNextWeek: false,
      confirmedAt: "2026-10-17T12:00Z",
    };
    await db.query(
      "select persist_training_plan_v2($1,'speed','2026-10',$2::jsonb,$3::jsonb,$6::jsonb,'[]',$4,$5::jsonb)",
      [
        next,
        JSON.stringify([{ date: "2026-10-17", cycleId: cycle }]),
        JSON.stringify([{ id: day, date: "2026-10-17", day_type: "own" }]),
        plan,
        JSON.stringify(transition),
        JSON.stringify(sessions),
      ],
    );
    const t = (
      await db.query(
        "select cycle_id,week_start::text,next_match_dates from weekly_transitions where cycle_id=$1",
        [cycle],
      )
    ).rows[0];
    expect(t).toEqual({
      cycle_id: cycle,
      week_start: "2026-10-19",
      next_match_dates: ["2026-10-25"],
    });
    await db.query(
      "insert into weekly_transitions(user_id,cycle_id,week_number,week_start,week_end,next_match_dates) values($1,$2,1,'2026-11-16','2026-11-22','[]')",
      [owner, uid()],
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from weekly_transitions where user_id=$1 and week_number=1",
          [owner],
        )
      ).rows[0].n,
    ).toBe(2);
  });
});
