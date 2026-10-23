import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";
import { bootstrapSqlDatabase, runtimeMigration, migrationFiles } from "./schemaHarness";

it("upgrades the observed JSONB live shape without requiring prior v2 or losing summaries", async () => {
  const db = new PGlite();
  try {
    await bootstrapSqlDatabase(db, runtimeMigration);
    // Mirror the observed types and absent v2 objects. This is not a live dump:
    // Auth/Storage remain stubs and no private records leave a running project.
    await db.exec(`do $$ declare item record; c record; begin
   for item in select * from(values('athlete_profiles','unavailable_days'),('athlete_profiles','unavailable_equipment_ids'),('athlete_profiles','food_allergies'),('athlete_profiles','food_intolerances'),('athlete_profiles','food_exclusions'),('athlete_profiles','match_dates'),('readiness_logs','red_flags'),('weekly_transitions','next_match_dates'))v(t,a) loop
    for c in select conname from pg_constraint where conrelid=format('public.%I',item.t)::regclass and contype='c' and pg_get_constraintdef(oid)~('\\m'||item.a||'\\M') loop execute format('alter table public.%I drop constraint %I',item.t,c.conname);end loop;
    execute format('alter table public.%I alter column %I drop default',item.t,item.a);
    execute format('alter table public.%I alter column %I type jsonb using to_jsonb(%I)',item.t,item.a,item.a);
    execute format('alter table public.%I alter column %I set default ''[]''::jsonb',item.t,item.a);
   end loop; end $$;
   drop function public.persist_training_plan_v2(uuid,text,text,jsonb,jsonb,jsonb,jsonb,uuid,jsonb);
   drop function public.delete_running_activity_atomic(uuid);
   drop trigger aa_guard_session_log_order on public.session_logs;
   drop trigger aa_guard_set_log_order on public.exercise_set_logs;
   drop function public.guard_training_write_order();
   alter table public.athlete_profiles drop column field_mas_source_session_id;
   drop table public.lab_test_results cascade;
   drop table public.user_roles cascade;`);
    const owner = crypto.randomUUID();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'upgrade@example.test',now())",
      [owner],
    );
    await db.query(
      "insert into athlete_profiles(user_id,age,unavailable_days,food_exclusions) values($1,20,'[2,5]','[\"fish\"]')",
      [owner],
    );
    const installKit = process.env.BALLWISE_SQL_INSTALL_KIT;
    if (installKit) await db.exec(readFileSync(installKit, "utf8"));
    else
      for (const f of migrationFiles().filter((f) => f >= runtimeMigration))
        await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    expect(
      (
        await db.query(
          "select unavailable_days,food_exclusions from athlete_profiles where user_id=$1",
          [owner],
        )
      ).rows[0],
    ).toEqual({ unavailable_days: [2, 5], food_exclusions: ["fish"] });
    await db.query("update athlete_profiles set main_goal='speed' where user_id=$1", [owner]);
    await db.query("select record_consent('health_data',false)");

    const plan = crypto.randomUUID(),
      day = crypto.randomUUID(),
      session = crypto.randomUUID(),
      cycle = crypto.randomUUID();
    const transition = {
      id: crypto.randomUUID(),
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
      "select persist_training_plan_v2($1,'speed','2026-10',$2::jsonb,$3::jsonb,$4::jsonb,'[]',null,$5::jsonb)",
      [
        plan,
        JSON.stringify([{ date: "2026-10-17", cycleId: cycle, dbId: session }]),
        JSON.stringify([{ id: day, date: "2026-10-17", day_type: "own" }]),
        JSON.stringify([
          {
            id: session,
            training_day_id: day,
            title: "Trening",
            warmup_json: [],
            main_work_json: [],
            cooldown_json: [],
          },
        ]),
        JSON.stringify(transition),
      ],
    );
    await db.query("select save_training_log($1,$2,0,$3::jsonb)", [
      crypto.randomUUID(),
      session,
      JSON.stringify({
        completed: true,
        completion_status: "completed",
        rpe: 7,
        updated_at: "2026-10-17T11:00Z",
        started_at: "2026-10-17T10:00Z",
        ended_at: "2026-10-17T11:00Z",
      }),
    ]);
    const activity = crypto.randomUUID();
    await db.query("select save_running_result($1,$2::jsonb,0)", [
      crypto.randomUUID(),
      JSON.stringify({
        id: activity,
        session_id: session,
        date: "2026-10-17",
        duration_sec: 60,
        distance_m: 200,
        interval_results: [],
      }),
    ]);
    await db.query("select delete_running_activity_atomic($1)", [activity]);
    expect(
      (
        await db.query(
          "select to_regclass('public.lab_test_results')::text as lab,to_regclass('public.user_roles')::text as roles",
        )
      ).rows[0],
    ).toEqual({ lab: null, roles: null });

    expect(
      (
        await db.query(
          "select to_regprocedure('public.persist_training_plan_v2(uuid,text,text,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)')::text as rpc",
        )
      ).rows[0],
    ).toMatchObject({ rpc: expect.any(String) });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from pg_trigger where tgrelid='session_logs'::regclass and tgname='aa_guard_session_log_order'",
        )
      ).rows[0].n,
    ).toBe(1);
    if (installKit) {
      await expect(db.exec(readFileSync(installKit, "utf8"))).rejects.toThrow(/already present/);
      await db.exec("rollback");
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from session_logs where user_id=$1",
            [owner],
          )
        ).rows[0].n,
      ).toBe(1);
    }
  } finally {
    await db.close();
  }
}, 30000);
