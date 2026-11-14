import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Profile, SessionCompletion, SessionDay } from "../types";
import { buildProfile } from "../store/model";
import { sessionPrescription } from "../planIdentity";
import { prepareMonthlyPlan } from "../persist";
import { generateTrainingPlan } from "./planner";
import { lockedExecutionDays } from "./locks";
import { activateTrainingPlan } from "./activation";
import { sessionStartIssue, getPlanStatus } from "./planStatus";

const lockedDayProfile: Profile = {
  ...buildProfile({ full_name: "Partial execution" }, { age: 27, position: "midfielder" }, null)!,
  age: 27,
  level: "intermediate",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: "no_fixed_day",
  matchDate: null,
  matchDates: [],
  seasonPhase: "preseason",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  equipment: ["Hantle", "Guma oporowa"],
  doubleSessionsAllowed: "yes_if_safe",
};

function savedTwoSlotDay(): SessionDay {
  const generated = generateTrainingPlan(lockedDayProfile, {
    startDate: "2026-11-02",
    weeks: 1,
  }).plan;
  const own = generated
    .flatMap((day) => [day, day.secondSession])
    .filter((session): session is SessionDay => Boolean(session?.engineV2));
  const primary = structuredClone(own.find((day) => day.engineV2!.roles.includes("strengthA"))!);
  const secondary = structuredClone(own.find((day) => day.engineV2!.roles.includes("endurance"))!);
  secondary.date = primary.date;
  const prepared = prepareMonthlyPlan("10000000-0000-4000-8000-000000000001", lockedDayProfile, [
    { ...primary, secondSession: secondary },
  ]);
  const day = prepared.plan[0];
  day.generatorVersion = "ballwise-v2.2";
  day.secondSession!.generatorVersion = "ballwise-v2.2";
  return day;
}
const started: SessionCompletion = { completed: false, status: "started", rpe: null, notes: "" };

describe("partial execution during a plan rebuild", () => {
  it("preserves a started first slot while dropping its unstarted secondary without mutating the old day", () => {
    const day = savedTwoSlotDay(),
      before = structuredClone(day);
    const [locked] = lockedExecutionDays([day], { [day.dbId!]: started });
    expect(locked.secondSession).toBeNull();
    expect(locked.dbId).toBe(day.dbId);
    expect(locked.dayDbId).toBe(day.dayDbId);
    expect(sessionPrescription(locked)).toBe(sessionPrescription(day));
    expect(day).toEqual(before);
  });

  it("keeps an executed second slot in place and retires only the pending own primary", () => {
    const day = savedTwoSlotDay(),
      before = structuredClone(day);
    const [locked] = lockedExecutionDays([day], { [day.secondSession!.dbId!]: started });
    expect(locked).toMatchObject({
      dayType: "rest",
      durationMin: 0,
      dayDbId: day.dayDbId,
      executionProtected: false,
    });
    expect(locked.dbId).toBeUndefined();
    expect(locked.engineV2).toBeUndefined();
    expect(locked.secondSession!.dbId).toBe(day.secondSession!.dbId);
    expect(sessionPrescription(locked.secondSession!)).toBe(
      sessionPrescription(day.secondSession!),
    );
    expect(day).toEqual(before);
    const prepared = prepareMonthlyPlan("owner", lockedDayProfile, [locked]);
    expect(prepared.plan[0].dbId).not.toBe(day.dbId);
    expect(prepared.plan[0].secondSession!.dbId).toBe(day.secondSession!.dbId);
    expect(prepared.plan[0].dayDbId).toBe(day.dayDbId);
  });

  it("preserves both executed slots and keeps an external primary commitment around an executed second slot", () => {
    const day = savedTwoSlotDay();
    const [both] = lockedExecutionDays([day], {
      [day.dbId!]: started,
      [day.secondSession!.dbId!]: started,
    });
    expect(sessionPrescription(both)).toBe(sessionPrescription(day));
    expect(sessionPrescription(both.secondSession!)).toBe(sessionPrescription(day.secondSession!));
    const external = {
      ...day,
      dayType: "club" as const,
      type: "club_training" as const,
      externalCommitment: true,
      engineV2: undefined,
    };
    const [locked] = lockedExecutionDays([external], { [day.secondSession!.dbId!]: started });
    expect(locked).toMatchObject({ dayType: "club", dbId: day.dbId, executionProtected: false });
    expect(sessionPrescription(locked)).toBe(sessionPrescription(external));
  });

  it.each([1, 2] as const)(
    "can activate a new plan after slot %s starts without trapping pending V2.2 work",
    async (slot) => {
      const day = savedTwoSlotDay();
      const id = slot === 1 ? day.dbId! : day.secondSession!.dbId!;
      const completions = { [id]: started };
      const profile = { ...lockedDayProfile, goal: "speed" as const };
      const result = generateTrainingPlan(profile, {
        startDate: day.date,
        weeks: 1,
        expectedPlanId: day.planDbId!,
        lockedDays: lockedExecutionDays([day], completions),
      });
      expect(
        getPlanStatus({ plan: result.plan, profile, todayIso: day.date, completions }).kind,
      ).toBe("active");
      const frozen = result.plan[0];
      expect(slot === 1 ? frozen.secondSession : frozen.engineV2).toBeFalsy();
      const next = result.plan
        .flatMap((d) => [d, d.secondSession])
        .find((s) => s?.engineV2 && s.date > day.date)!;
      expect(sessionStartIssue({ session: next, profile, todayIso: next.date })).toBeNull();
      const persist = vi.fn(async (_owner: string, _profile: Profile, plan: SessionDay[]) => plan);
      await activateTrainingPlan(result, {
        current: () => ({
          ownerId: "owner",
          profile,
          observedPlanId: day.planDbId!,
          plan: [day],
          completions,
          readiness: {},
        }),
        load: async () => ({ id: day.planDbId!, plan: [day] }),
        persist,
      });
      expect(persist).toHaveBeenCalledOnce();
    },
  );

  it("does not infer execution from a pending slot or discard an ambiguous legacy protection", () => {
    const day = savedTwoSlotDay();
    expect(lockedExecutionDays([day], {})).toEqual([]);
    const legacy = { ...day, executionProtected: true };
    expect(lockedExecutionDays([legacy], {})[0]).toEqual(legacy);
  });
});

describe("partial-day payload compatibility with the existing Postgres RPC", () => {
  it.each([1, 2] as const)(
    "retains executed slot %s and accepts retirement of the other pending identity",
    async (slot) => {
      const db = new PGlite();
      const owner = "10000000-0000-4000-8000-000000000001";
      try {
        await db.exec(`
        create role authenticated;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$select '${owner}'::uuid$$;
        create table training_plans(id uuid primary key,user_id uuid,goal text,month text,
          plan_json jsonb,status text,active boolean,created_at timestamptz default now(),cycle_id uuid);
        create table training_days(id uuid primary key,user_id uuid,plan_id uuid references training_plans,
          date date,day_type text,decision_reason text);
        create table training_sessions(id uuid primary key,user_id uuid,training_day_id uuid references training_days,
          session_type text,title text,goal text,duration_min integer,intensity text,
          warmup_json jsonb,main_work_json jsonb,cooldown_json jsonb,safety_notes text);
        create table session_exercises(id uuid primary key,user_id uuid,session_id uuid references training_sessions,
          order_index integer,name text,section text,reps text,duration text,distance text,rest text,coaching_cues text);
        create table session_logs(user_id uuid,session_id uuid,completed boolean,completion_status text);
        create table session_modifications(user_id uuid,date date,new_session_id text,new_session_json jsonb);
        create table weekly_transitions(id uuid primary key,user_id uuid,week_number integer,next_match_date date,
          next_match_dates jsonb,no_match_next_week boolean,confirmed_at timestamptz,cycle_id uuid,
          week_start date,week_end date,unique(user_id,cycle_id,week_number));
      `);
        await db.exec(
          readFileSync("supabase/migrations/20261108080100_executed_modified_slots.sql", "utf8"),
        );
        const commit = (prepared: ReturnType<typeof prepareMonthlyPlan>) => {
          const a = prepared.args;
          return db.query(
            "select persist_training_plan_v2($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb)",
            [
              a.p_plan_id,
              a.p_goal,
              a.p_month,
              JSON.stringify(a.p_plan_json),
              JSON.stringify(a.p_days),
              JSON.stringify(a.p_sessions),
              JSON.stringify(a.p_exercises),
              a.p_expected_plan_id ?? null,
              null,
            ],
          );
        };
        const source = savedTwoSlotDay();
        source.planDbId = undefined;
        const old = prepareMonthlyPlan(owner, lockedDayProfile, [source]);
        await commit(old);
        const day = old.plan[0];
        const startedId = slot === 1 ? day.dbId! : day.secondSession!.dbId!;
        const pendingId = slot === 1 ? day.secondSession!.dbId! : day.dbId!;
        await db.query(
          "insert into session_logs(user_id,session_id,completed,completion_status) values($1,$2,false,'started')",
          [owner, startedId],
        );
        const before = (await db.query("select * from training_sessions where id=$1", [startedId]))
          .rows;
        const profile = { ...lockedDayProfile, goal: "speed" as const };
        const completions = { [startedId]: started };
        const result = generateTrainingPlan(profile, {
          startDate: day.date,
          weeks: 1,
          expectedPlanId: day.planDbId!,
          lockedDays: lockedExecutionDays([day], completions),
        });
        const next = prepareMonthlyPlan(owner, profile, result.plan);
        await commit(next);
        expect(
          (await db.query("select * from training_sessions where id=$1", [startedId])).rows,
        ).toEqual(before);
        const kept = next.plan[0];
        expect(slot === 1 ? kept.dbId : kept.secondSession!.dbId).toBe(startedId);
        expect([kept.dbId, kept.secondSession?.dbId]).not.toContain(pendingId);
        expect((await db.query("select session_id from session_logs")).rows).toEqual([
          { session_id: startedId },
        ]);
        expect((await db.query("select id from training_plans where active")).rows).toEqual([
          { id: next.args.p_plan_id },
        ]);
      } finally {
        await db.close();
      }
    },
    30_000,
  );
});
