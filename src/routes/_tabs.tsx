import { AppRouteWarmup } from "@/components/loadwise/AppRouteWarmup";
import { TrainingSyncStatus } from "@/components/loadwise/TrainingSyncStatus";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { BottomNav } from "@/components/loadwise/BottomNav";
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";
import { AppDataError } from "@/components/loadwise/AppDataError";
import { LegalReconsentGate } from "@/components/loadwise/LegalReconsentGate";

export const Route = createFileRoute("/_tabs")({
  component: TabsLayout,
});

function TabsLayout() {
  const { user, loading } = useAuth();
  const { hydrated, syncing, hydrationError, todayIso, state, refreshPlanIfNeeded } = useLoadwise();
  const navigate = useNavigate();

  // Protect: must be signed in.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, navigate]);

  // Redirect to onboarding if profile is incomplete.
  useEffect(() => {
    if (loading || !user || !hydrated || hydrationError) return;
    if (!state.profile?.onboardingComplete) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, user, hydrated, state.profile?.onboardingComplete, hydrationError, navigate]);

  useEffect(() => {
    if (hydrated && !syncing && !hydrationError && state.profile?.onboardingComplete) {
      refreshPlanIfNeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, syncing, hydrationError, todayIso]);

  if (hydrationError && !state.profile?.onboardingComplete) return <AppDataError />;

  if (loading || !user || !hydrated || !state.profile?.onboardingComplete) {
    return <AppLaunchScreen />;
  }

  return (
    <LegalReconsentGate>
      <div
        className="app-shell relative min-h-screen"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <AppRouteWarmup />
        <TrainingSyncStatus />
        <Outlet />
        <BottomNav />
      </div>
    </LegalReconsentGate>
  );
}
