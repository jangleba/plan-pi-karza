// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  vi.stubEnv("VITE_BILLING_ENFORCED", "true");
  vi.stubEnv("VITE_REVENUECAT_IOS_PUBLIC_KEY", "appl_test_public");
  vi.stubEnv("VITE_REVENUECAT_PRODUCT_ID", "monthly");
  return {
    owner: "10000000-0000-4000-8000-000000000001",
    invoke: vi.fn(),
    configure: vi.fn(),
    logIn: vi.fn(),
    offerings: vi.fn(),
    purchase: vi.fn(),
    restore: vi.fn(),
  };
});
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: mocks.owner } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
}));
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    isConfigured: async () => ({ isConfigured: false }),
    configure: mocks.configure,
    logIn: mocks.logIn,
    getOfferings: mocks.offerings,
    checkTrialOrIntroductoryPriceEligibility: async () => ({ monthly: { status: 2 } }),
    purchasePackage: mocks.purchase,
    restorePurchases: mocks.restore,
  },
}));
import { BillingProvider, useBilling } from "./BillingProvider";
import { hasAccess } from "./model";
let root: Root, container: HTMLDivElement, value: ReturnType<typeof useBilling>;
const now = "2026-10-18T12:00:00Z",
  expiry = "2026-11-18T12:00:00Z";
const status = (state = "no_subscription", owner = mocks.owner) => ({
  data: {
    userId: owner,
    status: state,
    verifiedAt: now,
    expiresAt: state === "active" ? expiry : null,
  },
  error: null,
});
const offering = (period = "P1W") => ({
  current: {
    availablePackages: [
      {
        identifier: "monthly",
        product: {
          identifier: "monthly",
          priceString: "49,99 zł",
          subscriptionPeriod: "P1M",
          introPrice: { price: 0, period, cycles: 1 },
        },
      },
    ],
  },
});
function Probe() {
  value = useBilling();
  return <span>{value.entitlement?.status ?? "empty"}</span>;
}
async function render() {
  await act(async () => {
    root.render(
      <BillingProvider>
        <Probe />
      </BillingProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  mocks.owner = "10000000-0000-4000-8000-000000000001";
  vi.clearAllMocks();
  mocks.invoke.mockImplementation(async () => status());
  mocks.configure.mockResolvedValue(undefined);
  mocks.offerings.mockResolvedValue(offering());
  mocks.purchase.mockResolvedValue({ customerInfo: { entitlements: { active: { pro: {} } } } });
  mocks.restore.mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  localStorage.clear();
});
afterAll(() => vi.unstubAllEnvs());
describe("purchase identity and server verification", () => {
  it("retries a missing Apple offer without requiring an account switch or reload", async () => {
    mocks.offerings.mockRejectedValueOnce(new Error("temporary store outage"));
    await render();
    await settle();
    expect(value.offer).toBeNull();
    expect(mocks.offerings).toHaveBeenCalledTimes(1);
    await act(async () => value.refresh());
    expect(mocks.offerings).toHaveBeenCalledTimes(2);
    expect(value.offer?.product.identifier).toBe("monthly");
    expect(value.eligibleTrial).toBe(true);
    expect(value.reachable).toBe(true);
    expect(value.error).toBeNull();
    // A normal access check does not repeatedly fetch an already loaded store offer.
    await act(async () => value.refresh());
    expect(mocks.offerings).toHaveBeenCalledTimes(2);
  });
  it("waits for the server after Apple succeeds and does not grant from SDK claims", async () => {
    await render();
    await settle();
    expect(value.eligibleTrial).toBe(true);
    expect(value.offer?.product.priceString).toBe("49,99 zł");
    let resolve!: (result: ReturnType<typeof status>) => void;
    mocks.invoke.mockImplementation(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = value.purchase();
      await new Promise((accept) => setTimeout(accept, 5));
    });
    expect(mocks.purchase).toHaveBeenCalledTimes(1);
    expect(hasAccess(value.entitlement, mocks.owner)).toBe(false);
    await act(async () => {
      resolve(status("active"));
      await pending;
    });
    expect(hasAccess(value.entitlement, mocks.owner)).toBe(true);
  });
  it("discards a delayed access response from the previous account", async () => {
    const old = mocks.owner;
    let resolve!: (result: ReturnType<typeof status>) => void;
    mocks.invoke.mockImplementationOnce(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    await render();
    mocks.owner = "10000000-0000-4000-8000-000000000002";
    await render();
    await settle();
    await act(async () => {
      resolve(status("active", old));
      await Promise.resolve();
    });
    expect(value.entitlement?.userId).toBe(mocks.owner);
    expect(hasAccess(value.entitlement, mocks.owner)).toBe(false);
  });
  it("keeps access closed when restore succeeds but backend verification fails", async () => {
    await render();
    await settle();
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("offline") });
    await act(async () => value.restore());
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(hasAccess(value.entitlement, mocks.owner)).toBe(false);
    expect(value.error).toMatch(/potwierdzić/);
  });
  it("refuses an unexpected three-day free offer", async () => {
    mocks.offerings.mockResolvedValue(offering("P3D"));
    await render();
    await settle();
    expect(value.offer).toBeNull();
    expect(value.eligibleTrial).toBe(false);
    expect(value.error).toMatch(/aktualizacji/);
  });
  it("keeps StoreKit identity fixed until the pending purchase ends and releases the new account", async () => {
    await render();
    await settle();
    let finish!: () => void;
    mocks.purchase.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = value.purchase();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    mocks.owner = "10000000-0000-4000-8000-000000000002";
    await render();
    await settle();
    expect(mocks.configure.mock.calls.some(([arg]) => arg.appUserID === mocks.owner)).toBe(false);
    expect(value.busy).toBe(true);
    await act(async () => {
      finish();
      await pending;
    });
    await settle();
    expect(value.busy).toBe(false);
    expect(value.offer).not.toBeNull();
    expect(mocks.configure.mock.calls.some(([arg]) => arg.appUserID === mocks.owner)).toBe(true);
    expect(hasAccess(value.entitlement, mocks.owner)).toBe(false);
  });
});
