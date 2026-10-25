import { Capacitor } from "@capacitor/core";
import { billingEnforced, useBilling } from "./BillingProvider";
export function SubscriptionSettings() {
  const billing = useBilling();
  if (!billingEnforced) return null;
  const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  const labels = {
    trialing: "Okres próbny",
    active: "Aktywna",
    grace: "Okres ochronny płatności",
    expired: "Wygasła",
    no_subscription: "Brak aktywnej subskrypcji",
  };
  return (
    <section className="soft-card space-y-3 p-4">
      <h2 className="font-semibold">Subskrypcja BallWise</h2>
      <p>
        {billing.entitlement ? labels[billing.entitlement.status] : "Stan wymaga potwierdzenia"}
        {billing.entitlement?.expiresAt &&
          ` · dostęp do ${new Date(billing.entitlement.expiresAt).toLocaleString("pl-PL")}`}
      </p>
      {billing.error && (
        <p role="alert" className="text-sm">
          {billing.error}
        </p>
      )}
      {native ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-xl border px-3"
          disabled={billing.busy}
          onClick={() => void billing.restore()}
        >
          Przywróć zakupy
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Przywracanie zakupów nie jest dostępne w przeglądarce.
        </p>
      )}
      <a
        className="block min-h-11 pt-3 text-center underline"
        href="https://apps.apple.com/account/subscriptions"
        target="_blank"
        rel="noreferrer"
      >
        Zarządzaj subskrypcją Apple
      </a>
      <p className="text-xs text-muted-foreground">
        Anulowaniem i płatnościami zarządza Apple. Usunięcie konta BallWise nie anuluje subskrypcji.
      </p>
    </section>
  );
}
