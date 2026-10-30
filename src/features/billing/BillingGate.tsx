import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { selectEffectivePlan } from "@/lib/loadwise/effectivePlanSelector";
import { billingEnforced, useBilling } from "./BillingProvider";
import { hasAccess } from "./model";
import { activeSessionForRoute } from "@/lib/loadwise/activeSession";
const paidPaths = ["/start", "/plan", "/fuel", "/lab", "/football-iq", "/reakcja"];
export function BillingGate({ children }: { children: ReactNode }) {
  const { user } = useAuth(),
    billing = useBilling();
  const { state, todayIso, hydrated } = useLoadwise();
  const location = useRouterState({ select: (s) => s.location });
  const nativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  const path = location.pathname;
  const protectedPath = paidPaths.includes(path) || path.startsWith("/sesja/");
  if (
    !billingEnforced ||
    !user ||
    !protectedPath ||
    !hydrated ||
    !state.profile?.onboardingComplete
  )
    return children;
  if (hasAccess(billing.entitlement, user.id, billing.now)) return children;
  // Expiration must never erase or interrupt an already-started workout. Other paid
  // entry points stay gated; pending writes sync in LoadwiseProvider independently.
  const requested = /^\/sesja\/(\d{4}-\d{2}-\d{2})$/.exec(path)?.[1];
  if (requested) {
    const plan = selectEffectivePlan(state.plan, state.modifications, {
      profile: state.profile,
      readiness: state.readiness,
      completions: state.completions,
    });
    const search = location.search as { slot?: number | string };
    const slot = String(search.slot ?? "1");
    if (
      (slot === "1" || slot === "2") &&
      activeSessionForRoute(plan, state.completions, requested, slot === "2" ? 2 : 1, todayIso)
    )
      return children;
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 p-6">
      <h1 className="text-3xl font-semibold">BallWise Pro</h1>
      <p>Plan treningowy, sesje, Football IQ, Fuel i Lab w jednym miejscu.</p>
      {billing.loading ? (
        <p role="status">Sprawdzamy Twój dostęp…</p>
      ) : nativeIOS && billing.offer ? (
        <>
          <p className="text-xl font-semibold">{billing.offer.product.priceString} / miesiąc</p>
          {billing.eligibleTrial && (
            <p>
              7 dni bez opłaty, następnie {billing.offer.product.priceString} miesięcznie. Termin
              pierwszej opłaty potwierdzi Apple przed zakupem.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Subskrypcja odnawia się automatycznie do anulowania w ustawieniach Apple. Oferta próbna
            jest dostępna dla osób zakwalifikowanych przez sklep.
          </p>
          <button
            className="rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
            disabled={billing.busy || !billing.reachable}
            onClick={() => void billing.purchase()}
          >
            {billing.busy
              ? "Trwa operacja…"
              : billing.eligibleTrial
                ? "Rozpocznij 7 dni próby"
                : "Kup subskrypcję"}
          </button>
        </>
      ) : nativeIOS ? (
        <p role="status">Oferta subskrypcji jest chwilowo niedostępna. Spróbuj ponownie później.</p>
      ) : (
        <p>
          Zakup subskrypcji nie jest dostępny w przeglądarce. Jeśli masz już subskrypcję, zaloguj
          się na konto użyte przy zakupie i sprawdź dostęp ponownie.
        </p>
      )}
      {billing.error && (
        <p role="alert" className="rounded-xl border p-3">
          {billing.error}
        </p>
      )}
      {nativeIOS && (
        <button
          className="rounded-xl border p-3"
          disabled={billing.busy}
          onClick={() => void billing.restore()}
        >
          Przywróć zakupy
        </button>
      )}
      <button
        className="rounded-xl border p-3"
        disabled={billing.busy}
        onClick={() => void billing.refresh()}
      >
        Sprawdź dostęp ponownie
      </button>
      <a
        className="underline"
        href="https://apps.apple.com/account/subscriptions"
        target="_blank"
        rel="noreferrer"
      >
        Zarządzaj subskrypcją Apple
      </a>
      <div className="flex flex-wrap gap-4 text-sm underline">
        <Link to="/postep">Moja historia</Link>
        <Link to="/data-rights">Eksport i usunięcie konta</Link>
        <Link to="/profil">Konto</Link>
        <Link to="/terms">Regulamin</Link>
        <Link to="/privacy-policy">Prywatność</Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Usunięcie konta BallWise nie anuluje subskrypcji Apple. Zakupami zarządzasz w swoim koncie
        Apple.
      </p>
    </main>
  );
}
