// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import type { Entitlement } from "./model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: true,
  billing: {
    entitlement: null as Entitlement | null,
    now: Date.parse("2026-10-22T12:00:00Z"),
    loading: false,
    busy: false,
    error: null as string | null,
    offer: null as PurchasesPackage | null,
    eligibleTrial: false,
    reachable: true,
    refresh: vi.fn(),
    purchase: vi.fn(),
    restore: vi.fn(),
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => "ios" },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useRouterState: () => ({ pathname: "/start", search: {} }),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { profile: { onboardingComplete: true } },
    todayIso: "2026-10-22",
    hydrated: true,
  }),
}));
vi.mock("./BillingProvider", () => ({
  billingEnforced: true,
  useBilling: () => mocks.billing,
}));
import { BillingGate } from "./BillingGate";
import { SubscriptionSettings } from "./SubscriptionSettings";

let host: HTMLDivElement, root: Root;
const offer = { product: { priceString: "49,99 zł" } } as PurchasesPackage;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.native = true;
  Object.assign(mocks.billing, {
    entitlement: null,
    loading: false,
    busy: false,
    error: null,
    offer: null,
    eligibleTrial: false,
    reachable: true,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function renderGate() {
  await act(async () =>
    root.render(
      <BillingGate>
        <p>Dostępny plan</p>
      </BillingGate>,
    ),
  );
}
function button(label: string) {
  return Array.from(host.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  );
}

describe("billing controls match the device and current offer", () => {
  it("explains a missing native offer without instructing an iPhone owner to change devices", async () => {
    mocks.billing.error = "Nie udało się pobrać oferty Apple. Spróbuj ponownie.";
    await renderGate();
    expect(host.querySelector('[role="status"]')?.textContent).toContain("chwilowo niedostępna");
    expect(host.textContent).not.toMatch(/iPhon|przeglądar|konfiguracj|natywn/i);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się pobrać");
    expect(button("Kup subskrypcję")).toBeUndefined();
    const restore = button("Przywróć zakupy")!;
    expect(restore.disabled).toBe(false);
    await act(async () => restore.click());
    expect(mocks.billing.restore).toHaveBeenCalledOnce();
  });

  it("offers a real access refresh in the browser instead of a restore button that cannot work", async () => {
    mocks.native = false;
    await renderGate();
    expect(host.textContent).toContain("Zakup subskrypcji nie jest dostępny w przeglądarce");
    expect(button("Przywróć zakupy")).toBeUndefined();
    await act(async () => button("Sprawdź dostęp ponownie")!.click());
    expect(mocks.billing.refresh).toHaveBeenCalledOnce();
    expect(mocks.billing.restore).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "keeps the actual price and trial eligibility on native purchase (%s)",
    async (eligible) => {
      mocks.billing.offer = offer;
      mocks.billing.eligibleTrial = eligible;
      await renderGate();
      expect(host.textContent).toContain("49,99 zł / miesiąc");
      expect(host.textContent).toContain("Subskrypcja odnawia się automatycznie");
      expect(host.textContent?.includes("7 dni bez opłaty")).toBe(eligible);
      const purchase = button(eligible ? "Rozpocznij 7 dni próby" : "Kup subskrypcję")!;
      expect(purchase.disabled).toBe(false);
      await act(async () => purchase.click());
      expect(mocks.billing.purchase).toHaveBeenCalledOnce();
    },
  );

  it("never exposes a browser purchase even if an offer is present", async () => {
    mocks.native = false;
    mocks.billing.offer = offer;
    mocks.billing.eligibleTrial = true;
    await renderGate();
    expect(button("Rozpocznij 7 dni próby")).toBeUndefined();
    expect(button("Kup subskrypcję")).toBeUndefined();
    expect(button("Przywróć zakupy")).toBeUndefined();
    expect(host.textContent).not.toContain("49,99 zł");
  });

  it("keeps native purchase, restore and refresh disabled during a transaction", async () => {
    mocks.billing.offer = offer;
    mocks.billing.busy = true;
    await renderGate();
    expect(button("Trwa operacja…")?.disabled).toBe(true);
    expect(button("Przywróć zakupy")?.disabled).toBe(true);
    expect(button("Sprawdź dostęp ponownie")?.disabled).toBe(true);
  });

  it("keeps purchase closed while access cannot be verified", async () => {
    mocks.billing.offer = offer;
    mocks.billing.reachable = false;
    await renderGate();
    expect(button("Kup subskrypcję")?.disabled).toBe(true);
    expect(button("Przywróć zakupy")?.disabled).toBe(false);
  });

  it("continues granting a verified owner's access in the browser", async () => {
    mocks.native = false;
    mocks.billing.entitlement = {
      userId: "owner",
      status: "active",
      verifiedAt: "2026-10-22T12:00:00Z",
      expiresAt: "2026-11-22T12:00:00Z",
    };
    await renderGate();
    expect(host.textContent).toBe("Dostępny plan");
  });

  it("keeps restoring available in native subscription settings", async () => {
    await act(async () => root.render(<SubscriptionSettings />));
    const restore = button("Przywróć zakupy")!;
    expect(restore.disabled).toBe(false);
    await act(async () => restore.click());
    expect(mocks.billing.restore).toHaveBeenCalledOnce();
  });

  it("shows browser limitations in settings without a nonfunctional restore control", async () => {
    mocks.native = false;
    await act(async () => root.render(<SubscriptionSettings />));
    expect(button("Przywróć zakupy")).toBeUndefined();
    expect(host.textContent).toContain("Przywracanie zakupów nie jest dostępne w przeglądarce");
    expect(host.textContent).not.toMatch(/iPhone|konfiguracj|natywn/i);
  });
});
