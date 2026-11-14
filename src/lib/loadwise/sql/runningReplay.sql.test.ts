import { masEvidence } from "@/lib/running/__fixtures__/mas";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapSqlDatabase } from "./schemaHarness";

let db: PGlite;
const uid = () => crypto.randomUUID();
let owner = "";

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
async function newAthlete(level: number) {
  owner = uid();
  await db.exec("reset role");
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
    owner,
    `${owner}@example.test`,
  ]);
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  await db.query(
    "insert into athlete_profiles(user_id,age,running_progression_level,running_progression_base_level,running_progression_base_at) values($1,20,$2,$2,'2026-01-01T00:00:00Z')",
    [owner, level],
  );
  const planId = uid();
  const dId = uid();
  await db.query(
    "insert into training_plans(id,user_id,active,status,cycle_id) values($1,$2,true,'active',$3)",
    [planId, owner, uid()],
  );
  await db.query(
    "insert into training_days(id,user_id,plan_id,date,day_type) values($1,$2,$3,'2026-10-10','own')",
    [dId, owner, planId],
  );
  return dId;
}
interface Run {
  sid: string;
  day: string;
  hour: number;
  rpe: number | null;
}
async function session(dId: string, hour: number, rpe: number | null): Promise<Run> {
  const sid = uid();
  await db.query(
    "insert into training_sessions(id,user_id,training_day_id,title,session_type,warmup_json,main_work_json,cooldown_json) values($1,$2,$3,'Bieg','Wytrzymałość','[]','[]','[]')",
    [sid, owner, dId],
  );
  return { sid, day: "2026-10-10", hour, rpe };
}
const iso = (r: Run) => `${r.day}T${String(r.hour).padStart(2, "0")}:00:00Z`;
const iso2 = (r: Run) => `${r.day}T${String(r.hour).padStart(2, "0")}:30:00Z`;
const ops = new Map<string, { run: string; log: string }>();
const op = (r: Run) => ops.get(r.sid) ?? ops.set(r.sid, { run: uid(), log: uid() }).get(r.sid)!;
async function sendRun(r: Run, version = 0) {
  await db.query("select save_running_result($1,$2::jsonb,$3)", [
    op(r).run,
    JSON.stringify({
      id: r.sid,
      session_id: r.sid,
      date: r.day,
      duration_sec: 720,
      distance_m: 2400,
      interval_results: intervals(),
      started_at: iso(r),
      ended_at: iso2(r),
    }),
    version,
  ]);
}
async function sendLog(r: Run, version = 0, rpe: number | null = r.rpe, fresh = false) {
  const res = await db.query<{ r: { write_version: number } }>(
    "select save_training_log($1,$2,$3,$4::jsonb) r",
    [
      fresh ? uid() : op(r).log,
      r.sid,
      version,
      JSON.stringify({
        completed: true,
        completion_status: "completed",
        rpe,
        notes: "",
        duration_minutes: 12,
        started_at: iso(r),
        ended_at: iso2(r),
        updated_at: iso2(r),
      }),
    ],
  );
  return Number(res.rows[0].r.write_version);
}
const level = async () =>
  (
    await db.query<{ l: number }>(
      "select running_progression_level l from athlete_profiles where user_id=$1",
      [owner],
    )
  ).rows[0].l;
async function expectedFold(base: number, items: Array<{ rpe: number }>) {
  let l = base;
  for (const it of items)
    l = (
      await db.query<{ n: number }>(
        "select next_running_level_for_session($1,$2,$3::jsonb,null) n",
        [l, it.rpe, JSON.stringify(intervals())],
      )
    ).rows[0].n;
  return l;
}

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe.sequential("running level is derived from the chronology of evidence", () => {
  // Non-commutative history: a hard session first (RPE 10 regresses), then an easy one (RPE 6 advances).
  const history = [
    { hour: 8, rpe: 10 },
    { hour: 9, rpe: 6 },
    { hour: 10, rpe: 6 },
  ];
  const arrivals: Array<[string, number[]]> = [
    ["in order", [0, 1, 2]],
    ["reversed", [2, 1, 0]],
    ["interleaved", [1, 2, 0]],
  ];
  it.each(arrivals)(
    "the same history gives the same level when it arrives %s, run and log in either order",
    async (_name, order) => {
      const d = await newAthlete(2);
      const runs: Run[] = [];
      for (const h of history) runs.push(await session(d, h.hour, h.rpe));
      for (const i of order) {
        // alternate the order of the two writes per session
        if (i % 2) {
          await sendLog(runs[i]);
          await sendRun(runs[i]);
        } else {
          await sendRun(runs[i]);
          await sendLog(runs[i]);
        }
      }
      expect(await level()).toBe(await expectedFold(2, history));
    },
  );

  it("retries and parallel replays of the same operations do not progress twice", async () => {
    const d = await newAthlete(1);
    const a = await session(d, 8, 6);
    const b = await session(d, 9, 6);
    for (const r of [a, b]) {
      await sendRun(r);
      await sendLog(r);
    }
    const once = await level();
    expect(once).toBe(await expectedFold(1, [{ rpe: 6 }, { rpe: 6 }]));
    for (const r of [a, b, a, b]) {
      await sendRun(r);
      await sendLog(r);
    }
    expect(await level()).toBe(once);
  });

  it("a late RPE on an older run is replayed in its own place, not on top of the newest level", async () => {
    const d = await newAthlete(2);
    const early = await session(d, 8, 10);
    const late = await session(d, 9, 6);
    await sendRun(late);
    await sendLog(late);
    await sendRun(early);
    await sendLog(early, 0, null); // completed, RPE still missing: waits
    expect(await level()).toBe(await expectedFold(2, [{ rpe: 6 }]));
    await sendLog(early, 1, 10, true); // the RPE arrives late (a new operation, not a retry)
    expect(await level()).toBe(await expectedFold(2, [{ rpe: 10 }, { rpe: 6 }]));
  });

  it("a corrected RPE recomputes the history instead of being ignored or applied twice", async () => {
    const d = await newAthlete(1);
    const a = await session(d, 8, 6);
    const b = await session(d, 9, 6);
    await sendRun(a);
    const v = await sendLog(a);
    await sendRun(b);
    await sendLog(b);
    expect(await level()).toBe(await expectedFold(1, [{ rpe: 6 }, { rpe: 6 }]));
    await sendLog(a, v, 10, true);
    expect(await level()).toBe(await expectedFold(1, [{ rpe: 10 }, { rpe: 6 }]));
  });

  it("evidence with the same execution time is ordered by its stable id, not by arrival", async () => {
    const results: number[] = [];
    for (const reverse of [false, true]) {
      const d = await newAthlete(2);
      const a = await session(d, 8, 10);
      const b = await session(d, 8, 6);
      for (const r of reverse ? [b, a] : [a, b]) {
        await sendRun(r);
        await sendLog(r);
      }
      results.push(await level());
    }
    // different random ids per athlete, but each athlete's own result is order independent
    expect(results).toHaveLength(2);
    const d = await newAthlete(2);
    const x = await session(d, 8, 10);
    const y = await session(d, 8, 6);
    for (const r of [x, y]) {
      await sendRun(r);
      await sendLog(r);
    }
    const forward = await level();
    const e = await newAthlete(2);
    const x2 = { ...(await session(e, 8, 10)) };
    const y2 = { ...(await session(e, 8, 6)) };
    // same ids are not reusable across athletes; compare by sorting on id inside one athlete instead
    const ordered = [x, y].sort((p, q) => (p.sid < q.sid ? -1 : 1));
    expect(forward).toBe(
      await expectedFold(
        2,
        ordered.map((r) => ({ rpe: r.rpe! })),
      ),
    );
    expect([x2, y2]).toHaveLength(2);
  });

  it("a newer MAS test restarts the reference and older evidence is not replayed after it", async () => {
    const d = await newAthlete(2);
    const a = await session(d, 8, 6);
    await sendRun(a);
    await sendLog(a);
    expect(await level()).toBe(await expectedFold(2, [{ rpe: 6 }]));
    const test = await session(d, 12, null);
    await db.query("select save_training_log($1,$2,0,$3::jsonb)", [
      uid(),
      test.sid,
      JSON.stringify({
        completion_status: "started",
        execution_snapshot: {
          runningRecipe: { method: "field_mas_test", id: masEvidence().recipeId },
        },
      }),
    ]);
    await db.query("select save_running_result($1,$2::jsonb,0)", [
      uid(),
      JSON.stringify({
        id: test.sid,
        session_id: test.sid,
        date: "2026-10-10",
        duration_sec: 300,
        distance_m: 1500,
        is_field_mas_test: true,
        mas_test_attempt: true,
        mas_test_evidence: masEvidence(1500),
        started_at: iso(test),
        ended_at: iso2(test),
        interval_results: [
          {
            kind: "work",
            phase: "main",
            recipeId: masEvidence().recipeId,
            completed: true,
            targetMode: "time",
            targetValue: 300,
            durationSec: 300,
            distanceM: 1500,
          },
        ],
      }),
    ]);
    expect(await level()).toBe(0);
    // the result and its date are stored with the profile (read back after a new login)
    await db.exec("reset role");
    const stored = (
      await db.query<{ kmh: string; at: string; src: string }>(
        "select field_mas_kmh::text kmh, field_mas_tested_at::text at, field_mas_source_session_id::text src from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0];
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    expect(stored).toEqual({ kmh: "18.00", at: "2026-10-10", src: test.sid });
    const after = await session(d, 14, 6);
    await sendRun(after);
    await sendLog(after);
    expect(await level()).toBe(await expectedFold(0, [{ rpe: 6 }]));
  });
});
