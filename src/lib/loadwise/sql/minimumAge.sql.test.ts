import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** New accounts start at 16; existing younger accounts are kept and can still be edited. */
let db: PGlite;
const uid = () => crypto.randomUUID();
const yearsAgo = (years: number, extraDays = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d.toISOString().slice(0, 10);
};
async function as(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function user() {
  const id = uid();
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
    id,
    `${id}@example.test`,
  ]);
  return id;
}
const merge = (patch: Record<string, unknown>) =>
  db.query("select merge_own_profile_row('profiles',$1::jsonb) r", [JSON.stringify(patch)]);

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
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe.sequential("minimum age for new accounts", () => {
  it("rejects completing onboarding below 16", async () => {
    const id = await user();
    await as(id);
    await expect(
      merge({ full_name: "Junior", birth_date: yearsAgo(15, 30), onboarding_completed: true }),
    ).rejects.toThrow(/od 16 lat/);
    // Nothing completed was stored.
    const rows = (
      await db.query<{ onboarding_completed: boolean }>(
        "select onboarding_completed from profiles where user_id=$1",
        [id],
      )
    ).rows;
    expect(rows.every((r) => !r.onboarding_completed)).toBe(true);
  });

  it("accepts a 16-year-old and an adult", async () => {
    for (const years of [16, 25]) {
      const id = await user();
      await as(id);
      const r = await merge({
        full_name: "Senior",
        birth_date: yearsAgo(years, 1),
        onboarding_completed: true,
      });
      expect((r.rows[0] as { r: { onboarding_completed: boolean } }).r.onboarding_completed).toBe(
        true,
      );
    }
  });

  it("keeps an existing younger account editable", async () => {
    const id = await user();
    // An account completed before the rule (inserted by the service, as a migration would keep it).
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
    await db.query(
      "update profiles set full_name='Existing',birth_date=$2,onboarding_completed=true where user_id=$1",
      [id, yearsAgo(14, 30)],
    );
    await as(id);
    const r = await merge({ full_name: "Existing renamed" });
    expect((r.rows[0] as { r: { full_name: string } }).r.full_name).toBe("Existing renamed");
  });
});
