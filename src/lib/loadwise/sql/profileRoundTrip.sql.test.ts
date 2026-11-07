import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapSqlDatabase } from "./schemaHarness";
import { profileWritePayloads } from "../store/repository";
import { buildProfile } from "../store/model";
import { trainingProfileRevision } from "../planIdentity";
import { effectiveSeasonPhase } from "../seasonValidation";
import type { Profile } from "../types";

const owner = "10000000-0000-4000-8000-000000000001";
let db: PGlite;

/** Exactly the shape onboarding.tsx submits for a new adult athlete. */
function onboardingProfile(patch: Partial<Profile> = {}): Profile {
  return {
    name: "Jan",
    age: 20,
    healthPersonalizationEnabled: false,
    position: "midfielder",
    level: "intermediate",
    goal: "speed",
    secondaryLimiter: "cod",
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 5],
    unavailableDays: [],
    usualMatchDay: null,
    matchDate: "2026-11-14",
    matchDates: ["2026-11-14"],
    equipment: [],
    painInjury: false,
    painLocations: [],
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-11-07T10:00:00Z",
    seasonPhase: "inseason",
    seasonStage: "season_mid",
    competitionLevel: "iv_liga",
    weeklyMatches: true,
    seasonPhaseOverride: false,
    seasonValidationStatus: "ok",
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    currentPitchFeelings: [],
    desiredPitchFeelings: [],
    unavailableEquipmentIds: [],
    ...patch,
  } as Profile;
}

async function saveAndReload(profile: Profile): Promise<Profile> {
  const { profileRow, athleteRow } = profileWritePayloads(owner, profile, true);
  const version = (
    await db.query<{ v: string | null }>(
      "select updated_at::text v from athlete_profiles where user_id=$1",
      [owner],
    )
  ).rows[0]?.v;
  await db.query("select save_profile_and_plan($1::jsonb,$2::jsonb,null,$3::timestamptz)", [
    JSON.stringify(profileRow),
    JSON.stringify(athleteRow),
    version ?? null,
  ]);
  // PostgREST returns DATE columns as plain strings; mirror that here.
  const prof = (
    await db.query("select *, birth_date::text birth_date from profiles where user_id=$1", [owner])
  ).rows[0] as Record<string, unknown>;
  const ath = (
    await db.query(
      "select *, match_date::text match_date, field_mas_tested_at::text field_mas_tested_at from athlete_profiles where user_id=$1",
      [owner],
    )
  ).rows[0] as Record<string, unknown>;
  const loaded = buildProfile(prof, ath, null)!;
  return {
    ...loaded,
    unavailableEquipmentIds: (ath.unavailable_equipment_ids as string[] | null) ?? [],
  };
}

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.test',now())",
    [owner],
  );
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
}, 60000);
afterAll(() => db?.close());

describe.sequential("onboarding answers survive a save and reload", () => {
  it("keeps the plan revision stable, so a reload does not rebuild a fresh plan", async () => {
    const saved = onboardingProfile();
    const loaded = await saveAndReload(saved);
    expect(trainingProfileRevision(loaded)).toBe(trainingProfileRevision(saved));
  });

  it("keeps a deliberate custom season and the season the engine uses", async () => {
    const saved = onboardingProfile({
      seasonPhase: "offseason",
      seasonStage: null,
      weeklyMatches: true,
      seasonPhaseOverride: true,
      seasonValidationStatus: "override",
    });
    const loaded = await saveAndReload(saved);
    expect(loaded.seasonPhaseOverride).toBe(true);
    expect(trainingProfileRevision(loaded)).toBe(trainingProfileRevision(saved));
    const today = new Date(2026, 10, 7);
    expect(effectiveSeasonPhase(loaded, today)).toBe(effectiveSeasonPhase(saved, today));
    expect(effectiveSeasonPhase(loaded, today)).toBe("offseason");
  });

  it("clears the custom season flag when the athlete turns it off", async () => {
    const loaded = await saveAndReload(onboardingProfile({ seasonPhaseOverride: false }));
    expect(loaded.seasonPhaseOverride).toBeUndefined();
  });
});
