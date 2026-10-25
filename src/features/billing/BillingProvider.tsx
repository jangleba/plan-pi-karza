import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { useAuth } from "@/lib/loadwise/auth";
import { supabase } from "@/integrations/supabase/client";
import { hasAccess, parseEntitlement, sevenDayTrial, type Entitlement } from "./model";
const env = import.meta.env;
export const billingEnforced = env.VITE_BILLING_ENFORCED === "true";
const publicKey = String(env.VITE_REVENUECAT_IOS_PUBLIC_KEY ?? "").trim();
const productId = String(env.VITE_REVENUECAT_PRODUCT_ID ?? "").trim();
const nativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
const cacheKey = (id: string) => `ballwise:billing:v1:${id}`;
let sdkUser: string | null = null,
  serial: Promise<unknown> = Promise.resolve();
type PurchasesSDK = (typeof import("@revenuecat/purchases-capacitor"))["Purchases"];
async function withPurchases<T>(userId: string, action: (sdk: PurchasesSDK) => Promise<T>) {
  const next = serial
    .catch(() => undefined)
    .then(async () => {
      if (!nativeIOS() || !publicKey)
        throw new Error("Zakupy są dostępne w skonfigurowanej aplikacji iPhone.");
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      if (!(await Purchases.isConfigured()).isConfigured)
        await Purchases.configure({ apiKey: publicKey, appUserID: userId });
      else if (sdkUser !== userId) await Purchases.logIn({ appUserID: userId });
      sdkUser = userId;
      return action(Purchases);
    });
  serial = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
interface BillingContextValue {
  entitlement: Entitlement | null;
  now: number;
  loading: boolean;
  busy: boolean;
  error: string | null;
  offer: PurchasesPackage | null;
  eligibleTrial: boolean;
  reachable: boolean;
  refresh: () => Promise<void>;
  purchase: () => Promise<void>;
  restore: () => Promise<void>;
}
const Context = createContext<BillingContextValue | null>(null);
export function BillingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(),
    owner = user?.id;
  const active = useRef(owner);
  active.current = owner;
  const [now, setNow] = useState(Date.now);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null),
    [loading, setLoading] = useState(billingEnforced),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [offer, setOffer] = useState<PurchasesPackage | null>(null),
    [eligibleTrial, setEligibleTrial] = useState(false),
    [reachable, setReachable] = useState(false);
  const lastCheck = useRef(0),
    request = useRef(0),
    purchaseInFlight = useRef(false);
  const invalidatePendingRequests = useCallback(() => {
    request.current++;
  }, []);
  const refresh = useCallback(async () => {
    if (!owner || !billingEnforced) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setReachable(false);
      setLoading(false);
      return;
    }
    const revision = ++request.current;
    lastCheck.current = Date.now();
    try {
      const { data, error: failure } = await supabase.functions.invoke("billing-status", {
        body: {},
        timeout: 15_000,
      });
      if (failure)
        throw new Error(
          "Nie udało się potwierdzić subskrypcji. Sprawdź połączenie i spróbuj ponownie.",
        );
      const value = parseEntitlement(data, owner);
      if (active.current !== owner || request.current !== revision) return;
      setEntitlement(value);
      setReachable(true);
      setError(null);
      try {
        localStorage.setItem(cacheKey(owner), JSON.stringify(value));
      } catch {
        /* No cache means online verification remains required. */
      }
    } catch (e) {
      if (active.current === owner && request.current === revision) {
        setReachable(false);
        setError(e instanceof Error ? e.message : "Subskrypcje są chwilowo niedostępne.");
      }
    } finally {
      if (active.current === owner && request.current === revision) setLoading(false);
    }
  }, [owner]);
  useEffect(() => {
    setOffer(null);
    setEligibleTrial(false);
    setEntitlement(null);
    setReachable(false);
    setError(null);
    setBusy(purchaseInFlight.current);
    setLoading(!!owner && billingEnforced);
    request.current++;
    if (!owner || !billingEnforced) {
      setLoading(false);
      return;
    }
    try {
      const raw = localStorage.getItem(cacheKey(owner));
      if (raw) {
        const value = parseEntitlement(JSON.parse(raw), owner);
        if (hasAccess(value, owner)) setEntitlement(value);
      }
    } catch {
      /* invalid cached claims never grant new access */
    }
    void refresh();
    if (nativeIOS() && publicKey && productId) {
      void (async () => {
        const result = await withPurchases(owner, async (sdk) => {
          const offerings = await sdk.getOfferings();
          const selected =
            offerings.current?.availablePackages.find(
              (p) => p.product.identifier === productId && p.product.subscriptionPeriod === "P1M",
            ) ?? null;
          if (!selected) return null;
          const eligibility = await sdk.checkTrialOrIntroductoryPriceEligibility({
            productIdentifiers: [productId],
          });
          return { selected, eligible: eligibility[productId]?.status === 2 };
        });
        if (active.current !== owner) return;
        if (!result) {
          setError("Oferta sklepu jest chwilowo niedostępna. Spróbuj ponownie później.");
          return;
        }
        const { selected, eligible } = result;
        // Do not sell an unexpected free period while advertising seven days.
        if (
          selected.product.introPrice?.price === 0 &&
          !sevenDayTrial(selected.product.introPrice)
        ) {
          setError("Oferta próbna wymaga aktualizacji. Zakup jest chwilowo niedostępny.");
          return;
        }
        setOffer(selected);
        setEligibleTrial(eligible && sevenDayTrial(selected.product.introPrice));
        // SDK registration must finish before a first-time subscriber is verified.
        void refresh();
      })().catch(() => {
        if (active.current === owner)
          setError("Nie udało się pobrać oferty Apple. Spróbuj ponownie.");
      });
    }
    return invalidatePendingRequests;
  }, [owner, refresh, invalidatePendingRequests]);
  useEffect(() => {
    if (!owner || !billingEnforced) return;
    const check = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > 60_000)
        void refresh();
    };
    const timer = setInterval(check, 30_000);
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [owner, refresh]);
  useEffect(() => {
    if (!entitlement) return;
    const deadline = Math.min(
      Date.parse(entitlement.expiresAt ?? ""),
      Date.parse(entitlement.verifiedAt) + 24 * 3600000,
    );
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(deadline - Date.now() + 1, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [entitlement]);
  const transact = async (restore: boolean) => {
    if (!owner || purchaseInFlight.current || !nativeIOS()) return;
    if (!restore && (!offer || !reachable)) return;
    purchaseInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const completed = await withPurchases(owner, async (sdk) => {
        if (active.current !== owner) return false;
        if (restore) await sdk.restorePurchases();
        else await sdk.purchasePackage({ aPackage: offer! });
        return true;
      });
      if (completed && active.current === owner) await refresh();
    } catch (e) {
      if (active.current !== owner) return;
      const row = e && typeof e === "object" ? (e as Record<string, unknown>) : {};
      setError(
        row.userCancelled === true || String(row.code) === "1"
          ? "Zakup anulowany. Nie nadano nowego dostępu."
          : String(row.code) === "20"
            ? "Zakup oczekuje na zatwierdzenie. Dostęp pojawi się po potwierdzeniu przez Apple."
            : "Nie udało się zakończyć operacji. Możesz bezpiecznie spróbować ponownie.",
      );
    } finally {
      purchaseInFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{
        entitlement,
        now,
        loading,
        busy,
        error,
        offer,
        eligibleTrial,
        reachable,
        refresh,
        purchase: () => transact(false),
        restore: () => transact(true),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useBilling() {
  const value = useContext(Context);
  if (!value) throw new Error("BillingProvider missing");
  return value;
}
