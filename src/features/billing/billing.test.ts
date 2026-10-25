import { describe, it, expect, vi } from "vitest";
import { hasAccess, parseEntitlement, sevenDayTrial } from "./model";
import {
  createBillingStatusHandler,
  createBillingWebhookHandler,
  revenueCatEntitlement,
  deletedBillingOwner,
  type BillingDependencies,
  type VerifiedEntitlement,
} from "../../../supabase/functions/_shared/billing/handler";
import { paidApiDecision } from "../../../supabase/functions/_shared/billing/paidApi";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const now = "2026-10-18T12:00:00Z",
  expiry = "2026-10-25T12:00:00Z";
const products = new Set(["monthly"]);
const provider = (overrides: Record<string, unknown> = {}) => ({
  request_date: now,
  subscriber: {
    entitlements: { pro: { product_identifier: "monthly", expires_date: expiry } },
    subscriptions: { monthly: { period_type: "trial", ...overrides } },
  },
});
const entitlement = () => revenueCatEntitlement(owner, provider(), "pro", products);
const deps = (overrides: Partial<BillingDependencies> = {}): BillingDependencies => ({
  enabled: true,
  webhookSecret: "a".repeat(40),
  allowedOrigins: new Set(["capacitor://localhost"]),
  authenticate: async () => owner,
  lookup: async () => entitlement(),
  commit: async () => undefined,
  ...overrides,
});
const webhook = (event: Record<string, unknown>, token = "a".repeat(40)) =>
  new Request("https://billing.test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
describe("verified billing contract", () => {
  it("fails closed for paid network services while preserving development preview", () => {
    const time = Date.parse(now),
      row = { status: "trialing", expires_at: expiry, verified_at: now };
    expect(paidApiDecision(true, row, false, time)).toBe("ok");
    expect(paidApiDecision(true, { ...row, status: "expired" }, false, time)).toBe("subscription");
    expect(paidApiDecision(true, null, false, time)).toBe("subscription");
    expect(paidApiDecision(true, row, true, time)).toBe("unavailable");
    expect(paidApiDecision(false, null, true, time)).toBe("ok");
    expect(paidApiDecision(true, row, false, time + 25 * 3600000)).toBe("subscription");
  });
  it("acknowledges delayed owner webhooks without masking unrelated database failures", () => {
    expect(
      deletedBillingOwner({
        code: "23503",
        message: 'violates foreign key constraint "billing_entitlements_user_id_fkey"',
      }),
    ).toBe(true);
    expect(deletedBillingOwner({ code: "23503", message: "other_reference_fkey" })).toBe(false);
    expect(
      deletedBillingOwner({ code: "42501", message: "billing_entitlements_user_id_fkey" }),
    ).toBe(false);
  });
  it("does not grant a signup trial or accept another owner/cache past its validity", () => {
    expect(hasAccess(null, owner, Date.parse(now))).toBe(false);
    expect(hasAccess(entitlement(), other, Date.parse(now))).toBe(false);
    expect(hasAccess(entitlement(), owner, Date.parse(now) + 25 * 3600000)).toBe(false);
    expect(hasAccess(entitlement(), owner, Date.parse(now))).toBe(true);
    expect(() => parseEntitlement({ ...entitlement(), userId: other }, owner)).toThrow();
  });
  it("advertises only an eligible seven-day zero-price single-cycle offer", () => {
    expect(sevenDayTrial({ price: 0, period: "P1W", cycles: 1 })).toBe(true);
    expect(sevenDayTrial({ price: 0, period: "P3D", cycles: 1 })).toBe(false);
    expect(sevenDayTrial({ price: 1, period: "P1W", cycles: 1 })).toBe(false);
  });
  it("uses verified provider expiry, refund and grace instead of webhook claims", () => {
    expect(entitlement().status).toBe("trialing");
    expect(
      revenueCatEntitlement(
        owner,
        provider({ period_type: "normal", unsubscribe_detected_at: now }),
        "pro",
        products,
      ).status,
    ).toBe("active");
    expect(
      revenueCatEntitlement(owner, provider({ refunded_at: now }), "pro", products).status,
    ).toBe("expired");
    const data = provider({ grace_period_expires_date: expiry });
    data.subscriber.entitlements.pro.expires_date = "2026-10-17T12:00:00Z";
    expect(revenueCatEntitlement(owner, data, "pro", products).status).toBe("grace");
    expect(revenueCatEntitlement(owner, provider(), "pro", new Set(["other-product"])).status).toBe(
      "no_subscription",
    );
  });
  it("authenticates status and refuses third-party origins without calling provider", async () => {
    const lookup = vi.fn(async () => entitlement());
    const handler = createBillingStatusHandler(deps({ lookup, authenticate: async () => null }));
    expect((await handler(new Request("https://a.test", { method: "POST" }))).status).toBe(401);
    expect(
      (
        await handler(
          new Request("https://a.test", {
            method: "POST",
            headers: { Origin: "https://other.test" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("never accepts an unauthenticated webhook or acknowledges failed persistence", async () => {
    const commit = vi.fn(async () => {
      throw new Error("db unavailable");
    });
    const handler = createBillingWebhookHandler(deps({ commit }));
    expect((await handler(webhook({ id: "e", app_user_id: owner }, "wrong"))).status).toBe(401);
    expect((await handler(webhook({ id: "e", app_user_id: owner }))).status).toBe(503);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  it("refreshes both transfer sides and supplies the same event key for safe retry", async () => {
    const lookup = vi.fn(async (userId: string) => ({ ...entitlement(), userId })),
      commit = vi.fn(async (_value: VerifiedEntitlement, _eventId: string | null) => undefined);
    const handler = createBillingWebhookHandler(deps({ lookup, commit }));
    const event = {
      id: "transfer",
      type: "TRANSFER",
      transferred_from: [owner],
      transferred_to: [other],
    };
    expect((await handler(webhook(event))).status).toBe(200);
    expect((await handler(webhook(event))).status).toBe(200);
    expect(lookup.mock.calls.map((c) => c[0])).toEqual([owner, other, owner, other]);
    expect(commit.mock.calls.every((c) => c[1] === "transfer")).toBe(true);
  });
  it("a delayed renewal cannot grant access from the webhook event contents", async () => {
    const commit = vi.fn(async (_value: VerifiedEntitlement, _eventId: string | null) => undefined);
    const handler = createBillingWebhookHandler(
      deps({
        lookup: async () => ({ ...entitlement(), status: "expired", expiresAt: null }),
        commit,
      }),
    );
    await handler(
      webhook({
        id: "old-renewal",
        type: "RENEWAL",
        app_user_id: owner,
        expiration_at_ms: Date.parse(expiry),
      }),
    );
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired", expiresAt: null }),
      "old-renewal",
    );
  });
});
