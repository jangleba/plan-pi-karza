// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSION } from "./legal";
import {
  cachedConsentRows,
  clearConsentStatusCache,
  consentNeeds,
  loadConsentRows,
  type ConsentRow,
} from "./legalStatus";
import type { Profile } from "./types";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      mocks.from(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        range: () => chain,
        abortSignal: () => chain,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          mocks.execute().then(resolve, reject),
      };
      return chain;
    },
  },
}));
const rows: ConsentRow[] = ["terms", "privacy"].map((consent_type) => ({
  id: consent_type,
  consent_type,
  accepted: true,
  version: LEGAL_VERSION,
  accepted_at: "2026-10-10",
}));
const profile = { healthPersonalizationEnabled: false, fuelPrecisionEnabled: false } as Profile;
beforeEach(() => {
  clearConsentStatusCache();
  window.sessionStorage.clear();
  mocks.execute.mockReset().mockResolvedValue({ data: rows, error: null });
  mocks.from.mockClear();
});
afterEach(() => {
  clearConsentStatusCache();
  vi.restoreAllMocks();
});
describe("startup consent read", () => {
  it("shares one in-flight read between startup and the gate", async () => {
    const [first, second] = await Promise.all([loadConsentRows("a"), loadConsentRows("a")]);
    expect(first).toEqual(second);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    await loadConsentRows("a");
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(consentNeeds(first, profile).required).toBe(false);
  });
  it("isolates accounts and expires the verified snapshot after five minutes", async () => {
    const now = Date.now();
    const time = vi.spyOn(Date, "now").mockReturnValue(now);
    await loadConsentRows("a");
    expect(cachedConsentRows("b")).toBeNull();
    time.mockReturnValue(now + 5 * 60_000);
    expect(cachedConsentRows("a")).toBeNull();
  });
  it("does not allow old versions or revoked optional consent", () => {
    expect(
      consentNeeds(
        rows.map((row) => ({ ...row, version: "old" })),
        profile,
      ).required,
    ).toBe(true);
    expect(
      consentNeeds(rows, { ...profile, healthPersonalizationEnabled: true }).healthRenewal,
    ).toBe(true);
    expect(consentNeeds(rows, { ...profile, fuelPrecisionEnabled: true }).fuelRenewal).toBe(false);
  });
  it("does not cache an error and allows a retry", async () => {
    mocks.execute.mockResolvedValueOnce({ data: null, error: { message: "Offline" } });
    await expect(loadConsentRows("a")).rejects.toThrow();
    expect(cachedConsentRows("a")).toBeNull();
    await expect(loadConsentRows("a")).resolves.toEqual(rows);
  });
  it("a late request cannot restore the snapshot cleared by sign-out", async () => {
    let resolve!: (value: unknown) => void;
    mocks.execute.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = loadConsentRows("a");
    await Promise.resolve();
    clearConsentStatusCache();
    resolve({ data: rows, error: null });
    await pending;
    expect(cachedConsentRows("a")).toBeNull();
  });
});

describe("offline consent policy", () => {
  it("allows previously verified current terms after restart/TTL while keeping revocations effective", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await loadConsentRows("offline");
    clock.mockReturnValue(now + 24 * 60 * 60_000);
    window.sessionStorage.clear();
    mocks.execute.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    await expect(loadConsentRows("offline", true)).resolves.toEqual(rows);
    expect(cachedConsentRows("someone-else", true)).toBeNull();
    clock.mockReturnValue(now + 8 * 24 * 60 * 60_000);
    await expect(loadConsentRows("offline", true)).rejects.toThrow();
  });
  it("a forbidden request cannot fall back to an accepted stale cache", async () => {
    await loadConsentRows("blocked");
    mocks.execute.mockResolvedValue({ data: null, error: { status: 403, message: "Forbidden" } });
    await expect(loadConsentRows("blocked", true)).rejects.toThrow();
  });
});
