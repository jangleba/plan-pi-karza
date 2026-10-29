import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vite", () => ({ loadEnv: () => ({}) }));
const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const valid = {
  VITE_RELEASE_MODE: "production",
  VITE_BILLING_ENFORCED: "true",
  VITE_LEGAL_ADMIN_NAME: "BallWise Test Operator",
  VITE_LEGAL_BUSINESS_ADDRESS: "Testowa 1, Warszawa",
  VITE_LEGAL_REGISTRY_DETAILS: "NIP 0000000000",
  VITE_LEGAL_CONTACT_EMAIL: "privacy@ballwise.test",
  VITE_LEGAL_ACCOUNT_RETENTION: "Do usunięcia konta",
  VITE_LEGAL_CONSENT_RETENTION: "5 lat",
  VITE_LEGAL_BACKUP_RETENTION: "30 dni",
  VITE_LEGAL_SUPABASE_REGION: "eu-central-1",
  VITE_LEGAL_SUBSCRIPTION_PRICE: "Cena w sklepie Apple",
  VITE_LEGAL_TRIAL_DESCRIPTION: "7 dni dla zakwalifikowanych kont",
  VITE_REVENUECAT_IOS_PUBLIC_KEY: "appl_testOnly",
  VITE_REVENUECAT_PRODUCT_ID: "pl.ballwise.test.monthly",
  VITE_SUPABASE_URL: "https://ballwise-test.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testOnly",
  BALLWISE_IOS_BUNDLE_ID: "pl.ballwise.test",
  BALLWISE_IOS_ASSOCIATED_DOMAIN: "ballwise.test",
  VITE_AUTH_REDIRECT_URL: "https://ballwise.test/auth",
};
async function check(publicKey: string) {
  vi.resetModules();
  for (const [name, value] of Object.entries(valid)) vi.stubEnv(name, value);
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", publicKey);
  process.exitCode = 0;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  // Import the actual CLI to exercise the same configuration path as release:check.
  const script = "../../scripts/release-preflight.mjs";
  await import(script);
  return { status: process.exitCode, output: [...log.mock.calls, ...error.mock.calls].flat().join("\n") };
}
const jwt = (role: string) =>
  `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.testSignature`;

describe("release preflight public backend key", () => {
  it.each([valid.VITE_SUPABASE_PUBLISHABLE_KEY, jwt("anon")])(
    "accepts a supported public key type",
    async (key) => expect((await check(key)).status).toBe(0),
  );
  it.each(["sb_secret_doNotShipThisValue", jwt("service_role"), jwt("authenticated"), "not-a-key"])(
    "rejects a server key, user token or malformed key without logging it",
    async (key) => {
      const result = await check(key);
      expect(result.status).toBe(1);
      expect(result.output).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
      expect(result.output).not.toContain(key);
    },
  );
});
