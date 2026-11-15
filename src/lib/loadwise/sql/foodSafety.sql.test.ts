import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapSqlDatabase } from "./schemaHarness";
import { profileWritePayloads } from "../store/repository";
import { buildProfile } from "../store/model";
import type { Profile } from "../types";

/** Allergies, intolerances and exclusions through the real write path and server triggers. */
const owner = "10000000-0000-4000-8000-0000000000f1";
let db: PGlite;

const base = {
  name: "Ola",
  age: 20,
  healthPersonalizationEnabled: false,
  position: "midfielder",
  level: "intermediate",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [2, 4],
  individualTrainingDays: [1, 3, 5],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
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
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
} as unknown as Profile;

async function save(patch: Partial<Profile>): Promise<Profile> {
  const { profileRow, athleteRow } = profileWritePayloads(owner, { ...base, ...patch }, true);
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
  const prof = (
    await db.query("select *, birth_date::text birth_date from profiles where user_id=$1", [owner])
  ).rows[0] as Record<string, unknown>;
  const ath = (
    await db.query(
      "select *, match_date::text match_date, field_mas_tested_at::text field_mas_tested_at from athlete_profiles where user_id=$1",
      [owner],
    )
  ).rows[0] as Record<string, unknown>;
  return buildProfile(prof, ath, null)!;
}
const consent = (type: string, accepted: boolean) =>
  db.query("select record_consent($1,$2)", [type, accepted]);

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSqlDatabase(db);
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'f@example.test',now())",
    [owner],
  );
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
}, 60000);
afterAll(() => db?.close());

describe.sequential("food safety lists: full save path", () => {
  it("without health consent: allergies are not stored, exclusions (a preference) are", async () => {
    const p = await save({
      fuelAllergyStatus: "has_allergies",
      foodAllergies: ["orzechy"],
      foodIntolerances: ["laktoza"],
      foodExclusions: ["grzyby"],
    });
    expect(p.fuelAllergyStatus).toBe("unconfirmed");
    expect(p.foodAllergies).toEqual([]);
    expect(p.foodIntolerances).toEqual([]);
    expect(p.foodExclusions).toEqual(["grzyby"]);
  });

  it("with health consent: three states survive a save and reload, kept as separate lists", async () => {
    await consent("health_data", true);
    const has = await save({
      healthPersonalizationEnabled: true,
      fuelAllergyStatus: "has_allergies",
      foodAllergies: ["orzechy", "sezam"],
      foodIntolerances: ["laktoza"],
      foodExclusions: ["grzyby"],
    });
    expect(has.fuelAllergyStatus).toBe("has_allergies");
    expect(has.foodAllergies).toEqual(["orzechy", "sezam"]);
    expect(has.foodIntolerances).toEqual(["laktoza"]);
    expect(has.foodExclusions).toEqual(["grzyby"]);
    // An unrelated profile edit no longer wipes the lists (former profileWritePayloads bug).
    const edited = await save({ ...has, name: "Ola K." });
    expect(edited.foodAllergies).toEqual(["orzechy", "sezam"]);
    const none = await save({
      ...has,
      fuelAllergyStatus: "confirmed_none",
      foodAllergies: [],
    });
    expect(none.fuelAllergyStatus).toBe("confirmed_none");
    const unknown = await save({ ...none, fuelAllergyStatus: "unconfirmed" });
    expect(unknown.fuelAllergyStatus).toBe("unconfirmed");
  });

  it("withdrawing health consent clears allergies and intolerances on the server", async () => {
    await save({
      healthPersonalizationEnabled: true,
      fuelAllergyStatus: "has_allergies",
      foodAllergies: ["orzechy"],
      foodIntolerances: ["laktoza"],
      foodExclusions: ["grzyby"],
    });
    await consent("health_data", false);
    const row = (
      await db.query<Record<string, unknown>>(
        "select fuel_allergy_status, food_allergies, food_intolerances, food_exclusions from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0];
    expect(row.fuel_allergy_status).toBe("unconfirmed");
    expect(row.food_allergies).toEqual([]);
    expect(row.food_intolerances).toEqual([]);
    expect(row.food_exclusions).toEqual(["grzyby"]);
    // A stale client write after withdrawal cannot bring them back.
    const stale = await save({
      healthPersonalizationEnabled: true,
      fuelAllergyStatus: "has_allergies",
      foodAllergies: ["orzechy"],
    });
    expect(stale.foodAllergies).toEqual([]);
    expect(stale.healthPersonalizationEnabled).toBe(false);
  });

  it("body mass needs the Fuel Precision consent; withdrawal removes it", async () => {
    await expect(save({ fuelPrecisionEnabled: true, weightKg: 70 })).rejects.toThrow(
      /Fuel Precision/,
    );
    await consent("fuel_precision", true);
    expect((await save({ fuelPrecisionEnabled: true, weightKg: 70 })).weightKg).toBe(70);
    await consent("fuel_precision", false);
    const row = (
      await db.query<{ w: number | null; e: boolean }>(
        "select weight_optional w, fuel_precision_enabled e from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0];
    expect(row).toEqual({ w: null, e: false });
  });
});

describe.sequential("under 16: no body mass on the server", () => {
  it("drops a body mass sent for a younger account, keeps it at 16", async () => {
    await consent("fuel_precision", true);
    await db.query(
      `update athlete_profiles set age=15, account_owner_type='guardian', guardian_name='Opiekun',
         guardian_consent=true, weight_optional=55, fuel_precision_enabled=true where user_id=$1`,
      [owner],
    );
    const young = (
      await db.query<{ w: number | null; e: boolean }>(
        "select weight_optional w, fuel_precision_enabled e from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0];
    expect(young).toEqual({ w: null, e: false });
    await db.query(
      "update athlete_profiles set age=16, weight_optional=60, fuel_precision_enabled=true where user_id=$1",
      [owner],
    );
    const sixteen = (
      await db.query<{ w: number | null }>(
        "select weight_optional w from athlete_profiles where user_id=$1",
        [owner],
      )
    ).rows[0];
    expect(Number(sixteen.w)).toBe(60);
  });
});
