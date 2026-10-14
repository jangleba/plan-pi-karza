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
